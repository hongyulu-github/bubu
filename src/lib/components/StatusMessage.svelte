<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Alert } from 'flowbite-svelte';

	interface Props {
		/** Errors and warnings are announced at once; success and information wait for a pause. */
		kind?: 'error' | 'warning' | 'success' | 'info';
		/** What happened, in a few words: the operation that failed. */
		title?: string;
		/** Lets a control point at this message with aria-describedby or aria-errormessage. */
		id?: string;
		children?: Snippet;
		/** Controls beside the message, such as "Try again". */
		actions?: Snippet;
	}

	let { kind = 'error', title, id, children, actions }: Props = $props();

	const tone = {
		error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100',
		warning: 'border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-100',
		success: 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100',
		info: 'border-gray-300 bg-gray-50 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100'
	} as const;
</script>

<!--
	The one look for a message about what just happened: Flowbite's Alert with a shared tone per kind, so an error reads the
	same in light and dark mode wherever it appears. It is only rendered while there is something to say, so a later
	successful action removes it by clearing the state that holds it.
-->
<Alert {id} role={kind === 'error' || kind === 'warning' ? 'alert' : 'status'} data-kind={kind} class="flex flex-wrap items-center justify-between gap-3 border {tone[kind]}">
	<div class="min-w-0">
		{#if title}<p class="font-semibold">{title}</p>{/if}
		{#if children}<div>{@render children()}</div>{/if}
	</div>
	{#if actions}<div class="flex items-center gap-2">{@render actions()}</div>{/if}
</Alert>
