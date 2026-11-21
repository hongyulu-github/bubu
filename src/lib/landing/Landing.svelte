<script lang="ts">
	import BudgetsDrawer from '../budgets/BudgetsDrawer.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import LandingPage from './LandingPage.svelte';
	import TemplateShowcases from './TemplateShowcases.svelte';

	let {
		store = budgetStore,
		navigate,
		onusetemplate = () => {}
	}: {
		store?: BudgetStore;
		/** Go to a path; the route passes SvelteKit's `goto`. */
		navigate: (path: string) => void;
		/** A "Use template" button was pressed with that template's id. The opening flow is separate (LUL-43). */
		onusetemplate?: (templateId: string) => void;
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
{#snippet showcases()}
	<TemplateShowcases onuse={onusetemplate} />
{/snippet}
<LandingPage oncreate={() => show('new')} onopenbudgets={() => show('list')} {showcases} />
<BudgetsDrawer bind:open bind:view {store} oncreated={(budget) => navigate(`/budgets/${budget.id}`)} />
