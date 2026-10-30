<script lang="ts">
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	let { store = budgetStore }: { store?: BudgetStore } = $props();

	// Most recently changed first; name and id keep the order stable.
	const budgets = $derived(
		[...store.budgets].sort(
			(a, b) =>
				b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
		)
	);
	const unreadable = $derived(store.loadIssues.filter((issue) => issue.budgetId !== undefined));
</script>

<main>
	<header>
		<h1>Your Budgets</h1>
		<a class="new" href="/budgets/new">New Budget</a>
	</header>

	{#if store.hydrationStatus === 'idle'}
		<p class="note" role="status">Loading your Budgets…</p>
	{:else if store.hydrationStatus === 'unavailable'}
		<p class="note" role="alert">Browser storage is not available, so saved Budgets cannot be shown.</p>
	{:else}
		{#if unreadable.length > 0}
			<p class="note warning" role="alert">
				{unreadable.length === 1 ? '1 saved Budget' : `${unreadable.length} saved Budgets`} could not be loaded
				and {unreadable.length === 1 ? 'was' : 'were'} left untouched.
			</p>
		{/if}

		{#if budgets.length === 0}
			<p class="note">No saved Budgets yet.</p>
		{:else}
			<ul>
				{#each budgets as budget (budget.id)}
					<li>
						<a href="/budgets/{budget.id}">
							<span class="name">{budget.name}</span>
							<span class="currency">{budget.currency}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-display);
		line-height: var(--line-height-tight);
	}

	.new {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-height);
		padding: 0 var(--space-5);
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: var(--font-weight-medium);
		text-decoration: none;
	}

	.new:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	ul a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		min-height: var(--control-height);
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	ul a:hover {
		border-color: var(--color-border-strong);
	}

	ul a:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.name {
		font-weight: var(--font-weight-medium);
	}

	.currency {
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
		font-variant-numeric: tabular-nums;
	}

	.note {
		margin: 0;
		color: var(--color-text-secondary);
	}

	.warning {
		color: var(--color-danger);
	}
</style>
