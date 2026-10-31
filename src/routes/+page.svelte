<main>
	<h1>BuBu</h1>
	<p>A cosy little budget builder</p>
	<!-- Temporary entry point until the landing page (LUL-24) replaces this placeholder. -->
	<a class="cta" href="/budgets">Your Budgets</a>
</main>

<style>
	main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-8) var(--space-4);
		text-align: center;
	}

	h1 {
		margin: 0;
		color: var(--color-accent);
		font-size: var(--font-size-display);
	}

	p {
		margin: 0 0 var(--space-3);
		color: var(--color-text-secondary);
	}

	.cta {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-height);
		padding: 0 var(--space-6);
		border-radius: var(--radius-full);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: var(--font-weight-medium);
		text-decoration: none;
	}

	.cta:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}
</style>
