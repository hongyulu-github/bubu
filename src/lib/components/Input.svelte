<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { Helper, Input as FlowbiteInput, Label } from 'flowbite-svelte';

	interface Props extends Omit<HTMLInputAttributes, 'value' | 'id' | 'class'> {
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

<!-- Flowbite's Label, Input and Helper are the field: a real <label for>, a native <input> that carries aria-invalid and aria-describedby, and the hint and the always-present polite message below. -->
<div class="flex flex-col gap-1">
	<Label for={id} class={hideLabel ? 'sr-only' : ''}>{label}</Label>
	<FlowbiteInput
		{id}
		bind:value
		{disabled}
		size={compact ? 'sm' : 'md'}
		color={error ? 'red' : 'default'}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={[hint ? hintId : '', messageId].filter(Boolean).join(' ')}
		class={[compact ? 'border-transparent bg-transparent dark:border-transparent hover:border-gray-500 dark:hover:border-gray-400' : 'border-gray-500 dark:border-gray-400', 'dark:bg-transparent', numeric && 'text-end tabular-nums']}
		{...rest as Record<string, unknown>}
	/>
	{#if hint}
		<Helper id={hintId}>{hint}</Helper>
	{/if}
	<Helper id={messageId} color="red" aria-live="polite" class="empty:hidden">{error ?? ''}</Helper>
</div>
