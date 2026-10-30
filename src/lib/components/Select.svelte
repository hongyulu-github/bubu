<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLSelectAttributes, 'value' | 'id' | 'children'> {
		/** Visible label; always rendered so the field has an accessible name. */
		label: string;
		value?: string;
		options: readonly { value: string; label: string }[];
		/** Text of the empty first option, which has the value "". */
		placeholder?: string;
		hint?: string;
		error?: string;
	}

	let { label, value = $bindable(''), options, placeholder, hint, error, disabled, ...rest }: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const messageId = `${id}-message`;
</script>

<div class="field">
	<label for={id}>{label}</label>
	<select
		{id}
		bind:value
		{disabled}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={[hint ? hintId : '', messageId].filter(Boolean).join(' ')}
		{...rest}
	>
		{#if placeholder !== undefined}
			<option value="">{placeholder}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
	{#if hint}
		<p class="hint" id={hintId}>{hint}</p>
	{/if}
	<p class="error" id={messageId} aria-live="polite">{error ?? ''}</p>
</div>

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	label {
		font-size: var(--font-size-callout);
		font-weight: var(--font-weight-medium);
		color: var(--color-text);
	}

	select {
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	select:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	select[aria-invalid='true'] {
		border-color: var(--color-danger);
	}

	select:disabled {
		background: var(--color-disabled-bg);
		color: var(--color-disabled-text);
		border-color: transparent;
		cursor: not-allowed;
	}

	.hint,
	.error {
		margin: 0;
		font-size: var(--font-size-footnote);
	}

	.hint {
		color: var(--color-text-secondary);
	}

	.error {
		color: var(--color-danger);
	}

	.error:empty {
		display: none;
	}
</style>
