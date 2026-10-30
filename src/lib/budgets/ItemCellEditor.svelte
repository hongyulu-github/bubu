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
		/**
		 * Where the keyboard wants to go after this cell: `down` after Enter, `next`/`previous` after
		 * Tab/Shift+Tab, `cancel` after Escape. Returns whether it moved focus; when it did not (the end
		 * of the grid) Tab is left to the browser.
		 */
		onnavigate?: (action: 'down' | 'next' | 'previous' | 'cancel') => boolean;
	}

	let { field, label, value, oncommit, onnavigate }: Props = $props();

	// The uncommitted editing buffer lives here, never in shared state. It only reaches state
	// through `oncommit`, and is replaced whenever the committed value changes (a commit, an undo).
	let buffer = $state('');
	let error = $state<string | undefined>(undefined);
	$effect(() => {
		buffer = value;
		error = undefined;
	});

	/** Commit the buffer. Returns false only when it was rejected, so the caller must stay put. */
	function commit(): boolean {
		if (buffer === value) return true;
		const result = oncommit(buffer);
		error = result.ok ? undefined : result.message;
		return result.ok;
	}

	function cancel() {
		buffer = value;
		error = undefined;
	}

	function handleKey(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey) return;

		if (event.key === 'Escape') {
			cancel();
			if (onnavigate?.('cancel')) event.preventDefault();
			return;
		}

		let action: 'down' | 'next' | 'previous';
		if (event.key === 'Enter' && !event.shiftKey) action = 'down';
		else if (event.key === 'Tab') action = event.shiftKey ? 'previous' : 'next';
		else return;

		if (!commit()) {
			event.preventDefault(); // invalid: stay in this cell with the validation showing
			return;
		}
		if (onnavigate?.(action)) event.preventDefault();
		else if (event.key === 'Enter') event.preventDefault(); // Enter never submits anything
	}

	// True while the input holds text that has not been committed: then the browser's own text undo
	// owns Ctrl/Cmd+Z, and the editor-wide Item undo must not take it.
	const dirty = $derived(buffer !== value);

	const numeric = $derived(field === 'quantity' || field === 'unitPrice');
</script>

<!--
	Keys while editing: Enter commits and moves down, Tab/Shift+Tab commit and move to the next or
	previous editable cell, Escape abandons the edit and restores the committed value. A rejected
	commit keeps the cursor here with its message showing. Other keys, arrows included, just edit text.
-->
<div class="editor" role="presentation" data-dirty={dirty ? '' : undefined} onkeydown={handleKey}>
	{#if numeric}
		<NumberInput
			{label}
			hideLabel
			compact
			kind={field === 'quantity' ? 'quantity' : 'amount'}
			bind:value={buffer}
			{error}
			tabindex={-1}
			onchange={commit}
		/>
	{:else}
		<Input {label} hideLabel compact bind:value={buffer} {error} tabindex={-1} onchange={commit} />
	{/if}
</div>

<style>
	.editor {
		width: 100%;
	}
</style>
