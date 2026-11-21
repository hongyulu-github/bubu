<script lang="ts">
	import type { Budget } from '../budget/model';
	import { CURRENCIES } from '../budget/currencies';
	import { validateBudgetForm } from '../budget/create';
	import { buildImport, describeLocation, needsFor, stageWorkbook, type Staged } from '../excel/import-flow';
	import type { ValidationError } from '../excel/validate';
	import { describeImportFailure, describeProblemCount, EXCEL_FAILURES } from '../errors/messages';
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';
	import Input from '../components/Input.svelte';
	import Select from '../components/Select.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	let {
		store = budgetStore,
		onImported
	}: {
		store?: BudgetStore;
		/** Called once the Budget is saved and in shared state; the caller opens its editor. */
		onImported: (budget: Budget) => void;
	} = $props();

	type Step =
		| { kind: 'errors'; errors: ValidationError[] }
		| { kind: 'details' }
		| { kind: 'conflict'; existing: Budget }
		| { kind: 'confirm-replace'; existing: Budget }
		| { kind: 'failed'; title: string; detail: string };

	const SHOWN_ERRORS = 20;

	let input: HTMLInputElement;
	let step = $state<Step | null>(null);
	let open = $state(false);
	let staged: Staged | null = null;
	let name = $state('');
	let currency = $state('');
	let attempted = $state(false);

	const formErrors = $derived(attempted ? validateBudgetForm({ name, currency }) : {});
	const currencyOptions = CURRENCIES.map(({ code, name }) => ({ value: code, label: `${code} · ${name}` }));

	function show(next: Step) {
		step = next;
		open = true;
	}

	/** Nothing is kept from an import that was not finished. */
	function reset() {
		open = false;
		step = null;
		staged = null;
		name = '';
		currency = '';
		attempted = false;
	}

	async function picked() {
		const file = input.files?.[0];
		input.value = ''; // so choosing the same file again still counts as a change
		if (!file) return;

		let data: ArrayBuffer;
		try {
			data = await file.arrayBuffer();
		} catch {
			show({ kind: 'failed', ...EXCEL_FAILURES.read });
			return;
		}
		const result = await stageWorkbook(data);
		if (!result.ok) {
			show({ kind: 'errors', errors: result.errors });
			return;
		}
		staged = result.staged;
		const needs = needsFor(staged, store.budgets);
		if (needs.kind === 'none') commit({});
		else if (needs.kind === 'details') show({ kind: 'details' });
		else show({ kind: 'conflict', existing: needs.existing });
	}

	function commit(options: { details?: { name: string; currency: string }; mode?: 'replace' | 'copy' }) {
		const built = staged ? buildImport(staged, options) : null;
		if (!built?.ok) {
			show({ kind: 'failed', ...EXCEL_FAILURES.build });
			return;
		}
		const saved = store.importBudget(built.budget, built.items, { replace: options.mode === 'replace' });
		if (!saved.ok) {
			show({ kind: 'failed', ...describeImportFailure(saved) });
			return;
		}
		reset();
		onImported(built.budget);
	}

	function submitDetails() {
		attempted = true;
		if (Object.keys(validateBudgetForm({ name, currency })).length > 0) return;
		commit({ details: { name, currency } });
	}

	const title = $derived(
		step?.kind === 'errors'
			? 'This workbook cannot be imported'
			: step?.kind === 'details'
				? 'Name this Budget'
				: step?.kind === 'conflict'
					? `“${step.existing.name}” is already saved`
					: step?.kind === 'confirm-replace'
						? `Replace “${step.existing.name}”?`
						: step?.kind === 'failed'
							? step.title
							: 'The Budget could not be imported'
	);
	const description = $derived(
		step?.kind === 'errors'
			? `${describeProblemCount(step.errors.length)}. Nothing was changed. Fix these in Excel and import the file again.`
			: step?.kind === 'details'
				? 'This workbook has no BuBu details, so it will be imported as a new Budget.'
				: step?.kind === 'conflict'
					? 'This workbook is an export of a Budget you already have. Keep both by importing a copy, or replace the saved one with the workbook.'
					: step?.kind === 'confirm-replace'
						? 'This permanently replaces the saved Budget and all its items with the ones in the workbook. Undo cannot bring them back.'
						: step?.kind === 'failed'
							? step.detail
							: undefined
	);
</script>

<input bind:this={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-label="Excel workbook (.xlsx)" onchange={picked} />
<button type="button" class="link" onclick={() => input.click()}>Import an Excel workbook</button>

<Dialog bind:open {title} {description} oncancel={reset}>
	{#if step?.kind === 'errors'}
		<ul class="errors">
			{#each step.errors.slice(0, SHOWN_ERRORS) as error}
				<li>
					{#if describeLocation(error)}<strong>{describeLocation(error)}</strong>{/if}
					{error.message}
				</li>
			{/each}
		</ul>
		{#if step.errors.length > SHOWN_ERRORS}
			<p class="more">and {step.errors.length - SHOWN_ERRORS} more.</p>
		{/if}
	{:else if step?.kind === 'details'}
		<form
			novalidate
			onsubmit={(event) => {
				event.preventDefault();
				submitDetails();
			}}
		>
			<Input label="Name" bind:value={name} error={formErrors.name} autocomplete="off" />
			<Select label="Currency" bind:value={currency} options={currencyOptions} placeholder="Choose a currency" error={formErrors.currency} />
		</form>
	{/if}
	{#snippet footer()}
		{#if step?.kind === 'details'}
			<Button onclick={reset}>Cancel</Button>
			<Button variant="primary" onclick={submitDetails}>Import Budget</Button>
		{:else if step?.kind === 'conflict'}
			<Button onclick={reset}>Cancel</Button>
			<Button onclick={() => step?.kind === 'conflict' && (step = { kind: 'confirm-replace', existing: step.existing })}>Replace…</Button>
			<Button variant="primary" onclick={() => commit({ mode: 'copy' })}>Import as copy</Button>
		{:else if step?.kind === 'confirm-replace'}
			<Button onclick={() => step?.kind === 'confirm-replace' && (step = { kind: 'conflict', existing: step.existing })}>Back</Button>
			<Button variant="destructive" onclick={() => commit({ mode: 'replace' })}>Replace Budget</Button>
		{:else}
			<Button onclick={reset}>Close</Button>
		{/if}
	{/snippet}
</Dialog>

<style>
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

	.link:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.errors {
		margin: 0;
		padding-left: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-height: 16rem;
		overflow: auto;
		font-size: var(--font-size-callout);
	}

	.more {
		margin: var(--space-2) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
	}

	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>
