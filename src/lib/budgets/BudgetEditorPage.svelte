<script lang="ts">
	import { toString } from '../budget/numbers';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import Button from '../components/Button.svelte';
	import BudgetSpreadsheet from './BudgetSpreadsheet.svelte';

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
	const ready = $derived(store.activeBudgetId === budgetId);
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
				<h1>{budget.name}</h1>
				<p class="meta">{budget.currency}</p>
			</div>
			{#if ready}
				<p class="total">
					<span class="total-label">Grand total</span>
					<output aria-label="Grand total">{toString(store.grandTotal)} {budget.currency}</output>
				</p>
			{/if}
		</header>

		{#if ready}
			<div class="history" role="group" aria-label="History">
				<Button disabled={!store.canUndo(budgetId)} onclick={() => store.undo(budgetId)}>Undo</Button>
				<Button disabled={!store.canRedo(budgetId)} onclick={() => store.redo(budgetId)}>Redo</Button>
			</div>
		{/if}

		{#if ready && rows.length === 0}
			<p class="note">This Budget has no Items yet.</p>
		{:else if rows.length > 0}
			<BudgetSpreadsheet {rows} onedit={(itemId, field, text) => store.editItem(budgetId, itemId, field, text)} />
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
		max-width: 64rem;
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
