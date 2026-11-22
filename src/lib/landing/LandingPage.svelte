<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from '../components/Button.svelte';
	import Seo from '../components/Seo.svelte';
	import Icon from '../components/Icon.svelte';
	import FeatureCard from './FeatureCard.svelte';

	const SPONSOR_URL = 'https://github.com/sponsors/hongyulu-github';

	let {
		oncreate,
		onopenbudgets,
		drawer = null,
		showcases,
		donate
	}: {
		/** Start the normal Budget creation flow: it makes an empty Budget, never one with starter Items. */
		oncreate: () => void;
		/** Open the saved-Budgets side drawer. It never starts creation. */
		onopenbudgets: () => void;
		/** What the side drawer shows right now ('list' or 'new'), or null while it is closed: the buttons that open it say so. */
		drawer?: 'list' | 'new' | null;
		/** Room for separate use-case showcases. They sit below the first screen, and nothing shows until they are given. */
		showcases?: Snippet;
		/** Where donating happens (a link or button), once that is decided. Nothing is shown there until it is given. */
		donate?: Snippet;
	} = $props();
</script>

<Seo />

<!--
	One screen, read in a path: the name (top left), the headline, one line of what it does, the two buttons, then the
	two promises in large accent type (Free, Yours), which is the only place they are said. The features sit to the right as a
	quick reference, and the eye finishes on the donation band along the bottom. Emphasis comes from size, weight and
	colour, never from saying a thing twice. Anything added later goes below this screen.
-->
<main>
	<header>
		<!-- Text for now; a logo replaces it here later. --><span class="brand">bubu</span>
	</header>

	<div class="screen">
		<section class="hero" aria-labelledby="hero-title">
			<h1 id="hero-title">Build a Budget, one Item at a time</h1>
			<p class="lead">Plan a Budget as a tree of Items. Every Total adds up on its own.</p>
			<div class="actions">
				<Button variant="primary" onclick={oncreate} aria-haspopup="dialog" aria-expanded={drawer === 'new'}>Create a budget</Button>
				<Button onclick={onopenbudgets} aria-haspopup="dialog" aria-expanded={drawer === 'list'}>My budgets</Button>
			</div>
			<dl class="promises">
				<div>
					<dt>Free</dt>
					<dd>No plans, trials or limits.</dd>
				</div>
				<div>
					<dt>Yours</dt>
					<dd>Data stays on this device. No accounts, nothing sent to a server.</dd>
				</div>
			</dl>
		</section>

		<section class="features" aria-labelledby="features-title">
			<h2 id="features-title">What you get</h2>
			<div class="grid">
				<FeatureCard title="Unlimited nested Items">
					Items inside Items, to any depth. An Item with Items inside it is a Group, otherwise a Line. Codes like
					1.2.3 keep the order.
				</FeatureCard>
				<FeatureCard title="Automatic roll-up Totals">
					A Line's Total is its Quantity times its Unit price. A Group adds up the Totals inside it.
				</FeatureCard>
				<FeatureCard title="Budgets">One for each plan, each in its own currency.</FeatureCard>
				<FeatureCard title="Excel in and out">Download or import a Budget as .xlsx.</FeatureCard>
			</div>
		</section>
	</div>

	<aside class="support" aria-labelledby="support-title">
		<span class="heart" aria-hidden="true"><Icon name="heart" size={28} /></span>
		<div class="words">
			<h2 id="support-title">Like it? Support it.</h2>
			<p>No ads and no paywall. <a href={SPONSOR_URL} target="_blank" rel="noopener noreferrer">Donations are welcome</a>, and always optional.</p>
		</div>
		{#if donate}
			<div class="donate">{@render donate()}</div>
		{/if}
	</aside>
</main>

{#if showcases}
	<section class="below" aria-labelledby="showcases-title">
		<h2 id="showcases-title">See it in use</h2>
		{@render showcases()}
	</section>
{/if}

<style>
	/* The first screen is exactly one window tall and never scrolls by itself: the stage takes the room that is
	   left, the donation band sits at the bottom. */
	main {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		max-width: 90rem;
		margin: 0 auto;
		padding: var(--space-5) var(--space-6);
		box-sizing: border-box;
		gap: var(--space-5);
	}

	h1,
	h2,
	p,
	dl,
	dd {
		margin: 0;
	}

	.brand {
		font-size: var(--font-size-title2);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.01em;
	}

	.screen {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(0, 6fr) minmax(0, 5fr);
		align-items: center;
		gap: var(--space-8);
	}

	.hero {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-4);
	}

	h1 {
		font-size: clamp(2rem, 4.4vw, 3.75rem);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.02em;
		text-wrap: balance;
	}

	.lead {
		max-width: 32rem;
		color: var(--color-text-secondary);
		font-size: var(--font-size-title2);
		line-height: var(--line-height-body);
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-block: var(--space-1) var(--space-3);
	}

	/* The two promises: the largest type after the headline, in the accent colour, with one plain line each. */
	.promises {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-5) var(--space-7);
		padding-top: var(--space-5);
		border-top: 1px solid var(--color-border);
	}

	.promises div {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		max-width: 15rem;
	}

	dt {
		color: var(--color-accent);
		font-size: clamp(1.75rem, 3vw, 2.5rem);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.02em;
	}

	dd {
		color: var(--color-text-secondary);
		font-size: var(--font-size-body);
		line-height: var(--line-height-body);
	}

	.features {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.features h2 {
		font-size: var(--font-size-title2);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.01em;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}

	/* Where the eye ends: a full-width band in the accent tint, its own icon and a title as large as a feature
	   heading's bigger sibling, so the invitation to donate is seen, not buried in a sentence. */
	.support {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-4) var(--space-5);
		padding: var(--space-4) var(--space-5);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-lg);
		background: var(--color-selected);
	}

	.heart {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 3rem;
		height: 3rem;
		border-radius: var(--radius-full);
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.words {
		flex: 1 1 18rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.support h2 {
		font-size: var(--font-size-title);
		font-weight: var(--font-weight-bold);
		line-height: var(--line-height-tight);
		letter-spacing: -0.01em;
	}

	.support p {
		color: var(--color-text);
		font-size: var(--font-size-body);
	}

	/* Underlined, so the sponsor link reads as clickable without hover. */
	.support a {
		color: inherit;
		text-decoration: underline;
		text-underline-offset: 0.15em;
	}

	.below {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-width: 90rem;
		margin: 0 auto;
		padding: var(--space-7) var(--space-6);
		box-sizing: border-box;
	}

	.below h2 {
		font-size: clamp(1.75rem, 3vw, 2.5rem);
		font-weight: var(--font-weight-bold);
		letter-spacing: -0.01em;
	}

	/* A narrow window stacks the two columns and lets the page scroll, as it must. */
	@media (max-width: 56rem) {
		main {
			padding: var(--space-4);
		}

		.screen {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-6);
		}

		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
