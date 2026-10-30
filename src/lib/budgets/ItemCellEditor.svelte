<script lang="ts">
	import type { EditResult, EditableField } from '../budget/edit';
	import Input from '../components/Input.svelte';
	import NumberInput from '../components/NumberInput.svelte';

	interface Props {
		field: EditableField;
		/** Accessible name, e.g. "Quantity 1.2". */
		label: string;
		/** The committed value held in shared state. */
		value: string;
		/** Try to commit the text. Returns the outcome so a rejection can be shown here. */
		oncommit: (text: string) => EditResult;
	}

	let { field, label, value, oncommit }: Props = $props();

	// The uncommitted editing buffer lives here, never in shared state. It only reaches state
	// through `oncommit`, and is replaced whenever the committed value changes (a commit, an undo).
	let buffer = $state('');
	let error = $state<string | undefined>(undefined);
	$effect(() => {
		buffer = value;
		error = undefined;
	});

	function commit() {
		if (buffer === value) return;
		const result = oncommit(buffer);
		error = result.ok ? undefined : result.message;
	}

	function cancel() {
		buffer = value;
		error = undefined;
	}

	const numeric = $derived(field === 'quantity' || field === 'unitPrice');
</script>

<!-- Escape abandons the edit and restores the committed value. -->
<div class="editor" role="presentation" onkeydown={(event) => event.key === 'Escape' && cancel()}>
	{#if numeric}
		<NumberInput
			{label}
			hideLabel
			compact
			kind={field === 'quantity' ? 'quantity' : 'amount'}
			bind:value={buffer}
			{error}
			onchange={commit}
		/>
	{:else}
		<Input {label} hideLabel compact bind:value={buffer} {error} onchange={commit} />
	{/if}
</div>

<style>
	.editor {
		width: 100%;
	}
</style>
