<script lang="ts">
	import Button from '../Button.svelte';
	import Dialog from '../Dialog.svelte';
	import Input from '../Input.svelte';

	let { oncancel }: { oncancel?: () => void } = $props();
	let open = $state(false);
	let name = $state('');
</script>

<Button onclick={() => (open = true)}>Open dialog</Button>

<Dialog bind:open title="Rename budget" description="Choose a new name." {oncancel}>
	<Input label="Name" bind:value={name} />
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button variant="primary" onclick={() => (open = false)}>Save</Button>
	{/snippet}
</Dialog>
