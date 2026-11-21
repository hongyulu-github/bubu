<script lang="ts">
	import { absoluteUrl, DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, pageTitle } from '../site';

	let {
		name,
		description = DEFAULT_DESCRIPTION,
		path = '/',
		noindex = false,
		site = SITE_URL
	}: {
		/** The page's own name (a Budget's name, say); the landing page leaves it out. */
		name?: string;
		description?: string;
		/** This page's address on the site, for the canonical link and the shared URL. */
		path?: string;
		/** Keep the page out of search results (the editor and the pages that are empty for anyone else). */
		noindex?: boolean;
		/** The site's address; the build's `VITE_SITE_URL` unless a test says otherwise. */
		site?: string;
	} = $props();

	const title = $derived(pageTitle(name));
	const url = $derived(absoluteUrl(path, site));
	const image = $derived(absoluteUrl('/og-image.png', site));
</script>

<!-- The tags that differ per page. The ones every page shares (icons, theme colour, viewport) are in app.html. -->
<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	{#if noindex}
		<meta name="robots" content="noindex, nofollow" />
	{:else if url}
		<link rel="canonical" href={url} />
	{/if}
	<meta property="og:site_name" content={SITE_NAME} />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	{#if url}<meta property="og:url" content={url} />{/if}
	{#if image}
		<meta property="og:image" content={image} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content="BuBu: build a Budget, one Item at a time" />
		<meta name="twitter:image" content={image} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
</svelte:head>
