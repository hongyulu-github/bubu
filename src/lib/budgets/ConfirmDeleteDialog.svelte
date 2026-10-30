<script lang="ts">
	import type { DeletionImpact } from '../budget/delete';
	import Button from '../components/Button.svelte';
	import Dialog from '../components/Dialog.svelte';

	let {
		impact,
		open = $bindable(false),
		onconfirm
	}: {
		/** What deleting would remove; the dialog names it so nothing is a surprise. */
		impact: DeletionImpact | null;
		open?: boolean;
		onconfirm: () => void;
	} = $props();

	const SHOWN = 5;
	const label = (text: string) => (text.trim() === '' ? 'Untitled item' : text);
	const count = $derived(impact?.descendantDescriptions.length ?? 0);
	const shown = $derived(impact?.descendantDescriptions.slice(0, SHOWN) ?? []);
	const plural = (n: number) => (n === 1 ? 'item' : 'items');
</script>

<Dialog
	bind:open
	title="Delete “{label(impact?.description ?? '')}”?"
	description="This removes the {impact?.kind ?? 'item'} and {count} {plural(count)} inside it. You can undo this."
>
	{#if impact}
		<ul class="impact" aria-label="Items that will be deleted">
			{#each shown as name}
				<li>{label(name)}</li>
			{/each}
			{#if count > shown.length}
				<li class="more">and {count - shown.length} more</li>
			{/if}
		</ul>
		{#if impact.parent?.becomesLine}
			<p class="note">
				“{label(impact.parent.description)}” has no other items, so it becomes a Line and its Unit price resets to 0.
			</p>
		{/if}
	{/if}
	{#snippet footer()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			variant="destructive"
			onclick={() => {
				open = false;
				onconfirm();
			}}
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.impact {
		margin: 0;
		padding-left: var(--space-5);
		color: var(--color-text);
	}

	.more {
		color: var(--color-text-secondary);
		list-style: none;
		margin-left: calc(var(--space-5) * -1);
	}

	.note {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
	}
</style>
