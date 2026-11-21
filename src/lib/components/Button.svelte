<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Button as FlowbiteButton } from 'flowbite-svelte';

	interface Props extends Omit<HTMLButtonAttributes, 'children' | 'class'> {
		variant?: 'primary' | 'secondary' | 'destructive';
		/** Smaller, for dense layouts such as table rows. */
		compact?: boolean;
		children: Snippet;
	}

	let { variant = 'secondary', compact = false, type = 'button', children, ...rest }: Props = $props();
</script>

<!-- Flowbite's Button draws and behaves as the button: every attribute is passed through, and its colour, outline and size come from its own props. -->
<FlowbiteButton
	{type}
	{...rest as Record<string, unknown>}
	color={variant === 'destructive' ? 'red' : 'primary'}
	outline={variant === 'secondary'}
	size={compact ? 'sm' : 'md'}
>
	{@render children()}
</FlowbiteButton>
