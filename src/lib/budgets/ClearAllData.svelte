<script lang="ts">
	import type { MenuItem } from '../components/Menu.svelte';
	import MoreMenu from '../components/MoreMenu.svelte';
	import { budgetStore, type BudgetStore } from '../state/budgets.svelte';
	import ConfirmClearDataDialog from './ConfirmClearDataDialog.svelte';

	let {
		store = budgetStore,
		onmessage
	}: {
		store?: BudgetStore;
		/** Told what happened, in words, so the caller can announce it. */
		onmessage?: (message: string) => void;
	} = $props();

	let confirming = $state(false);

	// Rare and permanent, so it lives in a "⋯" menu (destructive item, red, with an ellipsis because it asks again)
	// and not as a button on the page; the dialog is the real confirmation. Nothing to clear means no menu.
	const items: MenuItem[] = [
		{ id: 'clear', label: 'Clear all Bubu data…', icon: 'trash', destructive: true, onselect: () => (confirming = true) }
	];

	function confirm() {
		const result = store.clearAll();
		onmessage?.(result.ok ? 'All Bubu data was cleared.' : 'Bubu data could not be cleared.');
	}
</script>

{#if store.hydrationStatus === 'ready' && store.budgets.length > 0}
	<MoreMenu label="More actions" {items} />
{/if}
<ConfirmClearDataDialog budgetCount={store.budgets.length} bind:open={confirming} onconfirm={confirm} />
