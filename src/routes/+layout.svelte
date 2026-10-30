<script lang="ts">
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { budgetStore } from '#lib';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Load saved Budgets once per page session, in the browser only. Navigating between the list
	// and editors must not re-read storage over in-memory state.
	onMount(() => {
		if (budgetStore.hydrationStatus === 'idle') budgetStore.hydrate();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
