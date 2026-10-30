<script lang="ts">
	import { tick } from 'svelte';
	import { describeConversion, type ConversionImpact } from '../budget/convert';
	import { describeDeletion, type DeletionImpact } from '../budget/delete';
	import { toString } from '../budget/numbers';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import Button from '../components/Button.svelte';
	import BudgetSpreadsheet from './BudgetSpreadsheet.svelte';
	import ConfirmConversionDialog from './ConfirmConversionDialog.svelte';
	import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';
	import RenameBudgetDialog from './RenameBudgetDialog.svelte';

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
	let renaming = $state(false);
	let confirmingConversion = $state(false);
	let pendingConversion = $state<ConversionImpact | null>(null);
	let confirmingDelete = $state(false);
	let pendingDelete = $state<DeletionImpact | null>(null);
	const ready = $derived(store.activeBudgetId === budgetId);

	/** Move the cursor to the new row's Description so the user can type straight away. */
	async function focusDescription(itemId: string) {
		await tick();
		document.querySelector<HTMLInputElement>(`tr[data-item-id="${itemId}"] input`)?.focus();
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
</script>

<main>
	<p><a class="back" href="/budgets">← All Budgets</a></p>

	{#if store.hydrationStatus === 'idle'}
		<p class="note" role="status">Loading Budget…</p>
	{:else if store.hydrationStatus === 'unavailable'}
		<p class="note" role="alert">Browser storage is not available, so this Budget cannot be opened.</p>
	{:else if budget}
		<header>
			<div>
				<div class="title">
					<h1>{budget.name}</h1>
					<Button compact onclick={() => (renaming = true)}>Rename</Button>
				</div>
				<p class="meta">{budget.currency}</p>
			</div>
			{#if ready}
				<p class="total">
					<span class="total-label">Grand total</span>
					<output aria-label="Grand total">{toString(store.grandTotal)} {budget.currency}</output>
				</p>
			{/if}
		</header>

		<RenameBudgetDialog {budgetId} bind:open={renaming} {store} />
		<ConfirmConversionDialog impact={pendingConversion} bind:open={confirmingConversion} onconfirm={confirmConversion} />
		<ConfirmDeleteDialog impact={pendingDelete} bind:open={confirmingDelete} onconfirm={confirmDelete} />

		{#if ready}
			<div class="history" role="group" aria-label="History">
				<Button disabled={!store.canUndo(budgetId)} onclick={() => store.undo(budgetId)}>Undo</Button>
				<Button disabled={!store.canRedo(budgetId)} onclick={() => store.redo(budgetId)}>Redo</Button>
			</div>
		{/if}

		{#if ready && rows.length === 0}
			<p class="note">This Budget has no Items yet.</p>
		{:else if rows.length > 0}
			<BudgetSpreadsheet
				{rows}
				onedit={(itemId, field, text) => store.editItem(budgetId, itemId, field, text)}
				onadd={addBelow}
				ondelete={requestDelete}
				onaddchild={requestAddChild}
			/>
		{/if}

		{#if ready}
			<div class="add">
				<Button variant="primary" data-add-item onclick={addTopLevel}>Add item</Button>
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
		max-width: 72rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
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
		margin-bottom: var(--space-3);
	}

	.title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.add {
		display: flex;
		margin-top: var(--space-2);
	}

	.history {
		display: flex;
		gap: var(--space-2);
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
		font-weight: var(--font-weight-semibold);
		font-variant-numeric: tabular-nums;
	}
</style>
