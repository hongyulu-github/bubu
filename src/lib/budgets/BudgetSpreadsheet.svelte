<script lang="ts">
	import { canEditField, type EditResult, type EditableField } from '../budget/edit';
	import {
		adjacentEditableCell,
		isEditableCell,
		moveCell,
		settleCell,
		COLUMNS,
		type Cell,
		type Column,
		type Direction
	} from '../budget/grid';
	import { formatAmount } from '../budget/currency';
	import { toString } from '../budget/numbers';
	import { guardMove } from '../budget/guard';
	import { DRAG_HANDLE, monitorRowDrops, rowDrag, type DropRequest } from '../editor/drag';
	import Icon from '../components/Icon.svelte';
	import IconButton from '../components/IconButton.svelte';
	import TableCell from '../components/TableCell.svelte';
	import type { BudgetRow } from '../state/budgets.svelte';
	import ItemCellEditor from './ItemCellEditor.svelte';

	interface Props {
		rows: readonly BudgetRow[];
		/** The Budget currency: monetary cells use its decimals (no symbol), rounded to its minor units for display only. */
		currency: string;
		/**
		 * Commit an edit. When omitted the table is read-only. Which cells are editable at all is
		 * decided here (see `canEditField`), not by the caller.
		 */
		onedit?: (itemId: string, field: EditableField, text: string) => EditResult;
		/** Add an Item directly after this one, under the same parent. Shows a row action when given. */
		onadd?: (siblingId: string) => void;
		/** Delete this Item (and anything beneath it). Shows a row action when given. */
		ondelete?: (itemId: string) => void;
		/** Add a child inside this Item (a Line becomes a Group). Shows a row action when given. */
		onaddchild?: (parentId: string) => void;
		/** Add a top-level Item. Shows the "New item" row at the end of the table when given. */
		onnewitem?: () => void;
		/** Ids of collapsed Groups, for the toggles' state. The caller passes only the rows to show. */
		collapsed?: ReadonlySet<string>;
		/** Collapse or expand a Group. Shows a toggle on every Group row when given. */
		ontoggle?: (groupId: string) => void;
		/**
		 * A row was dropped on another: which Item, onto which, and before, after or inside it. Makes
		 * every row draggable when given. Nothing here changes the Items; the caller accepts or ignores it.
		 */
		onmove?: (request: DropRequest) => void;
	}

	let { rows, currency, onedit, onadd, ondelete, onaddchild, onnewitem, collapsed = new Set<string>(), ontoggle, onmove }: Props = $props();

	// --- Keyboard: which cell is active, and whether it is being edited -----------------------------
	// Navigation focuses the cell itself; editing focuses the input inside it. Both are read from real
	// DOM focus, so clicking an input with the mouse works the same way. `rows` is only what is visible,
	// so collapsed descendants are skipped without any extra rule.
	let table: HTMLTableElement | undefined = $state();

	// The header row and the "New item" row stay put while the rows scroll between them. Their heights become
	// scroll padding so keyboard focus never lands underneath them, and scroll position drives the shadows.
	let headHeight = $state(0);
	let footHeight = $state(0);
	let scrolled = $state(false);
	let moreBelow = $state(false);
	let scroller: HTMLElement | undefined = $state();

	function measureScroll() {
		if (!scroller) return;
		scrolled = scroller.scrollTop > 0;
		moreBelow = Math.ceil(scroller.scrollTop + scroller.clientHeight) < scroller.scrollHeight;
	}

	$effect(() => {
		void rows.length; // rows added or removed change what is below
		void headHeight;
		void footHeight;
		measureScroll();
	});
	// The drop the pointer would make right now, while a row is being dragged. Cleared when the drag ends
	// (dropped, cancelled) and when the table goes away or stops accepting moves.
	let hover = $state.raw<DropRequest | null>(null);
	function follow(next: DropRequest | null) {
		const same = next === hover || (next && hover && next.dragId === hover.dragId && next.targetId === hover.targetId && next.intent === hover.intent);
		if (!same) hover = next;
	}
	$effect(() => {
		if (!onmove) return;
		const stop = monitorRowDrops(onmove, follow);
		return () => {
			stop();
			hover = null;
		};
	});

	/**
	 * Where to draw the drop marker: on one row, as a line above it, a line below it, a box around it, or
	 * a "not allowed" mark. Validity comes from the same guard the move itself goes through. A drop
	 * after a Group lands below its whole visible subtree, so the line is drawn on the subtree's last row
	 * at the Group's own indent.
	 */
	const indicator = $derived.by(() => {
		if (!hover) return null;
		const index = rows.findIndex((row) => row.id === hover!.targetId);
		if (index < 0) return null;
		const target = rows[index];
		const allowed = guardMove(
			rows.map((row) => row.item),
			{ itemId: hover.dragId, targetId: hover.targetId, intent: hover.intent }
		).ok;
		if (!allowed) return { rowId: target.id, kind: 'blocked', depth: target.depth } as const;
		if (hover.intent !== 'after') return { rowId: target.id, kind: hover.intent, depth: target.depth } as const;
		let end = index;
		while (rows[end + 1] && rows[end + 1].depth > target.depth) end++;
		// A line drawn under deeper rows steps back out to the Group's level: shown with an arrow.
		return { rowId: rows[end].id, kind: 'after', depth: target.depth, out: end > index } as const;
	});

	// For dragging: each row's ancestors, and whether it is the last visible row of its parent. Only
	// descendants can be hidden, so a row's ancestors are always among `rows`.
	const dragInfo = $derived.by(() => {
		const info = new Map<string, { ancestors: string[]; lastInGroup: boolean }>();
		const path: string[] = [];
		rows.forEach((row, index) => {
			path.length = row.depth;
			info.set(row.id, { ancestors: [...path], lastInGroup: row.depth > 0 && (rows[index + 1]?.depth ?? 0) < row.depth });
			path[row.depth] = row.id;
		});
		return info;
	});

	let active = $state.raw<(Cell & { index: number }) | null>(null);

	/** Attributes that make a data cell a focusable grid cell with a roving tab stop. */
	function cell(row: BudgetRow, column: Column) {
		const isTabStop = tabStop?.rowId === row.id && tabStop.column === column;
		return { tabindex: isTabStop ? 0 : -1, 'data-cell': `${row.id}|${column}` };
	}

	const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

	// The one cell that is a tab stop: the active cell, or the first Description if there is none yet.
	const tabStop = $derived.by<Cell | null>(() => {
		if (rows.length === 0) return null;
		const settled = active ? settleCell(rows, active, active.index) : null;
		return settled ?? { rowId: rows[0].id, column: 'description' };
	});

	function cellSelector(cell: Cell): string {
		return `[data-cell="${cell.rowId}|${cell.column}"]`;
	}

	function focusCell(cell: Cell) {
		table?.querySelector<HTMLElement>(cellSelector(cell))?.focus();
	}

	function startEditing(cell: Cell): boolean {
		const row = rows.find((candidate) => candidate.id === cell.rowId);
		if (!onedit || !row || !isEditableCell(row.kind, cell.column)) return false; // read-only never edits
		const input = table?.querySelector<HTMLElement>(cellSelector(cell))?.querySelector('input');
		if (!input) return false;
		input.focus();
		input.select();
		return true;
	}

	function cellOf(element: EventTarget | null): Cell | null {
		const td = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-cell]') : null;
		if (!td?.dataset.cell) return null;
		const [rowId, column] = td.dataset.cell.split('|');
		return COLUMNS.includes(column as Column) ? { rowId, column: column as Column } : null;
	}

	function onfocusin(event: FocusEvent) {
		const cell = cellOf(event.target);
		if (cell) active = { ...cell, index: rows.findIndex((row) => row.id === cell.rowId) };
	}

	/** Keys on a focused cell (not on an input inside it: typing there is editing, never navigation). */
	function onkeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const target = event.target as HTMLElement;
		const cell = target.matches('[data-cell]') ? cellOf(target) : null;
		if (!cell) return;

		if (event.key in ARROWS) {
			event.preventDefault();
			focusCell(moveCell(rows, cell, ARROWS[event.key]));
		} else if (event.key === 'Enter' || event.key === 'F2') {
			if (startEditing(cell)) event.preventDefault();
		}
	}

	/** Where to go after an edit ends in `cell`. Returns whether focus moved. */
	function navigateFrom(cell: Cell, action: 'down' | 'next' | 'previous' | 'cancel'): boolean {
		if (action === 'cancel') {
			focusCell(cell);
			return true;
		}
		const target =
			action === 'down' ? moveCell(rows, cell, 'down') : adjacentEditableCell(rows, cell, action === 'next' ? 1 : -1);
		if (!target) return false; // past the last or before the first editable cell: Tab leaves the grid
		focusCell(target);
		return true;
	}

	// If a re-render takes away the element that had focus (a row deleted, a cell turned read-only), put
	// focus back on the nearest cell instead of letting it fall to the page. Whether focus was inside the
	// grid is noted just before the DOM updates, so clicking elsewhere is never mistaken for a removal.
	let hadFocus = false;
	$effect.pre(() => {
		void rows;
		hadFocus = table?.contains(document.activeElement) ?? false;
	});
	$effect(() => {
		void rows;
		if (hadFocus && active && !table?.contains(document.activeElement)) {
			const cell = settleCell(rows, active, active.index);
			if (cell) focusCell(cell);
		}
		hadFocus = false;
	});
	const hasActions = $derived(onadd !== undefined || ondelete !== undefined || onaddchild !== undefined);
	const columnCount = $derived(6 + (hasActions ? 1 : 0));
