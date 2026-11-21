<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import Landing from '#lib/landing/Landing.svelte';

	let landing: ReturnType<typeof Landing>;

	// "/?budgets" is where the editor's back link and the old /budgets address lead, "/?new" the old /budgets/new:
	// open the drawer on that view, then tidy the address so a reload or going back does not reopen it. The tidy-up must
	// not be a navigation: a click made straight away would cancel it and leave "?budgets" in the history.
	onMount(async () => {
		const asked = new URLSearchParams(location.search);
		const view = asked.has('new') ? 'new' : asked.has('budgets') ? 'list' : null;
		if (!view) return;
		landing.show(view);
		await tick();
		try {
			replaceState('/', {});
		} catch {
			// the router is not ready yet (a page that was loaded directly at this address): navigate instead
			void goto('/', { replace: true, reset: false });
		}
	});
</script>

<Landing bind:this={landing} navigate={(path) => goto(path)} />
