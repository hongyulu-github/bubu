<script lang="ts">
	import BudgetEditorPage from '#lib/budgets/BudgetEditorPage.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<BudgetEditorPage budgetId={data.budgetId} />
