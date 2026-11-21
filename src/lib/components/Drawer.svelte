<script lang="ts">
	import type { Snippet } from 'svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		open?: boolean;
		title: string;
		children?: Snippet;
		/** Controls beside the title, left of the close button (for example a "⋯" menu). */
		actions?: Snippet;
		/** Called when the drawer is closed by the close button, Escape or a click on the backdrop. */
		onclose?: () => void;
	}

	let { open = $bindable(false), title, children, actions, onclose }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;

	/**
	 * A side panel over the page, built on the native modal dialog like `Dialog`: the page behind it is inert,
	 * focus stays inside, Escape closes it, and focus returns to what opened it.
	 */
	function modal(node: HTMLDialogElement) {
		const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		node.showModal();
		return () => {
			if (node.open) node.close();
			returnFocusTo?.focus();
		};
	}

	function close() {
		open = false;
		onclose?.();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<dialog
		{@attach modal}
		aria-labelledby={titleId}
		oncancel={(event) => {
			event.preventDefault();
			close();
		}}
		onclick={(event) => {
			if (event.target === event.currentTarget) close();
		}}
	>
		<div class="panel">
			<header>
				<h2 id={titleId}>{title}</h2>
				<div class="controls">
					{@render actions?.()}
					<IconButton icon="close" label="Close" onclick={close} />
				</div>
			</header>
			<div class="body">{@render children?.()}</div>
		</div>
	</dialog>
{/if}

<style>
	/* Pinned to the right edge, full height, a third of the window wide (never narrower than a phone-sized form needs).
	   It appears at once, with no sliding. Tailwind's reset zeroes margins, so auto margins place it. */
	dialog {
		margin: 0 0 0 auto;
		width: min(100vw, max(28rem, 33.34vw));
		max-width: none; /* the browser's own dialog rule would leave a gap at the edge on a narrow screen */
		height: 100dvh;
		max-height: 100dvh;
		padding: 0;
		border: none;
		border-left: 1px solid var(--color-border);
		border-radius: var(--radius-xl) 0 0 var(--radius-xl);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
		overflow: hidden;
	}

	dialog::backdrop {
		background: var(--color-overlay);
	}

	dialog:focus-visible {
		outline: none;
	}

	.panel {
		display: flex;
		flex-direction: column;
		height: 100%;
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
