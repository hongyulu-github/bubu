import { absoluteUrl } from '#lib/site.ts';
import type { RequestHandler } from './$types';

// Written at build time. Crawling is allowed everywhere; the pages that should not be listed say so with `noindex`
// (a page blocked here could not be read, so its `noindex` would never be seen).
export const prerender = true;

export const GET: RequestHandler = () => {
	const sitemap = absoluteUrl('/sitemap.xml');
	return new Response(`User-agent: *\nDisallow:\n${sitemap ? `\nSitemap: ${sitemap}\n` : ''}`, { headers: { 'Content-Type': 'text/plain' } });
};
