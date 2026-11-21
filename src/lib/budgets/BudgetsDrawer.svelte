<script lang="ts">
	import type { Budget } from '../budget/model';
	import type { BudgetTemplate } from '../templates/templates';
	import { tick } from 'svelte';
	import Drawer from '../components/Drawer.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import BudgetsList from './BudgetsList.svelte';
	import ClearAllData from './ClearAllData.svelte';
	import CreateBudgetForm from './CreateBudgetForm.svelte';

	let {
		open = $bindable(false),
		view = $bindable<'list' | 'new'>('list'),
		store = budgetStore,
		template = null,
		oncreated
	}: {
		open?: boolean;
		/** What the drawer shows: the saved Budgets, or the form for a new one. */
		view?: 'list' | 'new';
		store?: BudgetStore;
		/** The landing-page template the new-Budget form starts from, or none for a normal empty Budget. */
		template?: BudgetTemplate | null;
		/** A Budget was created through the form; the caller opens its editor. */
		oncreated: (budget: Budget) => void;
	} = $props();

	let announcement = $state('');

	/** From the empty list straight to the new-Budget form, with the cursor in its first field. */
	async function startCreating() {
		view = 'new';
		await tick();
		document.querySelector<HTMLElement>('dialog[open] input')?.focus();
	}
</script>

<Drawer bind:open title={view === 'list' ? 'My budgets' : 'New budget'} focusTitle={view === 'list'}>
	{#snippet actions()}
		{#if view === 'list'}<ClearAllData {store} onmessage={(text) => (announcement = text)} />{/if}
	{/snippet}
	{#if view === 'list'}
		<BudgetsList {store} {announcement} oncreate={startCreating} />
	{:else}
		<CreateBudgetForm
			{store}
			{template}
			oncancel={() => (open = false)}
			onCreated={(budget) => {
				open = false;
				oncreated(budget);
			}}
		/>
	{/if}
</Drawer>
