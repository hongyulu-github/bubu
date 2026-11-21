<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import Landing from '#lib/landing/Landing.svelte';

	let landing: ReturnType<typeof Landing>;

	// "/?budgets" is where the editor's back link and the old /budgets address lead, "/?new" the old /budgets/new:
	// open the drawer on that view, then tidy the address so a reload or a close does not reopen it.
	onMount(() => {
		const asked = new URLSearchParams(location.search);
		const view = asked.has('new') ? 'new' : asked.has('budgets') ? 'list' : null;
		if (!view) return;
		landing.show(view);
		void goto('/', { replace: true, reset: false });
	});
</script>

<Landing bind:this={landing} navigate={(path) => goto(path)} />
