<script lang="ts">
	import Dialog from '../Dialog.svelte';
	import Drawer from '../Drawer.svelte';

	let { onclose }: { onclose?: () => void } = $props();
	let open = $state(false);
	let asking = $state(false);
</script>

<button type="button" data-outside onclick={() => (open = true)}>Open drawer</button>
<button type="button" data-other>Another control on the page</button>

<Drawer bind:open title="Test drawer" {onclose}>
	{#snippet actions()}<button type="button">Menu</button>{/snippet}
	<button type="button" data-first>First</button>
	<button type="button" data-ask onclick={() => (asking = true)}>Ask</button>
	<Dialog bind:open={asking} title="Are you sure?">
		{#snippet footer()}<button type="button" onclick={() => (asking = false)}>No</button>{/snippet}
	</Dialog>
	<button type="button" data-last>Last</button>
</Drawer>
