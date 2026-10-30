<script lang="ts">
	import type { Budget } from '../budget/model';
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';

	let {
		budget,
		itemCount,
		open = $bindable(false),
		onconfirm
	}: {
		/** The Budget about to be deleted; named so the user knows exactly which one. */
		budget: Budget | null;
		itemCount: number;
		open?: boolean;
		onconfirm: () => void;
	} = $props();

	const name = $derived(budget && budget.name.trim() !== '' ? budget.name : 'Untitled Budget');
	const items = $derived(
		itemCount === 0 ? 'It has no items.' : itemCount === 1 ? 'Its 1 item is deleted with it.' : `Its ${itemCount} items are deleted with it.`
	);
</script>

<Dialog
	bind:open
	title="Delete “{name}”?"
	description="This permanently deletes the Budget. {items} It cannot be undone."
>
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			variant="destructive"
			onclick={() => {
				open = false;
				onconfirm();
			}}
		>
			Delete Budget
		</Button>
	{/snippet}
</Dialog>
