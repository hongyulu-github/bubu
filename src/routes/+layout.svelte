<script lang="ts">
	import '#lib/styles/theme.css';
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { budgetPersistence, budgetStore } from '#lib';
	import SaveStatus from '#lib/budgets/SaveStatus.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Load saved Budgets once per page session, in the browser only. Navigating between the list
	// and editors must not re-read storage over in-memory state.
	onMount(() => {
		if (budgetStore.hydrationStatus === 'idle') budgetStore.hydrate();
		// From here every change to the shared state is saved automatically, through one path.
		return budgetPersistence.start();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<SaveStatus />

{@render children()}
