<script lang="ts">
	import type { Snippet } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { Drawer } from 'flowbite-svelte';
	import { focusReturn } from './focus.svelte';
	import IconButton from './IconButton.svelte';

	interface Props {
		open?: boolean;
		title: string;
		children?: Snippet;
		/** Controls beside the title, left of the close button (for example a "⋯" menu). */
		actions?: Snippet;
		/** Called when the drawer is closed by the close button, Escape or a click outside it. */
		onclose?: () => void;
		/** Start focus on the title. Turn off when the body opens with a field that should take focus instead. */
		focusTitle?: boolean;
	}

	let { open = $bindable(false), title, children: body, actions, onclose, focusTitle = true }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;

	const focus = focusReturn(
		() => open,
		() => (open = false)
	);

	function close() {
		open = false;
		onclose?.();
	}
</script>

<!-- Flowbite's Drawer is the panel (focus starts on the title, `data-autofocus`, not on the first button, which would be a menu with its tooltip showing): a native modal <dialog> on the right edge, so the page behind is locked, focus stays inside and Escape closes it. It slides in and back out (none for people who prefer reduced motion). Its own X button is off: the header has the title, any actions, and a Close button. -->
<Drawer
	bind:open
	placement="right"
	dismissable={false}
	focustrap
	oncancel={() => onclose?.()}
	ontoggle={focus.closed}
	transitionParams={{ duration: prefersReducedMotion.current ? 0 : 300 }}
	aria-labelledby={titleId}
	class="w-full max-w-md"
>
	<div data-drawer-header class="mb-4 flex items-center justify-between gap-3">
		<h2 id={titleId} tabindex="-1" data-autofocus={focusTitle ? "" : undefined} class="text-xl outline-none font-semibold text-gray-900 dark:text-white">{title}</h2>
		<div class="flex items-center gap-1">
			{@render actions?.()}
			<IconButton icon="close" label="Close" onclick={close} />
		</div>
	</div>
	{@render body?.()}
</Drawer>
