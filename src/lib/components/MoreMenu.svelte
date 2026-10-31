<script lang="ts">
	import IconButton from './IconButton.svelte';
	import Menu, { type MenuItem } from './Menu.svelte';

	/** The "⋯" overflow menu: one icon button that opens a list of secondary actions. */
	let { items, label }: { items: readonly MenuItem[]; label: string } = $props();

	let open = $state(false);
	let trigger: HTMLElement | undefined = $state();
	// Pressing the button while the menu is open light-dismisses it first; that same click must not reopen it.
	let wasOpenOnPress = false;

	function toggle() {
		const closedByThisPress = wasOpenOnPress;
		wasOpenOnPress = false;
		if (!open && !closedByThisPress) open = true;
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- records the press only; the button inside is the control -->
<span class="more" bind:this={trigger} onpointerdown={() => (wasOpenOnPress = open)}>
	<IconButton icon="more" {label} aria-haspopup="menu" aria-expanded={open} onclick={toggle} />
</span>
{#if open && trigger}
	<Menu {items} {label} anchor={trigger} onclose={() => (open = false)} />
{/if}

<style>
	.more {
		display: inline-flex;
	}
</style>
