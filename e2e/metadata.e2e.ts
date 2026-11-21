import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

const baseUrl = inject('baseUrl');
const A = '11111111-1111-4111-8111-111111111111';

let browser: Browser;
let page: Page;
beforeAll(async () => (browser = await chromium.launch()));
afterAll(async () => browser.close());
beforeEach(async () => (page = await (await browser.newContext()).newPage()));
afterEach(async () => page.context().close());

const attr = (selector: string, name: string) => page.locator(selector).first().getAttribute(name);
const count = (selector: string) => page.locator(selector).count();

describe('page metadata on the built site', () => {
	it('has the essentials on the landing page', async () => {
		await page.goto(`${baseUrl}/`);
		expect(await attr('html', 'lang')).toBe('en');
		expect(await count('meta[charset="utf-8" i]')).toBe(1);
		expect(await attr('meta[name="viewport"]', 'content')).toBe('width=device-width, initial-scale=1');
		expect(await page.title()).toBe('bubu: build Budgets, one Item at a time');
		expect(await count('title')).toBe(1);
		expect(await count('meta[name="description"]')).toBe(1); // one, never two
		expect((await attr('meta[name="description"]', 'content'))!.length).toBeGreaterThan(40);
	});

	it('has the app appearance tags: colour scheme and a theme colour for light and dark', async () => {
		await page.goto(`${baseUrl}/`);
		expect(await attr('meta[name="color-scheme"]', 'content')).toBe('light dark');
		expect(await attr('meta[name="theme-color"][media*="light"]', 'content')).toBe('#f1f5f3');
		expect(await attr('meta[name="theme-color"][media*="dark"]', 'content')).toBe('#0d0b09');
	});

	it('serves every icon it links, with the right type and size', async () => {
		await page.goto(`${baseUrl}/`);
		const fetchOf = async (href: string) => page.request.get(new URL(href, `${baseUrl}/`).toString());
		for (const [selector, type] of [
			['link[rel="icon"][type="image/svg+xml"]', 'image/svg+xml'],
			['link[rel="icon"][sizes="any"]', 'image/'],
			['link[rel="apple-touch-icon"]', 'image/png']
		] as const) {
			const response = await fetchOf((await attr(selector, 'href'))!);
			expect(response.status(), selector).toBe(200);
			expect(response.headers()['content-type'], selector).toContain(type);
		}
		const png = await (await fetchOf('/apple-touch-icon.png')).body();
		expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([180, 180]);
		const og = await (await fetchOf('/og-image.png')).body();
		expect([og.readUInt32BE(16), og.readUInt32BE(20)]).toEqual([1200, 630]);
	});

	it('has the share card tags', async () => {
		await page.goto(`${baseUrl}/`);
		expect(await attr('meta[property="og:title"]', 'content')).toBe('bubu: build Budgets, one Item at a time');
		expect(await attr('meta[property="og:type"]', 'content')).toBe('website');
		expect((await attr('meta[property="og:description"]', 'content'))!.length).toBeGreaterThan(40);
		expect(await attr('meta[name="twitter:card"]', 'content')).toBe('summary_large_image');
	});

	it('links an installable manifest with its icons', async () => {
		await page.goto(`${baseUrl}/`);
		const response = await page.request.get(`${baseUrl}${await attr('link[rel="manifest"]', 'href').then((href) => href!.replace(/^\./, ''))}`);
		expect(response.status()).toBe(200);
		const manifest = await response.json();
		expect(manifest).toMatchObject({ name: 'bubu', short_name: 'bubu', start_url: '/', display: 'standalone' });
		expect(manifest.background_color).toMatch(/^#/);
		expect(manifest.theme_color).toMatch(/^#/);
		const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
		expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
		for (const icon of manifest.icons) expect((await page.request.get(`${baseUrl}${icon.src}`)).status(), icon.src).toBe(200);
	});

	it('serves robots.txt and a sitemap that lists only the landing page', async () => {
		const robots = await page.request.get(`${baseUrl}/robots.txt`);
		expect(robots.status()).toBe(200);
		expect(await robots.text()).toContain('User-agent: *');
		const sitemap = await page.request.get(`${baseUrl}/sitemap.xml`);
		expect(sitemap.status()).toBe(200);
		const xml = await sitemap.text();
		expect(xml).toContain('<urlset');
		expect(xml).not.toContain('/budgets');
	});

	it('keeps the editor, the Budgets list route and internal pages out of search results', async () => {
		await page.goto(`${baseUrl}/`);
		await page.evaluate(
			(id) =>
				localStorage.setItem(`bubu:budget:${id}`, JSON.stringify({ schemaVersion: 1, data: { id, name: 'Our Wedding', currency: 'EUR', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' } })),
			A
		);
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.waitForFunction(() => document.title.includes('Wedding') || document.title.includes('Budget'));
		expect(await attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');
		expect(await page.title()).toMatch(/· bubu$/);

		await page.goto(`${baseUrl}/design`);
		expect(await attr('meta[name="robots"]', 'content')).toBe('noindex, nofollow');

		await page.goto(`${baseUrl}/`);
		expect(await count('meta[name="robots"]')).toBe(0); // the landing page is the one that is indexed
	});
});
