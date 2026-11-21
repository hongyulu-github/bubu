<script lang="ts">
	import { tick } from 'svelte';
	import type { Budget } from '../budget/model';
	import { CURRENCIES } from '../budget/currencies';
	import { validateBudgetForm, type BudgetFormErrors } from '../budget/create';
	import { downloadTemplate } from '../excel/template';
	import ImportBudgetFlow from './ImportBudgetFlow.svelte';
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Select from '../components/Select.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	let {
		store = budgetStore,
		onCreated,
		oncancel
	}: {
		store?: BudgetStore;
		/** Called after the Budget is in shared state; the caller opens its editor. */
		onCreated: (budget: Budget) => void;
		oncancel: () => void;
	} = $props();

	let name = $state('');
	let currency = $state('');
	// Errors only appear after the first submit attempt, then update as the user corrects the form.
	let attempted = $state(false);
	let form: HTMLFormElement;

	const errors: BudgetFormErrors = $derived(attempted ? validateBudgetForm({ name, currency }) : {});
	const currencyOptions = CURRENCIES.map(({ code, name }) => ({ value: code, label: `${code} · ${name}` }));

	let templateFailed = $state(false);

	async function getTemplate() {
		templateFailed = false;
		try {
			await downloadTemplate();
		} catch {
			templateFailed = true;
		}
	}

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

<div class="form-body">
	<form bind:this={form} novalidate onsubmit={submit}>
		<Input label="Name" bind:value={name} error={errors.name} autocomplete="off" />
		<Select
			label="Currency"
			bind:value={currency}
			options={currencyOptions}
			placeholder="Choose a currency"
			hint="Amounts in this Budget are shown in this currency."
			error={errors.currency}
		/>
		<div class="actions">
			<button type="button" class="cancel" onclick={oncancel}>Cancel</button>
			<Button type="submit" variant="primary" disabled={store.hydrationStatus === 'idle'}>Create Budget</Button>
		</div>
	</form>
	<div class="alt">
		Prefer to start in Excel?
		<button type="button" class="link" onclick={getTemplate}>Download an empty template</button>
		or
		<ImportBudgetFlow {store} onImported={onCreated} />
	</div>
	{#if templateFailed}
		<p class="alt problem" role="alert">The template could not be created. Please try again.</p>
	{/if}
</div>

<style>
	.form-body {
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--space-4);
		margin-top: var(--space-2);
	}

	.cancel {
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		cursor: pointer;
		color: var(--color-accent);
		font-size: var(--font-size-callout);
		font-weight: var(--font-weight-semibold);
		text-decoration: none;
	}

	.alt {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
	}

	.problem {
		color: var(--color-danger);
	}

	.link {
		padding: 0;
		border: none;
		background: none;
		color: var(--color-accent);
		font: inherit;
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
	}

	.link:hover {
		text-decoration: underline;
	}

	.link:focus-visible,
	.cancel:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
