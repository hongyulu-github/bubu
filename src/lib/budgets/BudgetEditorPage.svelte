<script lang="ts">
	import { tick } from 'svelte';
	import { collapseAll, expandAll, toggleCollapsed, visibleRows } from '../budget/collapse';
	import { describeConversion, type ConversionImpact } from '../budget/convert';
	import { describeDeletion, type DeletionImpact } from '../budget/delete';
	import { formatMoney } from '../budget/currency';
	import { parseHistoryShortcut } from '../budget/shortcuts';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import IconButton from '../components/IconButton.svelte';
	import BudgetSpreadsheet from './BudgetSpreadsheet.svelte';
	import ConfirmConversionDialog from './ConfirmConversionDialog.svelte';
	import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';
	import InlineTitle from './InlineTitle.svelte';

	let { budgetId, store = budgetStore }: { budgetId: string; store?: BudgetStore } = $props();

	const budget = $derived(store.budgets.find((candidate) => candidate.id === budgetId) ?? null);
	const exists = $derived(budget !== null);
	const loadFailure = $derived(store.loadIssues.find((issue) => issue.budgetId === budgetId));

	// Select exactly the Budget named by the route; an unknown id selects nothing, never another Budget.
	$effect(() => {
		if (!exists) return;
		store.select(budgetId);
		return () => store.select(null);
	});

	// Only show Items once the store has switched to this route's Budget, so a previously open
	// Budget's Items can never flash up under the wrong heading.
	/**
	 * Cmd/Ctrl+Z undoes and Cmd/Ctrl+Shift+Z redoes this Budget's Item commands. Text being typed keeps the
	 * browser's own undo: an input with uncommitted text, any field in a dialog, and fields outside the grid
	 * are left alone. A cell input with nothing uncommitted hands over to Item undo, like a committed cell.
	 */
	function leavesToBrowser(target: EventTarget | null): boolean {
		if (!(target instanceof HTMLElement)) return false;
		if (target.closest('dialog')) return true;
		if (!(target.matches('input, textarea, select') || target.isContentEditable)) return false;
		const cellEditor = target.closest('.editor');
		return !cellEditor || cellEditor.hasAttribute('data-dirty');
	}

	function onkeydown(event: KeyboardEvent) {
		if (!ready || event.defaultPrevented) return;
		const shortcut = parseHistoryShortcut(event);
		if (!shortcut || leavesToBrowser(event.target)) return;
		event.preventDefault();
		if (shortcut === 'undo') store.undo(budgetId);
		else store.redo(budgetId);
	}

	// Shortcut hints in tooltips follow the platform: ⌘ on Apple devices, Ctrl elsewhere.
	let apple = $state(false);
	$effect(() => {
		apple = /Mac|iPhone|iPad/.test(navigator.platform);
	});
	const mod = $derived(apple ? '⌘' : 'Ctrl+');
	const shift = $derived(apple ? '⇧' : 'Shift+');
	let confirmingConversion = $state(false);
	let pendingConversion = $state<ConversionImpact | null>(null);
	let confirmingDelete = $state(false);
	let pendingDelete = $state<DeletionImpact | null>(null);
	const ready = $derived(store.activeBudgetId === budgetId);

	/** Move the cursor to the new row's Description so the user can type straight away. */
	async function focusDescription(itemId: string) {
		await tick();
		const input = document.querySelector<HTMLInputElement>(`tr[data-item-id="${itemId}"] input`);
		input?.focus();
		input?.scrollIntoView({ block: 'nearest' }); // inside the scroll area, clear of the sticky rows (scroll-padding)
	}

	/** The deleted row (and the control that opened any dialog) is gone, so put focus somewhere stable. */
	async function focusAfterDelete() {
		await tick();
		document.querySelector<HTMLElement>('[data-add-item]')?.focus();
	}

	/** A Line is deleted straight away (it can be undone); a Group asks first and names its impact. */
	function requestDelete(itemId: string) {
		const impact = describeDeletion(store.itemsOf(budgetId), itemId);
		if (!impact) return;
		if (impact.kind === 'line') {
			store.deleteItem(budgetId, itemId);
			void focusAfterDelete();
			return;
		}
		pendingDelete = impact;
		confirmingDelete = true;
	}

	function confirmDelete() {
		if (pendingDelete) store.deleteItem(budgetId, pendingDelete.itemId);
		pendingDelete = null;
		void focusAfterDelete();
	}

	async function addChildNow(parentId: string) {
		// A new child must not land in a hidden row: open the Group it is added to.
		if (collapsed.has(parentId)) collapsed = toggleCollapsed(collapsed, parentId);
		const added = store.addChildItem(budgetId, parentId);
		if (added.ok) await focusDescription(added.item.id);
	}

	/** Adding to a Group just adds. Adding to a Line converts it, so that is confirmed first. */
	function requestAddChild(parentId: string) {
		const conversion = describeConversion(store.itemsOf(budgetId), parentId);
		if (!conversion) {
			void addChildNow(parentId);
			return;
		}
		pendingConversion = conversion;
		confirmingConversion = true;
	}

	function confirmConversion() {
		const parentId = pendingConversion?.parentId;
		pendingConversion = null;
		if (parentId) void addChildNow(parentId);
	}

	async function addTopLevel() {
		const added = store.addTopLevelItem(budgetId);
		if (added.ok) await focusDescription(added.item.id);
	}

	async function addBelow(siblingId: string) {
		const added = store.addSiblingItem(budgetId, siblingId);
		if (added.ok) await focusDescription(added.item.id);
	}
	const rows = $derived(ready ? store.rows : []);

	// Which Groups are collapsed is editor UI state: not in the store, not in history, not saved. The
	// rows shown are derived from it; totals and Codes always come from all the Items.
	let collapsed = $state.raw<ReadonlySet<string>>(new Set());
	const shownRows = $derived(visibleRows(rows, collapsed));
	const groupIds = $derived(rows.filter((row) => row.kind === 'group').map((row) => row.id));
	const allCollapsed = $derived(groupIds.length > 0 && groupIds.every((id) => collapsed.has(id)));
	const noneCollapsed = $derived(!groupIds.some((id) => collapsed.has(id)));
