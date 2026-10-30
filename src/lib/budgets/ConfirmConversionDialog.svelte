<script lang="ts">
	import type { ConversionImpact } from '../budget/convert';
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';

	let {
		impact,
		open = $bindable(false),
		onconfirm
	}: {
		/** What converting would change, from `describeConversion`. */
		impact: ConversionImpact | null;
		open?: boolean;
		onconfirm: () => void;
	} = $props();

	const name = $derived(impact && impact.description.trim() !== '' ? impact.description : 'Untitled item');
</script>

<!--
	Reusable confirmation for turning a Line into a Group. Adding a child uses it now; moving an
	item into a Line (drag and drop) will use the same dialog.
-->
<Dialog
	bind:open
	title="Turn “{name}” into a group?"
	description="Adding an item inside a line makes it a group. A group's Unit price is the total of the items inside it, so the Unit price you entered is replaced. You can undo this."
>
	{#if impact}
		<dl class="facts">
			<dt>Unit price</dt>
			<dd><span class="old">{impact.unitPrice}</span> is replaced by the total of its items</dd>
			<dt>Quantity</dt>
			<dd>{impact.quantity} is kept</dd>
			{#if impact.unit}
				<dt>Unit</dt>
				<dd>{impact.unit} is kept</dd>
			{/if}
		</dl>
	{/if}
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			variant="primary"
			onclick={() => {
				open = false;
				onconfirm();
			}}
		>
			Convert and add item
		</Button>
	{/snippet}
</Dialog>

<style>
	.facts {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--space-1) var(--space-4);
		margin: 0;
	}

	dt {
		color: var(--color-text-secondary);
	}

	dd {
		margin: 0;
	}

	.old {
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-semibold);
	}
</style>
