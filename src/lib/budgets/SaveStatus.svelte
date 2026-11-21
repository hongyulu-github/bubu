<script lang="ts">
	import Button from '../components/Button.svelte';
	import StatusMessage from '../components/StatusMessage.svelte';
	import { describeSaveFailure } from '../errors/messages';
	import { budgetPersistence, type BudgetPersistence } from '../state/persistence.svelte';

	let { persistence = budgetPersistence }: { persistence?: BudgetPersistence } = $props();

	const failure = $derived(persistence.failures.length > 0 ? describeSaveFailure(persistence.failures[0]) : null);
</script>

<!--
	Says so when changes are not reaching storage, and nothing otherwise: there is no "saved" state to get wrong. It is
	built from the persistence failures, so it disappears by itself after a save goes through (the retry button, or the
	next change). The work stays on the page meanwhile.
-->
{#if failure}
	<div class="p-3">
		<StatusMessage title={failure.title}>
			{failure.detail}
			{#snippet actions()}
				<Button compact onclick={() => persistence.flush()}>Try again</Button>
			{/snippet}
		</StatusMessage>
	</div>
{/if}
