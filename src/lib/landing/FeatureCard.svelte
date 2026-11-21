<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<article>
	<h3>{title}</h3>
	<p>{@render children()}</p>
</article>

<style>
	article {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-5);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
	}

	/* Large enough to hold its own beside the headline, and still smaller than the donation title. */
	h3 {
		margin: 0;
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
