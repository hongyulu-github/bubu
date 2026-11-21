<script lang="ts">
	import { fade } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { Table, TableBody, TableHead, TableHeadCell } from 'flowbite-svelte';
	import Button from '../components/Button.svelte';
	import Icon from '../components/Icon.svelte';
	import { calculateBudget } from '../budget/calculate';
	import { createItem, type Item } from '../budget/model';
	import { toString } from '../budget/numbers';
	import { buildItemTree } from '../budget/tree';
	import type { BudgetTemplate } from '../templates/templates';
	import type { DemoMove } from './showcase-demo';

	let {
		template,
		onuse,
		amounts,
		move,
		reducedMotion = prefersReducedMotion.current
	}: {
		template: BudgetTemplate;
		/** Asked to open this template; the opening flow is wired by the page, not here. */
		onuse: (templateId: string) => void;
		/** Example [Unit price, Quantity] per Line, by Item id, shown instead of the template's zeros. Display only. */
		amounts?: Readonly<Record<string, readonly [string, string]>>;
		/** One drag and drop to act out after the roll-up. Display only: the template is never changed. */
		move?: DemoMove;
		/** Show everything at once and never animate. Defaults to the user's setting. */
		reducedMotion?: boolean;
	} = $props();

	// Read-only: everything below is a display copy of the template; nothing is edited, stored or written back.
	const base = $derived<Item[]>(
		template.items.map((item) => {
			const example = amounts?.[item.id];
			return createItem({ ...item, budgetId: template.id, ...(example ? { unitPrice: example[0], quantity: example[1] } : {}) });
		})
	);

	// The timeline, one tick at a time: reveal each Item, then each Group lights up with the Items it adds up (innermost
	// first), then one Item is dragged to a new place. Then the timeline starts over from the original order.
	const TICK = 140;
	const HOLD = 7; // ticks each Group stays lit
	const LIFT = 3; // ticks before the dragged Item starts to move
	const DROP = 12; // tick at which it lands
	const AFTER_DROP = 8; // ticks to admire the result
	const animated = $derived(!reducedMotion);
	let ticks = $state(0);

	// Lazy: the animation is expensive, so it only runs while the showcase is on screen, from the start each time it comes
	// into view. Nothing is drawn or timed before the first time.
	let visible = $state(false);
	let seen = $state(false);
	function observe(node: HTMLElement) {
		const observer = new IntersectionObserver(([entry]) => {
			visible = entry.isIntersecting;
			if (visible) seen = true;
		});
		observer.observe(node);
		return () => observer.disconnect();
	}

	const revealCount = $derived(base.length);
	const shown = $derived(animated ? (seen ? Math.min(ticks, revealCount) : 0) : revealCount);
	const groupCount = $derived(new Set(base.map((item) => item.parentId).filter((id) => id !== null)).size);
	const rollLength = $derived(groupCount * HOLD);
	const dragLength = $derived(move ? DROP + AFTER_DROP : 0);
	const local = $derived(animated && ticks >= revealCount ? (ticks - revealCount) % Math.max(1, rollLength + dragLength) : -1);
	const drag = $derived(move && local >= rollLength ? local - rollLength : -1); // ticks into the drag, or -1
	const moved = $derived(drag >= DROP);

	const items = $derived.by(() => {
		if (!moved || !move) return base;
		const anchor = base.find((item) => item.id === move.afterId)!;
		return base.map((item) => (item.id === move.itemId ? { ...item, parentId: move.intoId, sortIndex: anchor.sortIndex + 0.5 } : item));
	});
	const tree = $derived(buildItemTree(items));
	const totals = $derived(calculateBudget(items));
	const rows = $derived(tree.ordered);
	const groups = $derived(rows.filter((node) => node.kind === 'group').sort((a, b) => b.depth - a.depth));
	const rolling = $derived(local >= 0 && local < rollLength && groups.length > 0 ? groups[Math.floor(local / HOLD) % groups.length].item.id : null);

	$effect(() => {
		if (!animated || !visible) return;
		ticks = 0;
		const timer = setInterval(() => (ticks += 1), TICK);
		return () => clearInterval(timer);
	});

	// While the rows are being generated, follow the newest one down the page, unless the reader scrolls for themselves.
	let reading = false;
	$effect(() => {
		if (!animated || !visible) return;
		reading = false;
		const stop = () => (reading = true);
		const events = ['wheel', 'touchmove', 'keydown'] as const;
		for (const name of events) window.addEventListener(name, stop, { passive: true });
		return () => events.forEach((name) => window.removeEventListener(name, stop));
	});
	$effect(() => {
		if (!animated || !visible || reading || shown === 0) return;
		rowEls[rows[shown - 1].item.id]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	// The dragged copy of the row and the line showing where it will land, placed over the table by measuring its rows.
	let frame: HTMLElement | undefined = $state();
	let rowEls: Record<string, HTMLElement | undefined> = $state({});
	const edge = (id: string, side: 'top' | 'bottom') => {
		const row = rowEls[id]?.getBoundingClientRect();
		const outer = frame?.getBoundingClientRect();
		return row && outer ? (side === 'top' ? row.top : row.bottom) - outer.top : 0;
	};
	const dragging = $derived(move && drag >= 0 && drag < DROP);
	const ghostTop = $derived(move && dragging ? (drag < LIFT ? edge(move.itemId, 'top') : edge(move.afterId, 'bottom') - 4) : 0);
	const dropTop = $derived(move && dragging && drag >= LIFT ? edge(move.afterId, 'bottom') : 0);
	const dragged = $derived(move ? base.find((item) => item.id === move.itemId) : undefined);

	const money = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	const price = (value: string) => money.format(Number(value));
</script>

<article aria-labelledby="{template.id}-showcase-title" class="flex flex-col gap-4">
	<div class="flex items-center justify-between gap-4">
		<h3 id="{template.id}-showcase-title" class="text-xl font-semibold text-gray-900 dark:text-white">{template.name}</h3>
		<Button variant="primary" onclick={() => onuse(template.id)} aria-label="Use template: {template.name}" data-template-id={template.id}>Use template</Button>
	</div>

	<div class="relative" bind:this={frame} {@attach observe}>
		<Table aria-label="{template.name} template, read only">
			<TableHead>
				<TableHeadCell>Code</TableHeadCell>
				<TableHeadCell>Description</TableHeadCell>
				<TableHeadCell>Unit</TableHeadCell>
				<TableHeadCell class="text-end">Quantity</TableHeadCell>
				<TableHeadCell class="text-end">Unit price</TableHeadCell>
				<TableHeadCell class="text-end">Total</TableHeadCell>
			</TableHead>
			<TableBody>
				{#each rows.slice(0, shown) as node (node.item.id)}
					{@const sums = totals.amounts.get(node.item.id)!}
					{@const feeds = rolling !== null && node.parentId === rolling}
					{@const receives = rolling === node.item.id}
					{@const landed = moved && drag < DROP + 5 && move?.itemId === node.item.id}
					<tr
						bind:this={rowEls[node.item.id]}
						in:fade={{ duration: animated ? 250 : 0 }}
						class="border-b border-gray-200 dark:border-gray-700 {feeds || receives || landed ? 'bg-primary-100 dark:bg-primary-900/40' : ''} {dragging && move?.itemId === node.item.id ? 'opacity-40' : ''}"
						data-rolling={feeds ? 'feeds' : receives ? 'receives' : undefined}
						data-landed={landed ? '' : undefined}
					>
						<td class="px-4 py-2 tabular-nums text-gray-500 dark:text-gray-400">{node.code}</td>
						<td class="px-4 py-2 text-gray-900 dark:text-white {node.kind === 'group' ? 'font-semibold' : ''}" style="padding-inline-start: {1 + node.depth}rem">{node.item.description}</td>
						<td class="px-4 py-2 text-gray-500 dark:text-gray-400">{node.item.unit ?? ''}</td>
						<td class="px-4 py-2 text-end tabular-nums">{toString(sums.quantity)}</td>
						<td class="px-4 py-2 text-end tabular-nums">{price(toString(sums.unitPrice))}</td>
						<td class="px-4 py-2 text-end tabular-nums font-semibold">{price(toString(sums.total))}</td>
					</tr>
				{/each}
			</TableBody>
		</Table>

		{#if dragging && dragged}
			<div
				aria-hidden="true"
				data-drag-ghost
				class="pointer-events-none absolute inset-x-0 flex items-center gap-3 border border-primary-600 bg-white px-4 py-2 shadow-lg transition-[top] duration-1000 ease-in-out dark:bg-gray-800"
				style="top: {ghostTop}px"
			>
				<Icon name="more" size={16} />
				<span class="text-gray-900 dark:text-white">{dragged.description}</span>
			</div>
			{#if drag >= LIFT}
				<div aria-hidden="true" data-drop-line class="pointer-events-none absolute end-0 h-0.5 bg-primary-600" style="top: {dropTop}px; inset-inline-start: 2.5rem"></div>
			{/if}
		{/if}
	</div>
	{#if amounts}
		<p class="text-sm text-gray-500 dark:text-gray-400">Example amounts, for illustration only.</p>
	{/if}
</article>
