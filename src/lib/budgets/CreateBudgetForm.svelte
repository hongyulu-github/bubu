<script lang="ts">
	import { tick } from 'svelte';
	import type { Budget } from '../budget/model';
	import { CURRENCIES } from '../budget/currencies';
	import { validateBudgetForm, type BudgetFormErrors } from '../budget/create';
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Select from '../components/Select.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	let {
		store = budgetStore,
		onCreated
	}: {
		store?: BudgetStore;
		/** Called after the Budget is in shared state; the caller opens its editor. */
		onCreated: (budget: Budget) => void;
	} = $props();

	let name = $state('');
	let currency = $state('');
	// Errors only appear after the first submit attempt, then update as the user corrects the form.
	let attempted = $state(false);
	let form: HTMLFormElement;

	const errors: BudgetFormErrors = $derived(attempted ? validateBudgetForm({ name, currency }) : {});
	const currencyOptions = CURRENCIES.map(({ code, name }) => ({ value: code, label: `${code} · ${name}` }));

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		attempted = true;
		const result = store.createBudget({ name, currency });
		if (result.ok) {
			onCreated(result.budget);
			return;
		}
		await tick();
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}
</script>

<main>
	<h1>New Budget</h1>
	<form bind:this={form} novalidate onsubmit={submit}>
		<Input label="Name" bind:value={name} error={errors.name} autocomplete="off" />
		<Select
			label="Currency"
			bind:value={currency}
			options={currencyOptions}
			placeholder="Choose a currency"
			error={errors.currency}
		/>
		<div class="actions">
			<a class="cancel" href="/budgets">Cancel</a>
			<Button type="submit" variant="primary" disabled={store.hydrationStatus === 'idle'}>Create Budget</Button>
		</div>
	</form>
</main>

<style>
	main {
		max-width: 28rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-display);
		line-height: var(--line-height-tight);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-4);
	}

	.cancel {
		color: var(--color-accent);
		text-decoration: none;
	}

	.cancel:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
