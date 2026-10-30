<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		/** Action buttons, rendered in the footer. */
		footer?: Snippet;
		/** Called when the user dismisses the dialog with Escape or by clicking the backdrop. */
		oncancel?: () => void;
	}

	let { open = $bindable(false), title, description, children, footer, oncancel }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;

	const duration = $derived(prefersReducedMotion.current ? 0 : 180);

	/**
	 * Opens the native modal dialog (focus trap, inert page, Escape) and remembers the previously
	 * focused element. On removal the dialog is closed and focus returns to that element.
	 */
	function modal(node: HTMLDialogElement) {
		const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		node.showModal();
		return () => {
			if (node.open) node.close();
			returnFocusTo?.focus();
		};
	}

	function cancel() {
		open = false;
		oncancel?.();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
	<dialog
		{@attach modal}
		in:scale={{ start: 0.96, duration }}
		aria-labelledby={titleId}
		aria-describedby={description ? descriptionId : undefined}
		oncancel={(event) => {
			event.preventDefault();
			cancel();
		}}
		onclick={(event) => {
			if (event.target === event.currentTarget) cancel();
		}}
	>
		<div class="panel" in:fade={{ duration }}>
			<h2 id={titleId}>{title}</h2>
			{#if description}
				<p class="description" id={descriptionId}>{description}</p>
			{/if}
			{@render children?.()}
			{#if footer}
				<div class="footer">{@render footer()}</div>
			{/if}
		</div>
	</dialog>
{/if}

<style>
	dialog {
		width: min(28rem, calc(100vw - var(--space-6)));
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-raised);
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
		gap: var(--space-4);
		padding: var(--space-5);
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
