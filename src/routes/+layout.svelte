<script lang="ts">
	import '#lib/styles/stdf.css';
	import '#lib/styles/tokens.css';
	import '#lib/styles/base.css';
	import favicon from '#lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { ConfigProvider, en_US } from 'stdf';
	import { budgetPersistence, budgetStore } from '#lib';
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

<ConfigProvider locale={en_US}>
{#if budgetPersistence.failures.length > 0}
	<!-- Minimal on purpose: the shared error presentation (LUL-30) will replace this. -->
	<div class="save-error" role="alert">
		<span>Your changes are not being saved: {budgetPersistence.failures[0].error.message}</span>
		<button type="button" onclick={() => budgetPersistence.flush()}>Try again</button>
	</div>
{/if}

{@render children()}
</ConfigProvider>

<style>
	.save-error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		background: var(--color-danger);
		color: var(--color-on-danger);
		font-size: var(--font-size-callout);
	}

	.save-error button {
		min-height: 2.25rem;
		padding: 0 var(--space-3);
		border: 1px solid currentColor;
		border-radius: var(--radius-sm);
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}

	.save-error button:focus-visible {
		outline: var(--focus-ring-width) solid currentColor;
		outline-offset: var(--focus-ring-offset);
	}
</style>
