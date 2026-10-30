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

const items = () =>
	page.locator('table[aria-label="Budget Items"] tbody tr').evaluateAll((rows) =>
		rows.map((row) =>
			[...row.querySelectorAll('td')].slice(0, 2).map((cell) => cell.querySelector('input')?.value ?? cell.textContent?.trim()).join(' ')
		)
	);

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
		expect(await page.locator('table').count()).toBe(0); // Items are in inputs, so innerText alone cannot prove their absence

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets`);
	});

	it('shows an empty list when nothing is saved', async () => {
		await page.evaluate(() => localStorage.clear());
		await page.goto(`${baseUrl}/budgets`);
		await page.getByText('No saved Budgets yet.').waitFor();
		expect(await page.getByRole('list').count()).toBe(0);
		expect(await page.getByRole('link', { name: 'New Budget' }).count()).toBe(1);
	});
});

describe('Creating a Budget (built static site)', () => {
	it('creates an empty Budget from the list and opens its editor', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('link', { name: 'New Budget' }).click();
		await page.getByRole('heading', { name: 'New Budget' }).waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets/new`);

		await page.getByLabel('Name').fill('  Summer trip  ');
		await page.getByLabel('Currency').selectOption('DKK');
		await page.getByRole('button', { name: 'Create Budget' }).click();

		await page.getByRole('heading', { name: 'Summer trip' }).waitFor();
		expect(page.url()).toMatch(new RegExp(`^${baseUrl}/budgets/[0-9a-f-]{36}$`));
		expect(await page.locator('main').innerText()).toContain('DKK');
		await page.getByText('This Budget has no Items yet.').waitFor();
		expect(await page.locator('table[aria-label="Budget Items"]').count()).toBe(0);

		// The new Budget is in shared state, so the list shows it next to the saved ones.
		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Summer trip/ }).waitFor();
		expect(await page.getByRole('link', { name: /Summer trip/ }).innerText()).toContain('DKK');
		expect(await page.getByRole('link', { name: /Wedding/ }).count()).toBe(1);
	});

	it('shows validation errors and stays on the form when the input is invalid', async () => {
		await page.goto(`${baseUrl}/budgets/new`);
		await page.getByLabel('Name').fill('   ');
		await page.getByRole('button', { name: 'Create Budget' }).click();

		await page.getByText('Enter a name for the Budget.').waitFor();
		await page.getByText('Choose a currency.').waitFor();
		expect(page.url()).toBe(`${baseUrl}/budgets/new`);

		await page.getByLabel('Name').fill('Fixed');
		await page.getByLabel('Currency').selectOption('EUR');
		await page.getByRole('button', { name: 'Create Budget' }).click();
		await page.getByRole('heading', { name: 'Fixed' }).waitFor();
	});

	it('opens the create form directly (served by the prerendered page)', async () => {
		await page.goto(`${baseUrl}/budgets/new`);
		await page.getByRole('heading', { name: 'New Budget' }).waitFor();
		expect(await page.getByLabel('Currency').inputValue()).toBe('');
	});
});

describe('Editing cells (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();

	it('commits edits, refreshes the totals, validates input, and undoes', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Unit price 1.1', { exact: true }).waitFor();
		expect(await total()).toBe('0 EUR');

		await page.getByLabel('Unit price 1.1', { exact: true }).fill('-100');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 1.1', { exact: true }).fill('2.5');
		await page.keyboard.press('Enter');
		await expect.poll(total).toBe('-250.0 EUR'); // -100 x 2.5, rolled up through the Group

		// A Group's own Unit price is calculated, so it has no input.
		expect(await page.getByLabel('Unit price 1', { exact: true }).count()).toBe(0);

		// Invalid values show a message and change nothing.
		await page.getByLabel('Quantity 1.1', { exact: true }).fill('abc');
		await page.keyboard.press('Enter');
		await page.getByText('Enter a valid number.').waitFor();
		expect(await total()).toBe('-250.0 EUR');
		await page.keyboard.press('Escape');
		expect(await page.getByLabel('Quantity 1.1', { exact: true }).inputValue()).toBe('2.5');

		await page.getByRole('button', { name: 'Undo' }).click();
		expect(await page.getByLabel('Quantity 1.1', { exact: true }).inputValue()).toBe('1');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(total).toBe('0 EUR');
		expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(true);
		await page.getByRole('button', { name: 'Redo' }).click();
		expect(await page.getByLabel('Unit price 1.1', { exact: true }).inputValue()).toBe('-100');
	});
});

describe('Building a Budget from nothing (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();

	it('adds top-level and sibling Items, edits them, and undoes the insertion', async () => {
		await page.goto(`${baseUrl}/budgets/new`);
		await page.getByLabel('Name').fill('From scratch');
		await page.getByLabel('Currency').selectOption('EUR');
		await page.getByRole('button', { name: 'Create Budget' }).click();
		await page.getByText('This Budget has no Items yet.').waitFor();

		await page.getByRole('button', { name: 'Add item', exact: true }).click();
		await page.getByLabel('Description 1', { exact: true }).fill('Venue');
		await page.keyboard.press('Enter');
		await page.getByLabel('Unit price 1', { exact: true }).fill('1500');
		await page.keyboard.press('Enter');

		await page.getByRole('button', { name: 'Add item below 1' }).click();
		await page.getByLabel('Description 2', { exact: true }).fill('Catering');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 2', { exact: true }).fill('2');
		await page.keyboard.press('Enter');
		await page.getByLabel('Unit price 2', { exact: true }).fill('-250.5');
		await page.keyboard.press('Enter');

		await expect.poll(total).toBe('999.0 EUR'); // 1500 + (-250.5 x 2)
		expect(await page.locator('tbody tr').count()).toBe(2);

		await page.getByRole('button', { name: 'Add item below 1' }).click(); // inserted between the two
		const descriptions = () => page.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.querySelector('input')?.value));
		await expect.poll(descriptions).toEqual(['Venue', '', 'Catering']);
		expect(await total()).toBe('999.0 EUR');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(descriptions).toEqual(['Venue', 'Catering']);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect.poll(descriptions).toEqual(['Venue', '', 'Catering']);
	});
});
