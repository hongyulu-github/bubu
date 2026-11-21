import { absoluteUrl } from '#lib/site.ts';
import type { RequestHandler } from './$types';

// Written at build time. Only the landing page is listed: the editor and the pages that are empty for anyone else are not.
export const prerender = true;

export const GET: RequestHandler = () => {
	const home = absoluteUrl('/');
	const body = home ? `<url><loc>${home}</loc></url>` : '';
	return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>\n`, {
		headers: { 'Content-Type': 'application/xml' }
	});
};
