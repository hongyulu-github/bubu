<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Modal } from 'flowbite-svelte';
	import { focusReturn } from './focus.svelte';

	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		children?: Snippet;
		/** Action buttons, rendered in the footer. */
		footer?: Snippet;
		/** Called when the user dismisses the dialog with Escape or by clicking outside it. */
		oncancel?: () => void;
	}

	let { open = $bindable(false), title, description, children: body, footer: actions, oncancel }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;
	const descriptionId = `${id}-description`;
	const focus = focusReturn(
		() => open,
		() => (open = false)
	);
</script>

<!-- Flowbite's Modal is the dialog: a native modal <dialog>, so the page behind is locked, focus moves in and returns to what opened it, and Escape closes it. Modal does not name itself from its title, so the heading and description are linked here. The X button is off (the footer has the actions); Escape and a click outside report through `oncancel`. -->
<Modal
	bind:open
	size="xs"
	dismissable={false}
	{oncancel}
	ontoggle={focus.closed}
	aria-labelledby={titleId}
	aria-describedby={description ? descriptionId : undefined}
	footer={actions ? footerContent : undefined}
>
	{#snippet header()}
		<h2 id={titleId}>{title}</h2>
	{/snippet}
	{#if description}
		<p id={descriptionId}>{description}</p>
	{/if}
	{@render body?.()}
</Modal>

{#snippet footerContent()}
	{@render actions?.()}
{/snippet}
