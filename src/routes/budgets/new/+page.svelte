<script lang="ts">
	import { goto } from '$app/navigation';
	import CreateBudgetForm from '#lib/budgets/CreateBudgetForm.svelte';
</script>

<CreateBudgetForm onCreated={(budget) => goto(`/budgets/${budget.id}`)} />
