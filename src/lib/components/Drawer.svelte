<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { Popup } from 'stdf';
	import IconButton from './IconButton.svelte';
	import { lockModal } from './modal';

	interface Props {
		open?: boolean;
		title: string;
		children?: Snippet;
		/** Controls beside the title, left of the close button (for example a "⋯" menu). */
		actions?: Snippet;
		/** Called when the drawer is closed by the close button, Escape or a click on the dimmed page. */
		onclose?: () => void;
	}

	let { open = $bindable(false), title, children: body, actions, onclose }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;

	// The drawer slides in from the right edge by its own width, and out again a little faster. Popup needs that
	// distance spelled out because the panel sets its own width; with reduced motion there is no movement at all.
	let windowWidth = $state(0);
	const drawerWidth = $derived.by(() => {
		if (typeof window === 'undefined') return 0;
		const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
		return Math.min(windowWidth, Math.max(28 * rem, windowWidth / 3));
	});
	const still = $derived(prefersReducedMotion.current);

	function close() {
		open = false;
		onclose?.();
	}

	// The page lock, focus handling and Escape are on only while `open`. This effect belongs to the component, not to the
	// panel inside Popup, so it ends the moment `open` turns false, while the panel is still sliding out.
	let panel = $state<HTMLElement>();
	$effect(() => {
		if (open && panel) return lockModal(panel, close);
	});
</script>

<svelte:window bind:innerWidth={windowWidth} />

<!--
	stdf's Popup draws the side panel and the dimming and closes on a click outside, sliding in and out. It is
	`transparent` and `size={0}` so the panel below sets its own look and width (a third of the window, never narrower
	than the form needs). stdf has no dialog behaviour, so `modal` adds focus handling, Escape and the page lock.
-->
<Popup
	bind:visible={open}
	position="right"
	size={0}
	transitionDistance={drawerWidth}
	duration={still ? 0 : 300}
	outDuration={still ? 0 : 220}
	easeType="cubicOut"
	easeOutType="cubicIn"
	transparent
	{onclose}
>
	{#snippet children()}
		<div class="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1" bind:this={panel}>
			<header>
				<h2 id={titleId}>{title}</h2>
				<div class="controls">
					{@render actions?.()}
					<IconButton icon="close" label="Close" onclick={close} />
				</div>
			</header>
			<div class="body">{@render body?.()}</div>
		</div>
	{/snippet}
</Popup>

<style>
	.drawer {
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		width: min(100vw, max(28rem, 33.34vw));
		height: 100%;
		border-left: 1px solid var(--color-border);
		border-radius: var(--radius-xl) 0 0 var(--radius-xl);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
		overflow: hidden;
	}

	.drawer:focus-visible {
		outline: none;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--color-border);
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	h2 {
		margin: 0;
		font-size: var(--font-size-title);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	.body {
		flex: 1;
		min-height: 0;
		overflow: auto;
		padding: var(--space-5);
	}
</style>
