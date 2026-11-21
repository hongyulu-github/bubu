<script lang="ts">
	import BudgetsDrawer from '../budgets/BudgetsDrawer.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import LandingPage from './LandingPage.svelte';

	let {
		store = budgetStore,
		navigate
	}: {
		store?: BudgetStore;
		/** Go to a path; the route passes SvelteKit's `goto`. */
		navigate: (path: string) => void;
	} = $props();

	let open = $state(false);
	let view = $state<'list' | 'new'>('list');

	/** Open the drawer on the saved Budgets or on the new-Budget form. */
	export function show(next: 'list' | 'new') {
		view = next;
		open = true;
	}
</script>

<!--
	The main page. "Create a budget" opens the drawer on the new-Budget form; "My budgets" opens it on the saved list.
	The form makes an empty Budget and opens its unchanged editor. The route can also ask for either view (`show`), which is
	how the editor's back link and the retired /budgets and /budgets/new addresses arrive here.
-->
<LandingPage oncreate={() => show('new')} onopenbudgets={() => show('list')} />
<BudgetsDrawer bind:open bind:view {store} oncreated={(budget) => navigate(`/budgets/${budget.id}`)} />
