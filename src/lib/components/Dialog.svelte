<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Popup } from 'stdf';
	import { lockModal } from './modal';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		/** Action buttons, rendered in the footer. */
		footer?: Snippet;
		/** Called when the user dismisses the dialog with Escape or by clicking the dimmed page. */
		oncancel?: () => void;
	}

	let { open = $bindable(false), title, description, children: body, footer, oncancel }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;

	function cancel() {
		open = false;
		oncancel?.();
	}

	// On only while `open`; see Drawer for why this is an effect here and not an attachment on the panel.
	let panel = $state<HTMLElement>();
	$effect(() => {
		if (open && panel) return lockModal(panel, cancel);
	});
</script>

<!--
	stdf's Popup, centred, draws the dimming and places the panel. Its own centred transition would grow the panel from
	nothing, so that is off (duration 0) and the panel fades and settles in with the small animation below instead. It is
	`transparent` and `size={0}` so the panel sets its own look. stdf has no dialog behaviour, so `modal` adds focus
	handling, Escape and the page lock. A click on the dimmed page closes it (Popup's `onclose`), like Escape.
-->
<Popup bind:visible={open} position="center" size={0} duration={0} outDuration={0} transparent onclose={() => oncancel?.()}>
	{#snippet children()}
		<div
			class="panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}
			aria-describedby={description ? descriptionId : undefined}
			tabindex="-1"
			bind:this={panel}
		>
			<h2 id={titleId}>{title}</h2>
			{#if description}
				<p class="description" id={descriptionId}>{description}</p>
			{/if}
			{@render body?.()}
			{#if footer}
				<div class="footer">{@render footer()}</div>
			{/if}
		</div>
	{/snippet}
</Popup>

<style>
	.panel {
		box-sizing: border-box;
		width: min(28rem, calc(100vw - var(--space-6)));
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
		text-align: start;
		animation: panel-in 160ms ease-out;
	}

	@keyframes panel-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel {
			animation: none;
		}
	}

	.panel:focus-visible {
		outline: none;
	}

	h2 {
		margin: 0;
		font-size: var(--font-size-title);
		line-height: var(--line-height-tight);
	}

	.description {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
	}

	.footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
</style>
