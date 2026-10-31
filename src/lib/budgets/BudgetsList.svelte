<script lang="ts">
	import { tick } from 'svelte';
	import { calculateBudget } from '../budget/calculate';
	import { formatMoney } from '../budget/currency';
	import Menu, { type MenuItem } from '../components/Menu.svelte';
	import MoreMenu from '../components/MoreMenu.svelte';
	import type { Budget } from '../budget/model';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import ConfirmDeleteBudgetDialog from './ConfirmDeleteBudgetDialog.svelte';
	import RenameBudgetDialog from './RenameBudgetDialog.svelte';

	let { store = budgetStore }: { store?: BudgetStore } = $props();

	// Most recently changed first; name and id keep the order stable.
	const budgets = $derived(
		[...store.budgets].sort(
			(a, b) =>
				b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
		)
	);
	let message = $state('');
	let confirmingDelete = $state(false);
	let pendingDelete = $state<Budget | null>(null);

	function requestDelete(budget: Budget) {
		pendingDelete = budget;
		confirmingDelete = true;
	}

	async function confirmDelete() {
		const budget = pendingDelete;
		pendingDelete = null;
		if (!budget) return;
		const result = store.deleteBudget(budget.id);
		message = result.ok ? `Deleted “${budget.name}”.` : `“${budget.name}” could not be deleted.`;
		// The deleted row (and the button that opened the dialog) is gone; land on a stable control.
		await tick();
		document.querySelector<HTMLElement>('[data-new-budget]')?.focus();
	}

	/** Copy a Budget, then move focus to the copy so keyboard users land on what was made. */
	async function duplicate(budgetId: string, name: string) {
		const result = store.duplicateBudget(budgetId);
		if (!result.ok) {
			message = `“${name}” could not be duplicated.`;
			return;
		}
		message = `Duplicated “${name}” as “${result.budget.name}”.`;
		await tick();
		document.querySelector<HTMLElement>(`a[href="/budgets/${result.budget.id}"]`)?.focus();
	}

	let renamingId = $state<string | null>(null);
	let renaming = $state(false);
	let contextMenu = $state<{ x: number; y: number; budget: Budget } | null>(null);

	/** One list of actions, used by the "⋯" button on each card and by its right-click menu. */
	function actionsFor(budget: Budget): MenuItem[] {
		return [
			{
				id: 'rename',
				label: 'Rename',
				icon: 'pencil',
				onselect: () => {
					renamingId = budget.id;
					renaming = true;
				}
			},
			{ id: 'duplicate', label: 'Duplicate', icon: 'copy', onselect: () => duplicate(budget.id, budget.name) },
			{ id: 'delete', label: 'Delete', icon: 'trash', destructive: true, separatorBefore: true, onselect: () => requestDelete(budget) }
		];
	}

	function oncontextmenu(event: MouseEvent, budget: Budget) {
		event.preventDefault();
		contextMenu = { x: event.clientX, y: event.clientY, budget };
	}

	const itemsLabel = (budgetId: string) => {
		const count = store.itemsOf(budgetId).length;
		return `${count} ${count === 1 ? 'item' : 'items'}`;
	};

	/** The Budget's grand total for the list; a Budget whose Items cannot be summed just shows none. */
	function totalLabel(budget: Budget): string {
		try {
			return formatMoney(calculateBudget(store.itemsOf(budget.id)).grandTotal, budget.currency);
		} catch {
			return '';
		}
	}

	const unreadable = $derived(store.loadIssues.filter((issue) => issue.budgetId !== undefined));
</script>

<main>
	<header>
		<h1>Your Budgets</h1>
		<a class="new" href="/budgets/new" data-new-budget>New Budget</a>
	</header>

	{#if store.hydrationStatus === 'idle'}
		<p class="note" role="status">Loading your Budgets…</p>
	{:else if store.hydrationStatus === 'unavailable'}
		<p class="note" role="alert">Browser storage is not available, so saved Budgets cannot be shown.</p>
	{:else}
		<p class="visually-hidden" role="status">{message}</p>
		<ConfirmDeleteBudgetDialog
			budget={pendingDelete}
			itemCount={pendingDelete ? store.itemsOf(pendingDelete.id).length : 0}
			bind:open={confirmingDelete}
			onconfirm={confirmDelete}
		/>

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
					<li oncontextmenu={(event) => oncontextmenu(event, budget)}>
						<a href="/budgets/{budget.id}">
							<span class="text">
								<span class="name">{budget.name}</span>
								<span class="meta">
									<span class="currency">{budget.currency}</span>
									<span class="count">{itemsLabel(budget.id)}</span>
								</span>
							</span>
							<span class="total">{totalLabel(budget)}</span>
						</a>
						<span class="actions">
							<MoreMenu label="Actions for {budget.name}" items={actionsFor(budget)} />
						</span>
					</li>
				{/each}
			</ul>
		{/if}

		{#if renamingId}
			<RenameBudgetDialog budgetId={renamingId} bind:open={renaming} {store} />
		{/if}
		{#if contextMenu}
			<Menu
				items={actionsFor(contextMenu.budget)}
				label="Actions for {contextMenu.budget.name}"
				anchor={{ x: contextMenu.x, y: contextMenu.y }}
				onclose={() => (contextMenu = null)}
			/>
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
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	.new {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-size: var(--font-size-callout);
		font-weight: var(--font-weight-semibold);
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

	/* A plain list, not boxed cards: hairline separators, a soft highlight on hover, actions on demand. */
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1);
		border-bottom: 1px solid var(--color-border);
	}

	li:last-child {
		border-bottom: none;
	}

	ul a {
		display: flex;
		flex: 1;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		min-width: 0;
		padding: var(--space-3) var(--space-3);
		border-radius: var(--radius-md);
		color: var(--color-text);
		text-decoration: none;
		transition: background-color var(--duration-fast);
	}

	ul a:hover {
		background: var(--color-hover);
	}

	ul a:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}

	.text {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.total {
		flex: none;
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
		font-variant-numeric: tabular-nums;
	}

	.actions {
		flex: none;
		opacity: 0;
		transition: opacity var(--duration-fast);
	}

	li:hover .actions,
	li:focus-within .actions,
	.actions:has(:global([aria-expanded='true'])) {
		opacity: 1;
	}

	@media (hover: none) {
		.actions {
			opacity: 1;
		}
	}

	.name {
		font-size: var(--font-size-title2);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.005em;
		overflow-wrap: anywhere;
	}

	.meta {
		display: flex;
		gap: var(--space-2);
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
		font-variant-numeric: tabular-nums;
	}

	.currency {
		font-weight: var(--font-weight-medium);
		color: var(--color-accent);
	}

	.count::before {
		content: '·';
		margin-inline-end: var(--space-2);
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

	.note {
		margin: 0;
		color: var(--color-text-secondary);
	}

	.warning {
		color: var(--color-danger);
	}
</style>
