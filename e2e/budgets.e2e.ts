import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, inject, it } from 'vitest';

const baseUrl = inject('baseUrl');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MISSING = '33333333-3333-4333-8333-333333333333';

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const item = (budgetId: string, id: number, parent: number | null, sortIndex: number, description: string) => ({
	id: uuid(id),
	budgetId,
	parentId: parent === null ? null : uuid(parent),
	sortIndex,
	description,
	unitPrice: '0',
	quantity: '1'
});
const budget = (id: string, name: string, currency: string, at: string) => ({
	id,
	name,
	currency,
	createdAt: at,
	updatedAt: at
});

const SAVED: Record<string, unknown> = {
	[`bubu:budget:${A}`]: { version: 1, data: budget(A, 'Wedding', 'EUR', '2026-02-01T00:00:00.000Z') },
	[`bubu:items:${A}`]: {
		version: 1,
		data: [item(A, 1, null, 0, 'Venue'), item(A, 2, 1, 0, 'Hall rental'), item(A, 3, null, 1, 'Music')]
	},
	[`bubu:budget:${B}`]: { version: 1, data: budget(B, 'Renovation', 'USD', '2026-03-01T00:00:00.000Z') },
	[`bubu:items:${B}`]: { version: 1, data: [item(B, 11, null, 0, 'Paint'), item(B, 12, null, 1, 'Flooring')] }
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser.close();
});

beforeEach(async () => {
	page = await (await browser.newContext()).newPage();
	// Seed browser-local storage on a page of the same origin, then leave it alone across reloads.
	await page.goto(`${baseUrl}/`);
	await page.evaluate((saved) => {
		localStorage.clear();
		for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, JSON.stringify(value));
	}, SAVED);
});
afterEach(async () => {
	await page.context().close();
});

const items = () => page.locator('ol[aria-label="Items"] li').allInnerTexts().then((rows) => rows.map((row) => row.replace(/\s+/g, ' ').trim()));

describe('Budgets list and editor routes (built static site)', () => {
	it('lists both saved Budgets and opens the matching editor, with back navigation', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		expect(await page.getByRole('link', { name: /Renovation/ }).innerText()).toContain('USD');

		await page.getByRole('link', { name: /Wedding/ }).click();
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets/${A}`);
		expect(await items()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);

		await page.goBack();
		await page.getByRole('heading', { name: 'Your Budgets' }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets`);

		await page.getByRole('link', { name: /Renovation/ }).click();
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets/${B}`);
		expect(await items()).toEqual(['1 Paint', '2 Flooring']);
		expect(await page.locator('body').innerText()).not.toContain('Venue');
	});

	it('moves between two Budget editors through the list without mixing Items', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Renovation/ }).click();
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(await items()).toEqual(['1 Paint', '2 Flooring']);
		await page.goBack(); // list
		await page.goBack(); // Wedding editor
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		expect(await items()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);
	});

	it('hydrates after a reload on a Budget URL (served by the SPA fallback)', async () => {
		await page.goto(`${baseUrl}/budgets/${B}`);
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		await page.reload();
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(await items()).toEqual(['1 Paint', '2 Flooring']);
	});

	it('hydrates the list after a reload', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		await page.reload();
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		expect(await page.getByRole('link', { name: /Renovation/ }).count()).toBe(1);
	});

	it('handles a missing id without showing any other Budget', async () => {
		await page.goto(`${baseUrl}/budgets/${MISSING}`);
		await page.getByRole('heading', { name: 'Budget not found' }).waitFor();
		const text = await page.locator('body').innerText();
		expect(text).not.toContain('Wedding');
		expect(text).not.toContain('Renovation');
		expect(text).not.toContain('Venue');

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets`);
	});

	it('shows an empty list when nothing is saved', async () => {
		await page.evaluate(() => localStorage.clear());
		await page.goto(`${baseUrl}/budgets`);
		await page.getByText('No saved Budgets yet.').waitFor();
		expect(await page.getByRole('link').count()).toBe(0);
	});
});
