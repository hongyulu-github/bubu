import { describe, expect, it } from 'vitest';
import { absoluteUrl, DEFAULT_TITLE, pageTitle } from './site';

describe('site addresses', () => {
	it('builds a full address from the site and a path, with or without a leading slash', () => {
		expect(absoluteUrl('/og-image.png', 'https://bubu.example')).toBe('https://bubu.example/og-image.png');
		expect(absoluteUrl('sitemap.xml', 'https://bubu.example')).toBe('https://bubu.example/sitemap.xml');
	});

	it('gives none while the site address is not set, rather than an invented one', () => {
		expect(absoluteUrl('/', '')).toBeNull();
	});

	it('titles a named page "Name · BuBu" and the landing page with the product line', () => {
		expect(pageTitle('Our Wedding')).toBe('Our Wedding · BuBu');
		expect(pageTitle('  Trip  ')).toBe('Trip · BuBu');
		expect(pageTitle()).toBe(DEFAULT_TITLE);
		expect(pageTitle('   ')).toBe(DEFAULT_TITLE);
	});
});
