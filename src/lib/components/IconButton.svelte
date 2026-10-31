<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { Button as StdfButton } from 'stdf';
	import Icon, { type IconName } from './Icon.svelte';

	interface Props extends Omit<HTMLButtonAttributes, 'children'> {
		icon: IconName;
		/** The accessible name, and the first line of the tooltip. */
		label: string;
		/** Shown in the tooltip, e.g. "⌘Z". Announced through aria-keyshortcuts where the caller sets it. */
		shortcut?: string;
		destructive?: boolean;
	}

	let { icon, label, shortcut, destructive = false, disabled = false, type = 'button', onclick, ...rest }: Props = $props();

	let host: HTMLElement | undefined = $state();
	let tip: HTMLElement | undefined = $state();
	let dismissed = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	// stdf's Button takes few props: the name and any other attribute go onto its real <button>.
	function forward(node: HTMLElement) {
		const button = node.querySelector('button');
		if (!button) return;
		button.setAttribute('aria-label', label);
		for (const [name, value] of Object.entries(rest)) {
			if (value === undefined || value === null) button.removeAttribute(name);
			else if (value === false && !name.startsWith('aria-')) button.removeAttribute(name);
			else button.setAttribute(name, value === true && !name.startsWith('aria-') ? '' : String(value));
		}
	}

	// The tooltip lives in the top layer (popover) so a scrolling table never clips it.
	function show() {
		if (!tip || !host || dismissed || host.querySelector('[aria-expanded="true"]')) return; // no tooltip over an open menu
		const anchor = host.getBoundingClientRect();
		try {
			tip.showPopover();
		} catch {
			return; // another popover is mid-show; the label is still on the button
		}
		const box = tip.getBoundingClientRect();
		const left = Math.min(Math.max(8, anchor.left + anchor.width / 2 - box.width / 2), window.innerWidth - box.width - 8);
		const above = anchor.top - box.height - 6 >= 8;
		tip.style.left = `${left}px`;
		tip.style.top = `${above ? anchor.top - box.height - 6 : anchor.bottom + 6}px`;
	}

	function hide() {
		clearTimeout(timer);
		if (tip?.matches(':popover-open')) tip.hidePopover();
	}

	function onpointerenter() {
		dismissed = false;
		timer = setTimeout(show, 450);
	}

	function onfocusin(event: FocusEvent) {
		if ((event.target as HTMLElement).matches(':focus-visible')) show();
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && tip?.matches(':popover-open')) {
			dismissed = true; // dismiss without closing anything else
			hide();
		}
	}

	$effect(() => () => clearTimeout(timer));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -- these listeners only show the tooltip; the button inside is the control -->
<span
	class="host"
	class:destructive
	bind:this={host}
	{@attach forward}
	{onpointerenter}
	onpointerleave={hide}
	{onfocusin}
	onfocusout={hide}
	{onkeydown}
>
	<StdfButton
		fill="text"
		size="auto"
		customSize
		heightOut="0"
		heightIn="0"
		customWidth={28}
		customHeight={28}
		type={type ?? 'button'}
		disabled={disabled ?? false}
		onclick={onclick ? (onclick as () => void) : undefined}
		injClass="p-0"
	>
		<Icon name={icon} />
	</StdfButton>
	<!-- Visual only: the accessible name is on the button, and shortcuts are in aria-keyshortcuts. -->
	<span class="tip" popover="manual" aria-hidden="true" bind:this={tip}>
		{label}{#if shortcut}<kbd>{shortcut}</kbd>{/if}
	</span>
</span>

<style>
	.host {
		display: inline-flex;
		flex: none;
		color: var(--color-text-secondary);
	}

	.host:hover:not(:has(button:disabled)) {
		color: var(--color-accent);
	}

	.host.destructive:hover:not(:has(button:disabled)) {
		color: var(--color-danger);
	}

	.host :global(button) {
		width: var(--icon-button-size) !important;
		height: var(--icon-button-size) !important;
		border-radius: var(--radius-sm);
		color: inherit;
		transition: background-color var(--duration-fast);
	}

	.host :global(button:hover:not(:disabled)) {
		background: var(--color-selected);
	}

	.host :global(button:disabled) {
		color: var(--color-disabled-text);
		cursor: not-allowed;
	}

	.host :global(button:focus-visible) {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: 0;
	}

	.tip {
		position: fixed;
		inset: auto;
		margin: 0;
		padding: var(--space-1) var(--space-2);
		border: none;
		border-radius: var(--radius-sm);
		background: var(--color-text);
		color: var(--color-bg);
		font-size: var(--font-size-footnote);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		pointer-events: none;
	}

	kbd {
		margin-inline-start: var(--space-2);
		font: inherit;
		opacity: 0.75;
	}

	@media (prefers-reduced-motion: reduce) {
		.host :global(button) {
			transition: none;
		}
	}
</style>
