<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'id'> {
		/** Visible label; always rendered so the field has an accessible name. */
		label: string;
		value?: string;
		hint?: string;
		/** Validation message. Marks the field invalid and is announced politely. */
		error?: string;
		/** Keep the label for assistive technology but hide it visually (e.g. inside a table cell). */
		hideLabel?: boolean;
		/** Tighter, borderless-until-hover styling for dense layouts such as spreadsheet cells. */
		compact?: boolean;
		/** Right-align the value and use tabular figures. */
		numeric?: boolean;
	}

	let { label, value = $bindable(''), hint, error, disabled, hideLabel = false, compact = false, numeric = false, ...rest }: Props = $props();

	const id = $props.id();
	const hintId = `${id}-hint`;
	const messageId = `${id}-message`;
</script>

<div class="field" class:compact>
	<label for={id} class:visually-hidden={hideLabel}>{label}</label>
	<input
		{id}
		bind:value
		class:numeric
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
		font-weight: var(--font-weight-semibold);
		color: var(--color-text);
	}

	input {
		min-height: var(--control-height);
		padding: 0 var(--space-3);
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

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	input.numeric {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	.compact,
	.compact input {
		width: 100%;
		min-width: 0;
	}

	.compact input {
		min-height: var(--icon-button-size);
		padding: 0 var(--space-2);
		border-color: transparent;
		border-radius: var(--radius-sm);
		background: transparent;
	}

	.compact input:hover:not(:disabled) {
		border-color: var(--color-border-strong);
	}

	.compact input[aria-invalid='true'] {
		border-color: var(--color-danger);
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
