<script lang="ts">
	import { tick } from 'svelte';
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';
	import Input from '../components/Input.svelte';
	import { validateBudgetName } from '../budget/create';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	let {
		budgetId,
		open = $bindable(false),
		store = budgetStore
	}: { budgetId: string; open?: boolean; store?: BudgetStore } = $props();

	const budget = $derived(store.budgets.find((candidate) => candidate.id === budgetId) ?? null);
	const formId = $props.id();

	// The name being typed is local to the form; it only reaches shared state on Save.
	let name = $state('');
	let attempted = $state(false);
	let form: HTMLFormElement | undefined = $state();
	const error = $derived(attempted ? validateBudgetName(name) : undefined);

	// Each time the dialog opens it starts from the current name with no error showing.
	$effect(() => {
		if (open) {
			name = budget?.name ?? '';
			attempted = false;
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		attempted = true;
		const result = store.renameBudget(budgetId, name);
		if (result.ok) {
			open = false;
			return;
		}
		await tick();
		form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}
</script>

<Dialog bind:open title="Rename Budget" description="The name changes; your Items stay exactly as they are.">
	<form id={formId} bind:this={form} novalidate onsubmit={save}>
		<Input label="Name" bind:value={name} {error} autocomplete="off" />
	</form>
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button type="submit" form={formId} variant="primary">Save</Button>
	{/snippet}
</Dialog>
