<script lang="ts">
	import { tick } from 'svelte';
	import { validateBudgetName } from '../budget/create';
	import IconButton from '../components/IconButton.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';

	/**
	 * The Budget's name as a heading that renames in place: double-click it, or use the pencil (which is also
	 * the keyboard way in). Enter or leaving the field saves, Escape cancels, an invalid name stays editable.
	 */
	let { budgetId, store = budgetStore }: { budgetId: string; store?: BudgetStore } = $props();

	const budget = $derived(store.budgets.find((candidate) => candidate.id === budgetId) ?? null);

	let editing = $state(false);
	let draft = $state('');
	let attempted = $state(false);
	let root: HTMLElement | undefined = $state();
	let input: HTMLInputElement | undefined = $state();
	const error = $derived(attempted ? validateBudgetName(draft) : undefined);

	async function start() {
		draft = budget?.name ?? '';
		attempted = false;
		editing = true;
		await tick();
		input?.focus();
		input?.select();
	}

	async function stop() {
		editing = false;
		await tick();
		root?.querySelector<HTMLElement>('button')?.focus();
	}

	function save() {
		attempted = true;
		if (validateBudgetName(draft)) return false; // stays open, with its message
		store.renameBudget(budgetId, draft);
		return true;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			if (save()) void stop();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			void stop();
		}
	}

	function onblur() {
		if (!editing) return; // Enter or Escape already finished
		save(); // a valid name is kept; an invalid one is dropped, so the old name stays
		editing = false;
	}
</script>

<div class="title" bind:this={root}>
	{#if editing}
		<div class="title-editor">
			<input
				bind:this={input}
				bind:value={draft}
				aria-label="Budget name"
				aria-invalid={error ? 'true' : undefined}
				aria-describedby={error ? 'title-error' : undefined}
				autocomplete="off"
				{onkeydown}
				{onblur}
			/>
			<p class="error" id="title-error" role="alert">{error ?? ''}</p>
		</div>
	{:else}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -- the pencil button is the keyboard route -->
		<h1 ondblclick={start}>{budget?.name}</h1>
		<IconButton icon="pencil" label="Rename Budget" onclick={start} />
	{/if}
</div>

<style>
	.title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-display);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
		overflow-wrap: anywhere;
		cursor: text;
	}

	.title-editor {
		display: flex;
		flex-direction: column;
	}

	input {
		min-width: min(24rem, 80vw);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		font-size: var(--font-size-display);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
	}

	input:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	input[aria-invalid='true'] {
		border-color: var(--color-danger);
	}

	.error {
		margin: var(--space-1) 0 0;
		color: var(--color-danger);
		font-size: var(--font-size-footnote);
	}

	.error:empty {
		display: none;
	}
</style>
