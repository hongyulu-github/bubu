<script lang="ts">
	import type { Budget } from '../budget/model';
	import Drawer from '../components/Drawer.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import BudgetsList from './BudgetsList.svelte';
	import ClearAllData from './ClearAllData.svelte';
	import CreateBudgetForm from './CreateBudgetForm.svelte';

	let {
		open = $bindable(false),
		view = $bindable<'list' | 'new'>('list'),
		store = budgetStore,
		oncreated
	}: {
		open?: boolean;
		/** What the drawer shows: the saved Budgets, or the form for a new one. */
		view?: 'list' | 'new';
		store?: BudgetStore;
		/** A Budget was created through the form; the caller opens its editor. */
		oncreated: (budget: Budget) => void;
	} = $props();

	let announcement = $state('');
</script>

<Drawer bind:open title={view === 'list' ? 'My budgets' : 'New budget'}>
	{#snippet actions()}
		{#if view === 'list'}<ClearAllData {store} onmessage={(text) => (announcement = text)} />{/if}
	{/snippet}
	{#if view === 'list'}
		<BudgetsList {store} {announcement} />
	{:else}
		<CreateBudgetForm
			{store}
			oncancel={() => (open = false)}
			onCreated={(budget) => {
				open = false;
				oncreated(budget);
			}}
		/>
	{/if}
</Drawer>
