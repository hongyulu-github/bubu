<script lang="ts">
	import BudgetsDrawer from '../budgets/BudgetsDrawer.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import LandingPage from './LandingPage.svelte';
	import { templates, type BudgetTemplate } from '../templates/templates';
	import TemplateShowcases from './TemplateShowcases.svelte';

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
	/** The template chosen from a showcase; null for normal creation, which makes an empty Budget. */
	let template = $state<BudgetTemplate | null>(null);

	/** Open the drawer on the saved Budgets or on the new-Budget form. */
	export function show(next: 'list' | 'new') {
		template = null;
		view = next;
		open = true;
	}

	/** A showcase's "Use template": the same new-Budget form (name and currency), starting from that template. */
	function useTemplate(templateId: string) {
		template = templates.find((candidate) => candidate.id === templateId) ?? null;
		view = 'new';
		open = true;
	}
</script>

<!--
	The main page. "Create a budget" opens the drawer on the new-Budget form; "My budgets" opens it on the saved list.
	The form makes an empty Budget and opens its unchanged editor. The route can also ask for either view (`show`), which is
	how the editor's back link and the retired /budgets and /budgets/new addresses arrive here.
-->
{#snippet showcases()}
	<TemplateShowcases onuse={useTemplate} />
{/snippet}
<LandingPage oncreate={() => show('new')} onopenbudgets={() => show('list')} drawer={open ? view : null} {showcases} />
<BudgetsDrawer bind:open bind:view {store} {template} oncreated={(budget) => navigate(`/budgets/${budget.id}`)} />