</script>

<!--
	The derived rows. Code, Total and a Group's Unit price are computed, so their cells are marked
	read-only and hold no controls; the other cells are inputs when `onedit` is given. Read-only money
	is formatted in the Budget currency for display; inputs keep the exact value, and nothing here
	rounds what is stored or calculated.
-->
{#snippet editor(row: BudgetRow, field: EditableField, column: string, value: string)}
	{#if canEditField(row.kind, field)}
		<ItemCellEditor
			{field}
			label="{column} {row.code}"
			{value}
			oncommit={(text) => onedit!(row.id, field, text)}
			onnavigate={(action) => navigateFrom({ rowId: row.id, column: field }, action)}
		/>
	{/if}
{/snippet}

<div
	class="scroll"
	bind:this={scroller}
	onscroll={measureScroll}
	data-scrolled={scrolled ? '' : undefined}
	data-more-below={moreBelow ? '' : undefined}
	style:scroll-padding-top="{headHeight}px"
	style:scroll-padding-bottom="{footHeight}px"
>
	<table role="grid" aria-label="Budget Items" bind:this={table} {onfocusin} {onkeydown}>
		<colgroup>
			<col style="width: 9.5rem" />
			<col />
			<col style="width: 6.5rem" />
			<col style="width: 6.5rem" />
			<col style="width: 8rem" />
			<col style="width: 8rem" />
			{#if hasActions}<col style="width: 7.5rem" />{/if}
		</colgroup>
		<thead bind:clientHeight={headHeight}>
			<tr>
				<TableCell header scope="col">Code</TableCell>
				<TableCell header scope="col">Description</TableCell>
				<TableCell header scope="col" numeric>Quantity</TableCell>
				<TableCell header scope="col">Unit</TableCell>
				<TableCell header scope="col" numeric>Unit price</TableCell>
				<TableCell header scope="col" numeric>Total</TableCell>
				{#if hasActions}
					<TableCell header scope="col"><span class="visually-hidden">Actions</span></TableCell>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				{@const group = row.kind === 'group'}
				<tr
					data-kind={row.kind}
					data-code={row.code}
					data-item-id={row.id}
					data-depth={row.depth}
					data-section={group || row.depth > 0 ? '' : undefined}
					style:--row-tint={group ? `var(--tint-depth-${Math.min(row.depth, 2)})` : undefined}
					data-drop={indicator?.rowId === row.id ? indicator.kind : undefined}
					data-drop-out={indicator?.rowId === row.id && 'out' in indicator && indicator.out ? '' : undefined}
					style:--drop-depth={indicator?.rowId === row.id ? indicator.depth : undefined}
					{@attach onmove
						? rowDrag({
								id: row.id,
								depth: row.depth,
								expanded: group && !collapsed.has(row.id),
								...dragInfo.get(row.id)!
							})
						: undefined}
				>
					<TableCell readonly depth={row.depth} {...{ [DRAG_HANDLE]: '' }} {...cell(row, 'code')}>
						<div class="code-cell">
							{#if ontoggle}
								{#if group}
									{@const open = !collapsed.has(row.id)}
									<button
										type="button"
										class="toggle"
										aria-expanded={open}
										aria-label="{open ? 'Collapse' : 'Expand'} {row.code}"
										onclick={() => ontoggle(row.id)}
									>
										<span aria-hidden="true" class="chevron" class:open></span>
									</button>
								{:else}
									<span class="toggle-space" aria-hidden="true"></span>
								{/if}
							{/if}
							<span class="code">{row.code}</span>
						</div>
					</TableCell>
					<TableCell depth={row.depth} strong={group} {...cell(row, 'description')}>
						<div class="description">
							{#if onedit}
								{@render editor(row, 'description', 'Description', row.item.description)}
							{:else}
								{row.item.description}
							{/if}
						</div>
					</TableCell>
					<TableCell numeric {...cell(row, 'quantity')}>
						{#if onedit}
							{@render editor(row, 'quantity', 'Quantity', row.item.quantity)}
						{:else}
							{toString(row.amounts.quantity)}
						{/if}
					</TableCell>
					<TableCell {...cell(row, 'unit')}>
						{#if onedit}
							{@render editor(row, 'unit', 'Unit', row.item.unit ?? '')}
						{:else}
							{row.item.unit ?? ''}
						{/if}
					</TableCell>
					<TableCell numeric readonly={group} {...cell(row, 'unitPrice')}>
						{#if onedit && !group}
							{@render editor(row, 'unitPrice', 'Unit price', row.item.unitPrice)}
						{:else}
							{formatAmount(row.amounts.unitPrice, currency)}
						{/if}
					</TableCell>
					<TableCell numeric readonly strong {...cell(row, 'total')}>{formatAmount(row.amounts.total, currency)}</TableCell>
					{#if hasActions}
						<TableCell>
							<div class="actions">
								{#if onadd}
									<IconButton icon="addBelow" label="Add item below {row.code}" onclick={() => onadd(row.id)} />
								{/if}
								{#if onaddchild}
									<IconButton icon="addChild" label="Add child to {row.code}" onclick={() => onaddchild(row.id)} />
								{/if}
								{#if ondelete}
									<IconButton icon="trash" label="Delete {row.code}" destructive onclick={() => ondelete(row.id)} />
								{/if}
							</div>
						</TableCell>
					{/if}
				</tr>
			{/each}
		</tbody>
		<tfoot bind:clientHeight={footHeight}>
			{#if onnewitem}
				<tr class="new-row">
					<td colspan={columnCount}>
						<button type="button" class="new-item" data-add-item data-focus-fallback onclick={onnewitem}>
							<Icon name="plus" />
							<span>New item</span>
						</button>
					</td>
				</tr>
			{/if}
		</tfoot>
	</table>
</div>

<style>
	/* No box around the table: hairline row separators only (Apple lists and outline views). */
	/* The scroll area fills the space its parent gives it (the editor page: the rest of the window) and is
	   the only thing that scrolls. Header and footer rows are sticky inside it, so their columns are the
	   rows' own columns and cannot drift. */
	.scroll {
		overflow: auto;
		height: 100%;
		min-height: 0;
		container-type: inline-size; /* lets the "New item" button size itself to the visible width, not the table's */
	}

	/* Separate borders (not collapsed), so a sticky cell carries its own separator with it. Opaque
	   backgrounds, so scrolling rows (and their translucent tints) never show through. */
	thead :global(th.cell),
	tfoot :global(td) {
		position: sticky;
		z-index: 2;
		background: var(--color-bg);
	}

	thead :global(th.cell) {
		top: 0;
	}

	tfoot :global(td) {
		bottom: 0;
		border-top: 1px solid var(--color-border);
	}

	/* A shadow falls from the header once rows have scrolled beneath it, and rises from the "New item" row while
	   more rows hide below it: it reads as the bar lying above the content. Every cell carries a strip of the
	   gradient across its full width, so the strips meet without gaps or doubled edges (a box-shadow per cell
	   fades out at each cell's sides and looks blotchy). */
	.scroll[data-scrolled] thead :global(th.cell)::after,
	.scroll[data-more-below] tfoot :global(td)::before {
		content: '';
		position: absolute;
		inset-inline: 0;
		height: 0.75rem;
		pointer-events: none;
	}

	.scroll[data-scrolled] thead :global(th.cell)::after {
		top: 100%;
		background: linear-gradient(to bottom, var(--shadow-edge), transparent);
	}

	.scroll[data-more-below] tfoot :global(td)::before {
		bottom: 100%;
		background: linear-gradient(to top, var(--shadow-edge), transparent);
	}

	table {
		width: 100%;
		/* The fixed columns add up to 46rem; the rest is the Description, so it never gets squeezed away. */
		min-width: 58rem;
		border-collapse: separate;
		border-spacing: 0;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.description {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.code-cell {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.toggle,
	.toggle-space {
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--color-selected);
		color: var(--color-text);
	}

	.toggle:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.chevron {
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(-45deg); /* points right: collapsed */
		transition: transform var(--duration-fast);
	}

	.chevron.open {
		transform: rotate(45deg); /* points down: expanded */
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}

	/* Row actions appear on hover or keyboard focus; on touch screens (no hover) they stay visible. */
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-1);
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	tr:hover .actions,
	tr:focus-within .actions,
	.actions:focus-within {
		opacity: 1;
	}

	@media (hover: none) {
		.actions {
			opacity: 1;
		}
	}

	.new-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		/* Always as wide as the scroll area and pinned to its left edge, so on a narrow screen with a wide table it
		   stays on screen and clickable instead of sitting at the centre of the whole table. */
		position: sticky;
		left: 0;
		width: 100cqw;
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		border: none;
		background: transparent;
		color: var(--color-text-secondary);
		font: inherit;
		font-size: var(--font-size-callout);
		text-align: start;
		cursor: pointer;
	}

	.new-item:hover {
		background: var(--color-selected);
		color: var(--color-accent);
	}

	.new-item:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}

	.new-row td {
		padding: 0;
	}

	/* Hierarchy: a coloured bar on the left edge of every row in a top-level Group's section, Group rows
	   tinted by depth (set per row as --row-tint), indentation and weight in the first columns. None of it
	   relies on colour alone. Hover is an overlay, so the tint stays visible underneath it. */
	tbody tr[data-section] :global(.cell:first-child) {
		box-shadow: inset 3px 0 0 var(--color-accent);
	}

	tbody tr:hover :global(.cell:not(.selected)) {
		background-image: linear-gradient(var(--color-hover), var(--color-hover));
	}

	/* Drop markers (while dragging a row). Each is told apart by shape as well as colour: a line above
	   (before), a line below (after), a box around the row (inside), a dashed outline and faded row
	   (not allowed). The lines start at the indent of the level the Item would land on. */
	/* The line starts at the level the Item would land on, a dot marks its start, and each level steps in by
	   2rem: the width of that level's drop zone, so sibling and "after the parent" are visibly different
	   places. */
	tbody tr[data-drop] {
		--drop-inset: calc(var(--space-3) + min(var(--drop-depth, 0) * 2 * var(--space-4), 12rem));
		--drop-line: linear-gradient(var(--color-accent), var(--color-accent));
		--drop-dot: radial-gradient(circle, var(--color-accent) 0 3px, transparent 3.5px);
	}

	tbody tr[data-drop='before'] :global(.cell),
	tbody tr[data-drop='after'] :global(.cell) {
		background-image: var(--drop-line);
		background-size: 100% 3px;
		background-repeat: no-repeat;
	}

	tbody tr[data-drop='before'] :global(.cell) {
		background-position: 0 2px;
	}

	tbody tr[data-drop='after'] :global(.cell) {
		background-position: 0 calc(100% - 2px);
	}

	tbody tr[data-drop='before'] :global(.cell:first-child),
	tbody tr[data-drop='after'] :global(.cell:first-child) {
		background-image: var(--drop-dot), var(--drop-line);
		background-size:
			7px 7px,
			calc(100% - var(--drop-inset)) 3px;
	}

	tbody tr[data-drop='before'] :global(.cell:first-child) {
		background-position:
			var(--drop-inset) 0,
			var(--drop-inset) 2px;
	}

	tbody tr[data-drop='after'] :global(.cell:first-child) {
		background-position:
			var(--drop-inset) 100%,
			var(--drop-inset) calc(100% - 2px);
	}

	/* A drop after a Group's subtree is a change of level, not just of order: an arrow points back out to
	   the Group's level instead of the dot. */
	tbody tr[data-drop-out] :global(.cell:first-child) {
		position: relative;
		background-image: var(--drop-line);
		background-size: calc(100% - var(--drop-inset)) 3px;
		background-position: var(--drop-inset) calc(100% - 2px);
	}

	tbody tr[data-drop-out] :global(.cell:first-child)::after {
		content: '';
		position: absolute;
		left: var(--drop-inset);
		top: calc(100% - 9.5px);
		width: 14px;
		height: 12px;
		background: var(--color-accent);
		/* a left-pointing arrow: head, then shaft */
		clip-path: polygon(0 50%, 45% 5%, 45% 33%, 100% 33%, 100% 67%, 45% 67%, 45% 95%);
		pointer-events: none;
	}

	tbody tr[data-drop='inside'] :global(.cell) {
		background-image: linear-gradient(var(--color-selected), var(--color-selected));
		box-shadow:
			inset 0 2px 0 var(--color-accent),
			inset 0 -2px 0 var(--color-accent);
	}

	tbody tr[data-drop='inside'] :global(.cell:first-child) {
		box-shadow:
			inset 2px 0 0 var(--color-accent),
			inset 0 2px 0 var(--color-accent),
			inset 0 -2px 0 var(--color-accent);
	}

	tbody tr[data-drop='inside'] :global(.cell:last-child) {
		box-shadow:
			inset -2px 0 0 var(--color-accent),
			inset 0 2px 0 var(--color-accent),
			inset 0 -2px 0 var(--color-accent);
	}

	tbody tr[data-drop='blocked'] {
		outline: 2px dashed var(--color-danger);
		outline-offset: -2px;
		opacity: 0.55;
		cursor: not-allowed;
	}

	.code {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

</style>
