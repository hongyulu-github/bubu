<script lang="ts">
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

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
	const rows = $derived(store.activeBudgetId === budgetId ? store.rows : []);
</script>

<main>
	<p><a class="back" href="/budgets">← All Budgets</a></p>

	{#if store.hydrationStatus === 'idle'}
		<p class="note" role="status">Loading Budget…</p>
	{:else if store.hydrationStatus === 'unavailable'}
		<p class="note" role="alert">Browser storage is not available, so this Budget cannot be opened.</p>
	{:else if budget}
		<h1>{budget.name}</h1>
		<p class="meta">{budget.currency}</p>

		{#if rows.length === 0}
			<p class="note">This Budget has no Items yet.</p>
		{:else}
			<ol aria-label="Items">
				{#each rows as row (row.id)}
					<li style:--depth={row.depth}>
						<span class="code">{row.code}</span>
						<span>{row.item.description}</span>
					</li>
				{/each}
			</ol>
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
		max-width: 40rem;
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

	ol {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	li {
		display: flex;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4) var(--space-3) calc(var(--space-4) + var(--depth) * var(--space-5));
		border-bottom: 1px solid var(--color-border);
	}

	li:last-child {
		border-bottom: none;
	}

	.code {
		min-width: 3.5rem;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}
</style>
