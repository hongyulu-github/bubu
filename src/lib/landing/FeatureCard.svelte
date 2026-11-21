<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card } from 'flowbite-svelte';

	let { title, children: content }: { title: string; children: Snippet } = $props();
</script>

<!-- Flowbite's Card draws the box; the article keeps a real heading in it and lets the cards in a row match in height. -->
<article class="flex">
	<Card size="xl" class="flex-1 p-6">
		<h3 class="mb-2 text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
		<p class="text-base text-gray-500 dark:text-gray-400">{@render content()}</p>
	</Card>
</article>
