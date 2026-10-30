<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'id'> {
		/** Visible label; always rendered so the field has an accessible name. */
		label: string;
		value?: string;
		hint?: string;
		/** Validation message. Marks the field invalid and is announced politely. */
		error?: string;
	}

	let { label, value = $bindable(''), hint, error, disabled, ...rest }: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const messageId = `${id}-message`;
</script>

<div class="field">
	<label for={id}>{label}</label>
	<input
		{id}
		bind:value
		{disabled}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={[hint ? hintId : '', messageId].filter(Boolean).join(' ')}
		{...rest}
	/>
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

	input {
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
	}

	input:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	input[aria-invalid='true'] {
		border-color: var(--color-danger);
	}

	input:disabled {
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
