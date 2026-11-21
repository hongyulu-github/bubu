import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

const baseUrl = inject('baseUrl');

let browser: Browser;
let page: Page;
let requests: string[];

beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser.close();
});
beforeEach(async () => {
	page = await (await browser.newContext()).newPage();
	requests = [];
	page.on('request', (request) => requests.push(request.url()));
});
afterEach(async () => {
	await page.context().close();
});

const create = () => page.getByRole('button', { name: 'Create a budget', exact: true });
const mine = () => page.getByRole('button', { name: 'My budgets', exact: true });
const stored = () =>
	page.evaluate(() =>
		Object.fromEntries(
			Object.keys(localStorage)
				.filter((key) => key.startsWith('bubu:'))
				.map((key) => [key, JSON.parse(localStorage.getItem(key) ?? 'null')])
		)
	);

describe('the landing page (built static site)', () => {
	it('is the main page for a new user, with both buttons and the free, local, no-account promise', async () => {
		await page.goto(`${baseUrl}/`);
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();
		await create().waitFor();
		await mine().waitFor();
		const text = await page.locator('main').innerText();
		expect(text).toContain('No plans, trials or limits.'); // Free
		expect(text).toContain('Data stays on this device. No accounts, nothing sent to a server.'); // Yours
		expect(text).toContain('Donations are welcome, and always optional.');
		expect(await page.title()).toContain('BuBu');
		expect(await page.locator('.brand').innerText()).toBe('BuBu');
	});

	it('is still the main page when saved Budgets already exist, and offers them without starting creation', async () => {
		await page.goto(`${baseUrl}/`);
		const id = '11111111-1111-4111-8111-111111111111';
		const at = '2026-02-01T00:00:00.000Z';
		await page.evaluate(
			([budgetId, saved]) => {
				localStorage.setItem(`bubu:budget:${budgetId}`, JSON.stringify({ version: 1, data: { id: budgetId, name: 'Wedding', currency: 'EUR', createdAt: saved, updatedAt: saved } }));
				localStorage.setItem(`bubu:items:${budgetId}`, JSON.stringify({ version: 1, data: [] }));
			},
			[id, at] as const
		);

		await page.goto(`${baseUrl}/`);
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/`); // not redirected to the list
		await page.waitForLoadState('networkidle');

		await mine().click();
		await page.getByRole('link', { name: /Wedding/ }).waitFor(); // the saved Budgets (a stand-in for the drawer, LUL-73)
		expect(page.url()).not.toContain('/budgets/new'); // opening them never starts creation
		expect(Object.keys(await stored()).filter((key) => key.startsWith('bubu:budget:'))).toEqual([`bubu:budget:${id}`]); // nothing was created
	});

	it('"Create a budget" starts the normal flow and makes an empty Budget: no Items, a zero grand total, no starter template', async () => {
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle'); // hydrated: a click before that would be lost
		await create().click();

		await page.waitForURL(`${baseUrl}/budgets/new`);
		await page.getByLabel('Name').fill('From the landing page');
		await page.getByLabel('Currency').selectOption('EUR');
		await page.getByRole('button', { name: 'Create Budget' }).click();

		await page.waitForURL(/\/budgets\/[0-9a-f-]{36}$/);
		const id = page.url().split('/').pop()!;
		await page.getByRole('heading', { name: 'From the landing page' }).waitFor();
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toBe('€0.00');
		expect(await page.locator('table[aria-label="Budget Items"] tbody tr').count()).toBe(0);

		const saved = await stored();
		expect(Object.keys(saved).sort()).toEqual([`bubu:budget:${id}`, `bubu:items:${id}`]);
		expect((saved[`bubu:items:${id}`] as { data: unknown[] }).data).toEqual([]); // an empty Item array
		expect((saved[`bubu:budget:${id}`] as { data: { name: string; currency: string } }).data).toMatchObject({ name: 'From the landing page', currency: 'EUR' });
	});

	it('fits on one screen without scrolling at common window sizes, with both buttons in view', async () => {
		for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
			await page.setViewportSize({ width, height });
			await page.goto(`${baseUrl}/`);
			await create().waitFor();
			const [scrollHeight, innerHeight] = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
			expect(scrollHeight, `${width}x${height}`).toBeLessThanOrEqual(innerHeight);
			for (const button of [create(), mine()]) expect(await button.boundingBox()).toMatchObject({ y: expect.any(Number) });
			expect(await create().isVisible()).toBe(true);
			expect((await page.locator('.support').boundingBox())!.y + (await page.locator('.support').boundingBox())!.height).toBeLessThanOrEqual(height);
		}
	});

	it('needs no backend and loads no font: only static files from the site are requested', async () => {
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');
		expect(requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:'))).toEqual([]);
		expect(requests.filter((url) => /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url))).toEqual([]);
	});
});
