<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import { ChevronDownOutline } from 'flowbite-svelte-icons';
	import { Helper, Label, Select as FlowbiteSelect } from 'flowbite-svelte';

	interface Props extends Omit<HTMLSelectAttributes, 'value' | 'id' | 'children' | 'class'> {
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

<!-- Flowbite's Label, Select and Helper are the field: a real <label for>, a native <select> that carries aria-invalid and aria-describedby, and the hint and polite message below. The options are written out so the empty first option stays selectable. -->
<div class="flex flex-col gap-1">
	<Label for={id}>{label}</Label>
	<div class="relative">
	<FlowbiteSelect
		{id}
		bind:value
		disabled={disabled ?? false}
		placeholder=""
		color={error ? 'red' : 'default'}
		classes={{ select: "border-gray-500 appearance-none pe-10 dark:border-gray-400" }}
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={[hint ? hintId : '', messageId].filter(Boolean).join(' ')}
		{...rest as Record<string, unknown>}
	>
		{#if placeholder !== undefined}
			<option value="">{placeholder}</option>
		{/if}
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</FlowbiteSelect>
	<ChevronDownOutline class="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-gray-500 dark:text-gray-400" aria-hidden="true" />
	</div>
	{#if hint}
		<Helper id={hintId}>{hint}</Helper>
	{/if}
	<Helper id={messageId} color="red" aria-live="polite" class="empty:hidden">{error ?? ''}</Helper>
</div>