</script>

<svelte:window {onkeydown} />

<main>
	<p><a class="back" href="/budgets">← All Budgets</a></p>

	{#if store.hydrationStatus === 'idle'}
		<p class="note" role="status">Loading Budget…</p>
	{:else if store.hydrationStatus === 'unavailable'}
		<p class="note" role="alert">Browser storage is not available, so this Budget cannot be opened.</p>
	{:else if budget}
		<header>
			<div>
				<InlineTitle {budgetId} {store} />
				<p class="meta">{budget.currency}</p>
			</div>
			{#if ready}
				<p class="total">
					<span class="total-label">Grand total</span>
					<output aria-label="Grand total">{formatMoney(store.grandTotal, budget.currency)}</output>
				</p>
			{/if}
		</header>

		<ConfirmConversionDialog impact={pendingConversion} bind:open={confirmingConversion} onconfirm={confirmConversion} />
		<ConfirmDeleteDialog impact={pendingDelete} bind:open={confirmingDelete} onconfirm={confirmDelete} />

		{#if ready}
			<div class="toolbar">
				<div class="group" role="group" aria-label="History">
					<IconButton
						icon="undo"
						label="Undo"
						shortcut="{mod}Z"
						aria-keyshortcuts="Control+Z Meta+Z"
						disabled={!store.canUndo(budgetId)}
						onclick={() => store.undo(budgetId)}
					/>
					<IconButton
						icon="redo"
						label="Redo"
						shortcut="{shift}{mod}Z"
						aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z"
						disabled={!store.canRedo(budgetId)}
						onclick={() => store.redo(budgetId)}
					/>
				</div>
				{#if groupIds.length > 0}
					<div class="group" role="group" aria-label="Groups">
						<IconButton icon="collapseAll" label="Collapse all" disabled={allCollapsed} onclick={() => (collapsed = collapseAll(rows))} />
						<IconButton icon="expandAll" label="Expand all" disabled={noneCollapsed} onclick={() => (collapsed = expandAll())} />
					</div>
				{/if}
			</div>

			<div class="table-area">
				<BudgetSpreadsheet
					rows={shownRows}
					currency={budget.currency}
					{collapsed}
					ontoggle={(groupId) => (collapsed = toggleCollapsed(collapsed, groupId))}
					onedit={(itemId, field, text) => store.editItem(budgetId, itemId, field, text)}
					onadd={addBelow}
					ondelete={requestDelete}
					onaddchild={requestAddChild}
					onnewitem={addTopLevel}
				/>
			</div>
		{/if}
	{:else if loadFailure}
		<h1>This Budget could not be loaded</h1>
		<p class="note">Its saved data is damaged or from a newer version, and was left untouched.</p>
	{:else}
		<h1>Budget not found</h1>
		<p class="note">There is no saved Budget with this address.</p>
	{/if}
</main>

<style>
	main {
		/* The editor fills the window and the page itself never scrolls: title and toolbar stay put, and the
		   table area below takes the rest, scrolling its rows only. */
		height: 100dvh;
		overflow: hidden;
		position: relative; /* so absolutely positioned bits (visually hidden labels) are clipped with it, not stretching the page */
		/* The table uses the whole window; only the page padding frames it. */
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	p {
		margin: 0;
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-display);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
	}

	.back {
		color: var(--color-accent);
		text-decoration: none;
	}

	.back:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.meta,
	.note {
		color: var(--color-text-secondary);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.table-area {
		flex: 1;
		min-height: 0;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.group {
		display: flex;
		gap: var(--space-1);
		padding: 2px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	.total {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
	}

	.total-label {
		color: var(--color-text-secondary);
		font-size: var(--font-size-footnote);
	}

	output {
		font-size: var(--font-size-title);
		font-weight: var(--font-weight-bold);
		font-variant-numeric: tabular-nums;
	}
</style>
