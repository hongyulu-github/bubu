<script lang="ts">
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';

	let {
		budgetCount,
		open = $bindable(false),
		onconfirm
	}: {
		/** How many Budgets are about to be removed, so the user knows the scale. */
		budgetCount: number;
		open?: boolean;
		onconfirm: () => void;
	} = $props();

	const scope = $derived(
		budgetCount === 0 ? 'every Bubu Budget' : budgetCount === 1 ? 'your 1 Budget' : `all ${budgetCount} of your Budgets`
	);
</script>

<Dialog
	bind:open
	title="Clear all Bubu data?"
	description="This permanently removes {scope} and every item in them from this browser. It cannot be undone, and Undo cannot bring them back. Anything else saved in your browser is left alone."
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
			Clear all Bubu data
		</Button>
	{/snippet}
</Dialog>
