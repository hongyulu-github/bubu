<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLButtonAttributes, 'children'> {
		variant?: 'primary' | 'secondary' | 'destructive';
		/** Smaller, for dense layouts such as table rows. */
		compact?: boolean;
		children: Snippet;
	}

	let { variant = 'secondary', compact = false, type = 'button', children, ...rest }: Props = $props();
</script>

<button {type} class="button {variant}" class:compact {...rest}>
	{@render children()}
</button>

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: var(--control-height);
		padding: 0 var(--space-5);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		font: inherit;
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color var(--duration-fast),
			opacity var(--duration-fast);
	}

	.compact {
		min-height: 2.25rem;
		padding: 0 var(--space-3);
		font-size: var(--font-size-callout);
	}

	.button:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.button:active:not(:disabled) {
		opacity: 0.8;
	}

	.primary {
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.secondary {
		background: var(--color-surface);
		border-color: var(--color-border-strong);
		color: var(--color-text);
	}

	.destructive {
		background: var(--color-danger);
		color: var(--color-on-danger);
	}

	.button:disabled {
		background: var(--color-disabled-bg);
		border-color: transparent;
		color: var(--color-disabled-text);
		cursor: not-allowed;
	}

	@media (prefers-reduced-motion: reduce) {
		.button {
			transition: none;
		}
	}
</style>
