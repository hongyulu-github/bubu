<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Button as StdfButton } from 'stdf';

	interface Props extends Omit<HTMLButtonAttributes, 'children'> {
		variant?: 'primary' | 'secondary' | 'destructive';
		/** Smaller, for dense layouts such as table rows. */
		compact?: boolean;
		children: Snippet;
	}

	let { variant = 'secondary', compact = false, type = 'button', disabled = false, onclick, children, ...rest }: Props = $props();

	const fill = $derived(variant === 'secondary' ? 'lineState' : 'base');
	const state = $derived(variant === 'destructive' ? 'error' : 'theme');

	// stdf's Button only takes a handful of props. Everything else (aria-label, aria-keyshortcuts,
	// form, data-*) goes straight onto its real <button>, so names and keyboard hints survive.
	function forward(host: HTMLElement) {
		const button = host.querySelector('button');
		if (!button) return;
		for (const [name, value] of Object.entries(rest)) {
			if (value === undefined || value === null) button.removeAttribute(name);
			else if (value === false && !name.startsWith('aria-')) button.removeAttribute(name);
			else button.setAttribute(name, value === true && !name.startsWith('aria-') ? '' : String(value));
		}
	}
</script>

<span class="host" class:destructive={variant === 'destructive'} {@attach forward}>
	<StdfButton
		{fill}
		{state}
		type={type ?? 'button'}
		disabled={disabled ?? false}
		size={compact ? 'sm' : 'md'}
		onclick={onclick ? (onclick as () => void) : undefined}
		injClass={compact ? "px-4 font-medium whitespace-nowrap" : "px-6 font-medium whitespace-nowrap"}
	>
		{@render children()}
	</StdfButton>
</span>

<style>
	.host {
		display: inline-flex;
	}

	/* The theme's error colour with the app's on-danger text: stdf's own pairing is under 4.5:1 on some themes. */
	.destructive :global(button:not(:disabled)) {
		background: var(--color-danger);
		color: var(--color-on-danger);
	}

	.host :global(button:focus-visible) {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
