<script lang="ts">
	import { tick, untrack } from 'svelte';
	import type { Budget } from '../budget/model';
	import { CURRENCIES } from '../budget/currencies';
	import { validateBudgetForm, type BudgetFormErrors } from '../budget/create';
	import { downloadTemplate } from '../excel/template';
	import ImportBudgetFlow from './ImportBudgetFlow.svelte';
	import Button from '../components/Button.svelte';
	import Input from '../components/Input.svelte';
	import Select from '../components/Select.svelte';
	import StatusMessage from '../components/StatusMessage.svelte';
	import { EXCEL_FAILURES } from '../errors/messages';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import type { BudgetTemplate } from '../templates/templates';

	let {
		store = budgetStore,
		onCreated,
		oncancel,
		template = null
	}: {
		store?: BudgetStore;
		/** Called after the Budget is in shared state; the caller opens its editor. */
		onCreated: (budget: Budget) => void;
		oncancel: () => void;
		/** A starter template chosen on the landing page: the Budget starts with its Items. Normal creation passes none. */
		template?: BudgetTemplate | null;
	} = $props();

	let name = $state(untrack(() => template?.name ?? '')); // the form is made fresh each time the drawer opens
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
		const result = template ? store.createBudgetFromTemplate(template, { name, currency }) : store.createBudget({ name, currency });
		if (result.ok) {
			onCreated(result.budget);
			return;
		}
		await tick();
		form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}
</script>

<div class="form-body">
	{#if template}
		<p class="alt">Starting from the {template.name} template: its Items are copied into your new Budget, with no prices.</p>
	{/if}
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
	{#if !template}
	<div class="alt">
		Prefer to start in Excel?
		<button type="button" class="link" onclick={getTemplate}>Download an empty template</button>
		or
		<ImportBudgetFlow {store} onImported={onCreated} />
	</div>
	{/if}
	{#if templateFailed}
		<StatusMessage title={EXCEL_FAILURES.template.title}>{EXCEL_FAILURES.template.detail}</StatusMessage>
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
