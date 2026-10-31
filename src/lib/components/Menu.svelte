<script lang="ts" module>
	import type { IconName } from './Icon.svelte';

	export interface MenuItem {
		id: string;
		label: string;
		icon?: IconName;
		/** Listed last by convention; shown in the danger colour. */
		destructive?: boolean;
		/** Draws a divider above this item to start a new group (keep to about three groups). */
		separatorBefore?: boolean;
		onselect: () => void;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		items: readonly MenuItem[];
		label: string;
		/** Open beside an element (the "more" button) or at a pointer position (a context menu). */
		anchor: HTMLElement | { x: number; y: number };
		onclose: () => void;
	}

	let { items, label, anchor, onclose }: Props = $props();

	let menu: HTMLElement | undefined = $state();

	function entries(): HTMLElement[] {
		return menu ? [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')] : [];
	}

	// A popover="auto" panel sits in the top layer, closes on outside click and Escape, and the browser
	// returns focus to what had it before. Position it, then move focus to the first item.
	$effect(() => {
		if (!menu) return;
		menu.showPopover();
		const box = menu.getBoundingClientRect();
		const point =
			anchor instanceof HTMLElement
				? (({ right, bottom }) => ({ x: right - box.width, y: bottom + 4 }))(anchor.getBoundingClientRect())
				: anchor;
		menu.style.left = `${Math.max(8, Math.min(point.x, window.innerWidth - box.width - 8))}px`;
		menu.style.top = `${Math.max(8, Math.min(point.y, window.innerHeight - box.height - 8))}px`;
		entries()[0]?.focus();
	});

	function ontoggle(event: Event) {
		if ((event as ToggleEvent).newState === 'closed') onclose();
	}

	function onkeydown(event: KeyboardEvent) {
		const all = entries();
		const at = all.indexOf(document.activeElement as HTMLElement);
		const move = (index: number) => {
			event.preventDefault();
			all[(index + all.length) % all.length]?.focus();
		};
		if (event.key === 'ArrowDown') move(at + 1);
		else if (event.key === 'ArrowUp') move(at - 1);
		else if (event.key === 'Home') move(0);
		else if (event.key === 'End') move(all.length - 1);
		else if (event.key === 'Tab') menu?.hidePopover();
	}

	function choose(item: MenuItem) {
		menu?.hidePopover(); // focus goes back to the trigger first, so `onselect` can move it on
		item.onselect();
	}
</script>

<div class="menu" popover="auto" role="menu" tabindex="-1" aria-label={label} bind:this={menu} {ontoggle} {onkeydown}>
	{#each items as item (item.id)}
		{#if item.separatorBefore}<div class="separator" role="separator"></div>{/if}
		<button type="button" role="menuitem" class:destructive={item.destructive} tabindex="-1" onclick={() => choose(item)}>
			{#if item.icon}<Icon name={item.icon} />{/if}
			<span>{item.label}</span>
		</button>
	{/each}
</div>

<style>
	.menu {
		position: fixed;
		inset: auto;
		margin: 0;
		min-width: 11rem;
		padding: var(--space-1);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
	}

	button {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: var(--control-height);
		padding: 0 var(--space-3);
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--font-size-callout);
		text-align: start;
		cursor: pointer;
	}

	button:hover,
	button:focus-visible {
		background: var(--color-selected);
		outline: none;
	}

	button:focus-visible {
		box-shadow: inset 0 0 0 var(--focus-ring-width) var(--color-focus-ring);
	}

	.destructive {
		color: var(--color-danger);
	}

	.separator {
		height: 1px;
		margin: var(--space-1) var(--space-2);
		background: var(--color-border);
	}
</style>
