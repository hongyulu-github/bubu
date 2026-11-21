/**
 * Where the site lives, for the tags and files that need a full address (canonical link, Open Graph URL and image,
 * sitemap). Set `VITE_SITE_URL` (for example `https://bubu.example`) when building for a real address; without it those
 * tags are left out rather than pointing somewhere invented.
 */
export const SITE_URL: string = ((import.meta.env.VITE_SITE_URL as string | undefined) ?? '').replace(/\/+$/, '');

/** A full address for a path on this site, or null while the site address is not set. */
export function absoluteUrl(path: string, site: string = SITE_URL): string | null {
	return site ? `${site}${path.startsWith('/') ? path : `/${path}`}` : null;
}

export const SITE_NAME = 'bubu';
export const DEFAULT_TITLE = 'bubu: build Budgets, one Item at a time';
export const DEFAULT_DESCRIPTION =
	'Build a Budget as a tree of Items, where every Total adds up on its own. Free, no account, and your data stays on your device.';

/** "Our Wedding · bubu" for a named page; the product line for the landing page. */
export function pageTitle(name?: string): string {
	return name?.trim() ? `${name.trim()} · ${SITE_NAME}` : DEFAULT_TITLE;
}
