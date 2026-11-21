<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Card } from 'stdf';

	let { title, children: content }: { title: string; children: Snippet } = $props();
</script>

<!-- stdf's Card draws the box (surface, radius, shadow); the article keeps it a labelled landmark-free group with a real heading. -->
<article>
	<Card mx="0" my="0" p="6" radius="lg" shadow="sm" injClass="h-full border border-(--color-border)">
		{#snippet children()}
			<h3>{title}</h3>
			<p>{@render content()}</p>
		{/snippet}
	</Card>
</article>

<style>
	article {
		display: flex;
	}

	article > :global(*) {
		flex: 1;
	}

	/* Large enough to hold its own beside the headline, and still smaller than the donation title. */
	h3 {
		margin: 0 0 var(--space-2);
		font-size: clamp(1.0625rem, 1.2vw, 1.25rem);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	p {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--font-size-title3);
		line-height: var(--line-height-body);
	}
</style>
