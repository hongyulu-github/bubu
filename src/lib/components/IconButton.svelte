<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Button, Tooltip } from 'flowbite-svelte';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props extends Omit<HTMLButtonAttributes, 'children' | 'class'> {
		icon: IconName;
		/** The accessible name, and the first line of the tooltip. */
		label: string;
		/** Shown in the tooltip, e.g. "⌘Z". Announced through aria-keyshortcuts where the caller sets it. */
		shortcut?: string;
		destructive?: boolean;
	}

	let { icon, label, shortcut, destructive = false, type = 'button', ...rest }: Props = $props();
</script>

<!-- Flowbite's Tooltip is the hint: it opens on hover and on keyboard focus, and Escape closes it. It follows the button, which is how it finds its trigger. -->
<Button {type} {...rest as Record<string, unknown>} aria-label={label} color="alternative" size="xs" class={['border-0 p-1.5', destructive && 'text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400']}>
	<Icon name={icon} />
</Button>
<Tooltip placement="top" triggerDelay={450}>
	{label}{#if shortcut}<kbd class="ms-2 font-sans opacity-75">{shortcut}</kbd>{/if}
</Tooltip>
