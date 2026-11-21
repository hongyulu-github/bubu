import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

/**
 * The deployed-site smoke test (LUL-31). `npm run smoke` runs it against the local build; `SMOKE_URL=https://… npm run
 * smoke` runs the very same steps against a deployed origin. Every test starts in a fresh browser, so it only sees what
 * it creates, and it needs nothing from the host except static files.
 */
const baseUrl = inject('baseUrl');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

let browser: Browser;
let context: BrowserContext;
let page: Page;
let failures: string[];

beforeAll(async () => (browser = await chromium.launch()));
afterAll(async () => browser.close());
beforeEach(async () => {
	context = await browser.newContext({ acceptDownloads: true });
	page = await context.newPage();
	failures = [];
	page.on('pageerror', (error) => failures.push(`page error: ${error.message}`));
	page.on('response', (response) => {
		if (response.status() >= 400 && response.url().startsWith(baseUrl)) failures.push(`${response.status()} ${response.url()}`);
	});
});
afterEach(async () => {
	await context.close();
	expect(failures, 'no failed requests or script errors').toEqual([]);
});

const createButton = () => page.getByRole('button', { name: 'Create a budget', exact: true });
const drawerSettled = () => page.locator('dialog[open]').waitFor();

async function createBudget(name: string, currency = 'EUR') {
	await page.goto(`${baseUrl}/`);
	await page.waitForLoadState('networkidle');
	await createButton().click();
	await page.getByRole('dialog', { name: 'New budget' }).waitFor();
	await page.getByLabel('Name').fill(name);
	await page.getByLabel('Currency').selectOption(currency);
	await page.getByRole('button', { name: 'Create Budget' }).click();
	await page.getByRole('heading', { level: 1, name }).waitFor();
	await page.locator('dialog[open]').waitFor({ state: 'detached' });
}

const total = () => page.getByLabel('Grand total', { exact: true }).innerText();

describe('deployed site smoke test', () => {
	it('loads the landing page and opens the Budgets drawer', async () => {
		await page.goto(`${baseUrl}/`);
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();
		expect(await page.title()).toContain('bubu');
		await page.getByRole('button', { name: 'My budgets', exact: true }).click();
		await drawerSettled();
		await page.getByRole('dialog', { name: 'My budgets', exact: true }).waitFor();
		await page.getByRole('heading', { name: 'No saved Budgets yet.' }).waitFor();
	});

	it('creates an empty Budget, adds and edits an Item, and keeps both the data and the total after a reload', async () => {
		await createBudget('Smoke test');
		expect(await page.locator('tbody tr').count()).toBe(0); // a normal Budget starts empty
		expect(await total()).toBe('€0.00');

		await page.getByRole('button', { name: 'New item', exact: true }).click();
		await page.getByLabel('Description 1', { exact: true }).fill('Venue');
		await page.keyboard.press('Enter');
		await page.getByLabel('Unit price 1', { exact: true }).fill('4');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 1', { exact: true }).fill('3');
		await page.keyboard.press('Enter');
		await page.waitForFunction(() => document.querySelector('[aria-label="Grand total"]')?.textContent?.includes('12.00'));
		expect(await total()).toBe('€12.00');

		await page.reload(); // reload on an editor route must work on the host, not 404
		await page.getByRole('heading', { level: 1, name: 'Smoke test' }).waitFor();
		expect(await page.getByLabel('Description 1', { exact: true }).inputValue()).toBe('Venue');
		expect(await page.getByLabel('Quantity 1', { exact: true }).inputValue()).toBe('3');
		expect(await total()).toBe('€12.00');
	});

	it('opens a direct link to an editor route in a fresh tab, and answers an unknown one without a server error', async () => {
		await createBudget('Direct link');
		const url = page.url();
		expect(url).toMatch(/\/budgets\/[0-9a-f-]{36}$/);

		const other = await context.newPage();
		await other.goto(url);
		await other.getByRole('heading', { level: 1, name: 'Direct link' }).waitFor();
		await other.close();

		await page.goto(`${baseUrl}/budgets/00000000-0000-4000-8000-000000000000`);
		await page.getByRole('heading', { name: 'Budget not found' }).waitFor();
	});

	it('creates a Budget from a landing-page template and keeps it after a reload', async () => {
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Use template: Wedding' }).click();
		await page.getByRole('dialog', { name: 'New budget' }).waitFor();
		await page.getByLabel('Name').fill('Our wedding');
		await page.getByLabel('Currency').selectOption('EUR');
		await page.getByRole('button', { name: 'Create Budget' }).click();
		await page.getByRole('heading', { level: 1, name: 'Our wedding' }).waitFor();
		await page.locator('dialog[open]').waitFor({ state: 'detached' });
		expect(await page.locator('tbody tr').count()).toBeGreaterThan(10);

		await page.reload();
		await page.getByRole('heading', { level: 1, name: 'Our wedding' }).waitFor();
		expect(await page.locator('tbody tr').count()).toBeGreaterThan(10);
	});

	it('exports a Budget to Excel and imports it back', async () => {
		await createBudget('Round trip');
		await page.getByRole('button', { name: 'New item', exact: true }).click();
		await page.getByLabel('Description 1', { exact: true }).fill('Flowers');
		await page.keyboard.press('Enter');

		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as Excel' }).click()]);
		expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
		const path = await download.path();
		expect(path).toBeTruthy();

		await page.goto(`${baseUrl}/?new`);
		await page.getByRole('dialog', { name: 'New budget' }).waitFor();
		await page.locator('input[type="file"]').setInputFiles({ name: download.suggestedFilename(), mimeType: XLSX, buffer: (await import('node:fs')).readFileSync(path!) });
		await page.getByRole('button', { name: 'Import as copy' }).click(); // the same Budget is already saved
		await page.getByRole('heading', { level: 1, name: /Round trip/ }).waitFor();
		expect(await page.getByLabel('Description 1', { exact: true }).inputValue()).toBe('Flowers');
	});
});
