import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Seo from './Seo.svelte';

const meta = (selector: string) => document.head.querySelector<HTMLMetaElement>(selector)?.content;
const link = (rel: string) => document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)?.href;

afterEach(() => {
	document.head.querySelectorAll('meta[name], meta[property], link[rel="canonical"], title').forEach((node) => node.remove());
});

describe('Seo', () => {
	it('gives the landing page the product title, a description and the share card tags', () => {
		render(Seo, { site: '' });
		expect(document.title).toBe('bubu: build Budgets, one Item at a time');
		expect(meta('meta[name="description"]')!.length).toBeGreaterThan(40);
		expect(meta('meta[property="og:title"]')).toBe(document.title);
		expect(meta('meta[property="og:type"]')).toBe('website');
		expect(meta('meta[property="og:site_name"]')).toBe('bubu');
		expect(meta('meta[name="twitter:card"]')).toBe('summary_large_image');
		expect(meta('meta[name="robots"]')).toBeUndefined();
	});

	it('leaves out the tags that need a full address while the site address is not set', () => {
		render(Seo, { site: '' });
		expect(link('canonical')).toBeUndefined();
		expect(meta('meta[property="og:url"]')).toBeUndefined();
		expect(meta('meta[property="og:image"]')).toBeUndefined();
	});

	it('adds the canonical link, the shared URL and the 1200x630 image once the site address is set', () => {
		render(Seo, { site: 'https://bubu.example', path: '/' });
		expect(link('canonical')).toBe('https://bubu.example/');
		expect(meta('meta[property="og:url"]')).toBe('https://bubu.example/');
		expect(meta('meta[property="og:image"]')).toBe('https://bubu.example/og-image.png');
		expect(meta('meta[property="og:image:width"]')).toBe('1200');
		expect(meta('meta[property="og:image:height"]')).toBe('630');
		expect(meta('meta[name="twitter:image"]')).toBe('https://bubu.example/og-image.png');
	});

	it('titles a named page "Name · bubu"', () => {
		render(Seo, { name: 'Our Wedding', site: '' });
		expect(document.title).toBe('Our Wedding · bubu');
		expect(meta('meta[property="og:title"]')).toBe('Our Wedding · bubu');
	});

	it('keeps a noindex page out of search results and gives it no canonical link', () => {
		render(Seo, { name: 'Wedding', noindex: true, site: 'https://bubu.example' });
		expect(meta('meta[name="robots"]')).toBe('noindex, nofollow');
		expect(link('canonical')).toBeUndefined();
	});
});
