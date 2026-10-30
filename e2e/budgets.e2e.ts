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
		expect(await total()).toBe('€0.00');

		await page.getByLabel('Unit price 1.1', { exact: true }).fill('-100');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 1.1', { exact: true }).fill('2.5');
		await page.keyboard.press('Enter');
		await expect.poll(total).toBe('-€250.00'); // -100 x 2.5, rolled up through the Group

		// A Group's own Unit price is calculated, so it has no input.
		expect(await page.getByLabel('Unit price 1', { exact: true }).count()).toBe(0);

		// Invalid values show a message and change nothing.
		await page.getByLabel('Quantity 1.1', { exact: true }).fill('abc');
		await page.keyboard.press('Enter');
		await page.getByText('Enter a valid number.').waitFor();
		expect(await total()).toBe('-€250.00');
		await page.keyboard.press('Escape');
		expect(await page.getByLabel('Quantity 1.1', { exact: true }).inputValue()).toBe('2.5');

		await page.getByRole('button', { name: 'Undo' }).click();
		expect(await page.getByLabel('Quantity 1.1', { exact: true }).inputValue()).toBe('1');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(total).toBe('€0.00');
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

		await expect.poll(total).toBe('€999.00'); // 1500 + (-250.5 x 2)
		expect(await page.locator('tbody tr').count()).toBe(2);

		await page.getByRole('button', { name: 'Add item below 1' }).click(); // inserted between the two
		const descriptions = () => page.locator('tbody tr').evaluateAll((rows) => rows.map((r) => r.querySelector('input')?.value));
		await expect.poll(descriptions).toEqual(['Venue', '', 'Catering']);
		expect(await total()).toBe('€999.00');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(descriptions).toEqual(['Venue', 'Catering']);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect.poll(descriptions).toEqual(['Venue', '', 'Catering']);
	});
});

describe('Renaming a Budget (built static site)', () => {
	it('renames from the editor, keeps the Items, and shows the new name in the list', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();

		await page.getByRole('button', { name: 'Rename' }).click();
		await page.getByLabel('Name', { exact: true }).fill('');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.getByText('Enter a name for the Budget.').waitFor();

		await page.getByLabel('Name', { exact: true }).fill('Garden wedding');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.getByRole('heading', { name: 'Garden wedding' }).waitFor();
		expect(await items()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Garden wedding/ }).waitFor();
		expect(await page.getByRole('link', { name: /Wedding$/ }).count()).toBe(0);
		expect(await page.getByRole('link', { name: /Renovation/ }).count()).toBe(1);
	});

	it('leaves the name alone when cancelled', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		await page.getByRole('button', { name: 'Rename' }).click();
		await page.getByLabel('Name', { exact: true }).fill('Nope');
		await page.getByRole('button', { name: 'Cancel' }).click();
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		expect(await page.getByRole('heading', { name: 'Nope' }).count()).toBe(0);
	});
});

describe('Deleting Items (built static site)', () => {
	const rows = () => items();

	it('confirms before deleting a Group, can cancel, deletes the subtree, and undoes it', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		expect(await rows()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);

		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await page.getByRole('dialog', { name: 'Delete “Venue”?' }).waitFor();
		expect(await page.getByRole('dialog').innerText()).toContain('Hall rental');
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(await rows()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);

		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect.poll(rows).toEqual(['1 Music']);

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(rows).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);
		await page.getByRole('button', { name: 'Redo' }).click();
		await expect.poll(rows).toEqual(['1 Music']);
	});

	it('deletes a Line immediately and normalizes its now-childless parent', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Unit price 1.1', { exact: true }).waitFor();
		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
		await expect.poll(rows).toEqual(['1 Venue', '2 Music']);
		expect(await page.getByLabel('Unit price 1', { exact: true }).inputValue()).toBe('0'); // Venue is a Line again
	});
});

describe('Duplicating a Budget (built static site)', () => {
	it('copies a Budget, opens the copy with the same Items, and keeps the original untouched when the copy changes', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('button', { name: 'Duplicate Wedding' }).click();
		await page.getByRole('link', { name: /Wedding \(copy\)/ }).waitFor();
		expect(await page.locator('main ul li').count()).toBe(3);

		await page.getByRole('link', { name: /Wedding \(copy\)/ }).click();
		await page.getByRole('heading', { name: 'Wedding (copy)' }).waitFor();
		expect(await items()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);
		const copyUrl = page.url();

		// Change the copy.
		await page.getByLabel('Description 2', { exact: true }).fill('Changed in the copy');
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Add item', exact: true }).click();
		expect((await items()).length).toBe(4);

		// The original is untouched, and has no history of the copy's edits.
		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /^Wedding EUR/ }).click();
		await page.getByRole('heading', { name: 'Wedding', exact: true }).waitFor();
		expect(await items()).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);
		expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(true);

		// The copy kept its changes and its own history (navigating in-app; nothing is saved yet).
		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Wedding \(copy\)/ }).click();
		await page.getByRole('heading', { name: 'Wedding (copy)' }).waitFor();
		expect(page.url()).toBe(copyUrl);
		expect((await items()).length).toBe(4);
		expect(await page.getByLabel('Description 2', { exact: true }).inputValue()).toBe('Changed in the copy');
		expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(false);
	});
});

describe('Adding child Items (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();

	it('confirms the Line-to-Group conversion, keeps the Quantity, and undoes the whole thing', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Unit price 2', { exact: true }).waitFor(); // Music is a Line
		await page.getByLabel('Unit price 2', { exact: true }).fill('-250.5');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 2', { exact: true }).fill('3');
		await page.keyboard.press('Enter');
		await expect.poll(total).toBe('-€751.50');

		// Cancel: nothing changes.
		await page.getByRole('button', { name: 'Add child to 2', exact: true }).click();
		await page.getByRole('dialog', { name: /into a group/ }).waitFor();
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(await page.getByLabel('Unit price 2', { exact: true }).inputValue()).toBe('-250.5');

		// Confirm: converted, Quantity kept, child added.
		await page.getByRole('button', { name: 'Add child to 2', exact: true }).click();
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		await page.getByLabel('Description 2.1', { exact: true }).waitFor();
		expect(await page.getByLabel('Quantity 2', { exact: true }).inputValue()).toBe('3');
		expect(await page.getByLabel('Unit price 2', { exact: true }).count()).toBe(0);
		await expect.poll(total).toBe('€0.00');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(total).toBe('-€751.50');
		expect(await page.getByLabel('Unit price 2', { exact: true }).inputValue()).toBe('-250.5');
		expect(await page.getByLabel('Description 2.1', { exact: true }).count()).toBe(0);
	});
});

describe('Deleting a Budget (built static site)', () => {
	it('confirms before deleting, and removes only that Budget', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('link', { name: /Wedding/ }).waitFor();

		await page.getByRole('button', { name: 'Delete Wedding' }).click();
		await page.getByRole('dialog', { name: 'Delete “Wedding”?' }).waitFor();
		expect(await page.getByRole('dialog').innerText()).toContain('3 items');
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(await page.locator('main ul li').count()).toBe(2); // cancel changed nothing

		await page.getByRole('button', { name: 'Delete Wedding' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete Budget' }).click();
		await expect.poll(() => page.locator('main ul li').count()).toBe(1);
		expect(await page.getByRole('link', { name: /Renovation/ }).count()).toBe(1);
		expect(await page.getByRole('link', { name: /Wedding/ }).count()).toBe(0);

		// The other Budget still opens, with its own Items.
		await page.getByRole('link', { name: /Renovation/ }).click();
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(await items()).toEqual(['1 Paint', '2 Flooring']);
	});
});

describe('Everything is saved automatically (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();
	const editorItems = () => items();

	it('keeps a Budget you build from scratch after a reload', async () => {
		await page.goto(`${baseUrl}/budgets/new`);
		await page.getByLabel('Name').fill('Saved from scratch');
		await page.getByLabel('Currency').selectOption('DKK');
		await page.getByRole('button', { name: 'Create Budget' }).click();
		await page.getByText('This Budget has no Items yet.').waitFor();

		await page.getByRole('button', { name: 'Add item', exact: true }).click();
		await page.getByLabel('Description 1', { exact: true }).fill('Venue');
		await page.keyboard.press('Enter');
		await page.getByLabel('Unit price 1', { exact: true }).fill('-250.50');
		await page.keyboard.press('Enter');
		await page.getByLabel('Quantity 1', { exact: true }).fill('0.125');
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Add child to 1', exact: true }).click();
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		await page.getByLabel('Description 1.1', { exact: true }).fill('Hall');
		await page.keyboard.press('Enter');
		const url = page.url();

		await page.reload();
		await page.getByRole('heading', { name: 'Saved from scratch' }).waitFor();
		expect(page.url()).toBe(url);
		expect(await page.locator('main').innerText()).toContain('DKK');
		expect(await editorItems()).toEqual(['1 Venue', '1.1 Hall']);
		expect(await page.getByLabel('Quantity 1', { exact: true }).inputValue()).toBe('0.125'); // precision kept
		expect(await page.getByLabel('Unit price 1.1', { exact: true }).inputValue()).toBe('0');
		// The Line-to-Group conversion was saved: Venue is a calculated Group with no price input.
		expect(await page.getByLabel('Unit price 1', { exact: true }).count()).toBe(0);
	});

	it('keeps a rename, a duplicate and an edit to a seeded Budget after a reload', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		await page.getByRole('button', { name: 'Rename' }).click();
		await page.getByLabel('Name', { exact: true }).fill('Renamed');
		await page.getByRole('button', { name: 'Save' }).click();
		await page.getByLabel('Description 2', { exact: true }).fill('Changed');
		await page.keyboard.press('Enter');

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('button', { name: 'Duplicate Renamed' }).click();
		await page.getByRole('link', { name: /Renamed \(copy\)/ }).waitFor();

		await page.reload();
		await page.getByRole('link', { name: /Renamed \(copy\)/ }).waitFor();
		expect(await page.locator('main ul li').count()).toBe(3);
		await page.getByRole('link', { name: /^Renamed EUR/ }).click();
		await page.getByRole('heading', { name: 'Renamed', exact: true }).waitFor();
		expect(await editorItems()).toEqual(['1 Venue', '1.1 Hall rental', '2 Changed']);
	});

	it('does not bring a deleted Budget back after a reload', async () => {
		await page.goto(`${baseUrl}/budgets`);
		await page.getByRole('button', { name: 'Delete Wedding' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete Budget' }).click();
		await expect.poll(() => page.locator('main ul li').count()).toBe(1);

		await page.reload();
		await page.getByRole('link', { name: /Renovation/ }).waitFor();
		expect(await page.locator('main ul li').count()).toBe(1);
		expect(await page.getByRole('link', { name: /Wedding/ }).count()).toBe(0);
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('heading', { name: 'Budget not found' }).waitFor();
	});

	it('saves what an undo leaves, but never the history itself', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Unit price 2', { exact: true }).waitFor();
		await page.getByLabel('Unit price 2', { exact: true }).fill('99');
		await page.keyboard.press('Enter');
		await expect.poll(total).toBe('€99.00');
		await page.reload();
		await page.getByLabel('Unit price 2', { exact: true }).waitFor();
		expect(await page.getByLabel('Unit price 2', { exact: true }).inputValue()).toBe('99');

		// History starts empty after a reload, so there is nothing to undo...
		expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(true);

		// ...but an undo made in this session is saved like any other change.
		await page.getByLabel('Unit price 2', { exact: true }).fill('5');
		await page.keyboard.press('Enter');
		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(total).toBe('€99.00');
		await page.reload();
		await page.getByLabel('Unit price 2', { exact: true }).waitFor();
		expect(await page.getByLabel('Unit price 2', { exact: true }).inputValue()).toBe('99');

		const keys = await page.evaluate(() => Object.keys(localStorage).sort());
		expect(keys.every((key) => /^bubu:(budget|items):/.test(key))).toBe(true);
	});

	it('leaves an abandoned edit unsaved', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Description 2', { exact: true }).fill('Never committed');
		await page.keyboard.press('Escape');
		await page.reload();
		await page.getByLabel('Description 2', { exact: true }).waitFor();
		expect(await page.getByLabel('Description 2', { exact: true }).inputValue()).toBe('Music');
	});

	it('shows an alert when saving fails, keeps the work on screen, and recovers on retry', async () => {
		await page.addInitScript(() => {
			const original = Storage.prototype.setItem;
			Storage.prototype.setItem = function (key: string, value: string) {
				if ((window as unknown as { __failWrites?: boolean }).__failWrites) {
					throw new DOMException('full', 'QuotaExceededError');
				}
				return original.call(this, key, value);
			};
		});
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Description 2', { exact: true }).waitFor();
		await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = true));

		await page.getByLabel('Description 2', { exact: true }).fill('Unsaved');
		await page.keyboard.press('Enter');
		await page.getByRole('alert').waitFor();
		expect(await page.getByRole('alert').innerText()).toContain('Your changes are not being saved');
		expect(await page.getByLabel('Description 2', { exact: true }).inputValue()).toBe('Unsaved'); // still there

		await page.evaluate(() => ((window as unknown as { __failWrites: boolean }).__failWrites = false));
		await page.getByRole('button', { name: 'Try again' }).click();
		await expect.poll(() => page.getByRole('alert').count()).toBe(0);
		await page.reload();
		await page.getByLabel('Description 2', { exact: true }).waitFor();
		expect(await page.getByLabel('Description 2', { exact: true }).inputValue()).toBe('Unsaved');
	});
});

describe('Collapsing groups (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();
	const codes = () => page.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-code')));

	it('hides and shows descendants without changing totals, history or what is saved', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).waitFor();
		const storedBefore = await page.evaluate(() => JSON.stringify({ ...localStorage }));
		const totalBefore = await total();
		expect(await codes()).toEqual(['1', '1.1', '2']);

		await page.getByRole('button', { name: 'Collapse 1', exact: true }).click();
		expect(await codes()).toEqual(['1', '2']);
		expect(await total()).toBe(totalBefore);
		expect(await page.getByRole('button', { name: 'Undo' }).isDisabled()).toBe(true);
		await page.getByRole('button', { name: 'Expand all' }).click();
		expect(await codes()).toEqual(['1', '1.1', '2']);

		expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(storedBefore); // nothing written
	});

	it('forgets which Groups were collapsed after a reload', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('button', { name: 'Collapse all' }).click();
		expect(await codes()).toEqual(['1', '2']);
		await page.reload();
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).waitFor();
		expect(await codes()).toEqual(['1', '1.1', '2']);
	});
});

describe('Keyboard navigation and editing (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();
	/** Focus as "code:column:mode", where mode is edit inside an input and nav on a cell. */
	const where = () =>
		page.evaluate(() => {
			const el = document.activeElement as HTMLElement | null;
			const td = el?.closest<HTMLElement>('[data-cell]');
			if (!el || !td) return null;
			return `${td.closest('tr')!.dataset.code}:${td.dataset.cell!.split('|')[1]}:${el.tagName === 'INPUT' ? 'edit' : 'nav'}`;
		});

	it('moves, edits, tabs, validates and cancels from the keyboard alone, and the result is saved', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('grid', { name: 'Budget Items' }).waitFor();
		await page.locator('tr[data-code="1.1"] td[data-cell$="|code"]').click(); // land on a cell
		expect(await where()).toBe('1.1:code:nav');

		await page.keyboard.press('ArrowRight');
		expect(await where()).toBe('1.1:description:nav');
		await page.keyboard.press('Enter'); // begin editing
		expect(await where()).toBe('1.1:description:edit');
		await page.keyboard.type('Banquet hall');
		await page.keyboard.press('Tab'); // commit, next editable cell
		expect(await where()).toBe('1.1:quantity:nav');

		await page.keyboard.press('F2');
		await page.keyboard.type('2.5');
		await page.keyboard.press('Tab');
		expect(await where()).toBe('1.1:unit:nav');
		await page.keyboard.press('Enter');
		await page.keyboard.type('hall');
		await page.keyboard.press('Tab');
		expect(await where()).toBe('1.1:unitPrice:nav');
		await page.keyboard.press('Enter');
		await page.keyboard.type('-100.5');
		await page.keyboard.press('Enter'); // commit, move down
		expect(await where()).toBe('2:unitPrice:nav');
		await expect.poll(total).toBe('-€251.25');

		// Typing in an input never navigates; an invalid value keeps the cursor there with a message.
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.press('ArrowLeft');
		expect(await where()).toBe('2:quantity:nav');
		await page.keyboard.press('Enter');
		await page.keyboard.type('abc');
		await page.keyboard.press('ArrowLeft');
		expect(await where()).toBe('2:quantity:edit');
		await page.keyboard.press('Enter');
		await page.getByText('Enter a valid number.').waitFor();
		expect(await where()).toBe('2:quantity:edit');
		await page.keyboard.press('Tab');
		expect(await where()).toBe('2:quantity:edit');

		// Escape abandons it and goes back to navigating.
		await page.keyboard.press('Escape');
		expect(await where()).toBe('2:quantity:nav');
		expect(await page.getByLabel('Quantity 2', { exact: true }).inputValue()).toBe('1');
		await page.keyboard.press('ArrowUp');
		expect(await where()).toBe('1.1:quantity:nav');

		// Read-only cells can be visited but not edited.
		await page.keyboard.press('ArrowUp');
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight'); // row 1: its unit price, calculated for a Group
		expect(await where()).toBe('1:unitPrice:nav');
		await page.keyboard.press('Enter');
		expect(await where()).toBe('1:unitPrice:nav');

		// Everything committed above survived: it was saved automatically.
		await page.reload();
		await page.getByRole('grid', { name: 'Budget Items' }).waitFor();
		expect(await page.getByLabel('Description 1.1', { exact: true }).inputValue()).toBe('Banquet hall');
		expect(await page.getByLabel('Quantity 1.1', { exact: true }).inputValue()).toBe('2.5');
		expect(await page.getByLabel('Unit 1.1', { exact: true }).inputValue()).toBe('hall');
		expect(await page.getByLabel('Unit price 1.1', { exact: true }).inputValue()).toBe('-100.5');
		await expect.poll(total).toBe('-€251.25');
	});

	it('skips rows hidden by a collapsed Group', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).click();
		await page.locator('tr[data-code="1"] td[data-cell$="|code"]').click();
		await page.keyboard.press('ArrowDown');
		expect(await where()).toBe('2:code:nav'); // 1.1 is hidden
	});

	it('has the grid as a single stop in the Tab order', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await page.getByRole('grid', { name: 'Budget Items' }).waitFor();
		const stops = await page.evaluate(() => [...document.querySelectorAll('tbody td[data-cell]')].filter((td) => td.getAttribute('tabindex') === '0').length);
		expect(stops).toBe(1);
		const inputsInTabOrder = await page.evaluate(() => [...document.querySelectorAll('tbody input')].filter((i) => (i as HTMLInputElement).tabIndex >= 0).length);
		expect(inputsInTabOrder).toBe(0);
	});
});

describe('Undo and redo shortcuts (built static site)', () => {
	const total = () => page.getByLabel('Grand total', { exact: true }).innerText();
	const field = (label: string) => page.getByLabel(label, { exact: true });
	const commit = async (label: string, text: string) => {
		await field(label).fill(text);
		await page.keyboard.press('Enter');
	};
	const undoDisabled = () => page.getByRole('button', { name: 'Undo' }).isDisabled();
	const redoDisabled = () => page.getByRole('button', { name: 'Redo' }).isDisabled();

	it('undoes and redoes cell edits with Ctrl and with Cmd, and saves what they leave', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await field('Unit price 2').waitFor();
		await commit('Unit price 2', '50');
		await expect.poll(total).toBe('€50.00');

		await page.keyboard.press('Control+z');
		await expect.poll(total).toBe('€0.00');
		await page.keyboard.press('Meta+Shift+z');
		await expect.poll(total).toBe('€50.00');
		await page.keyboard.press('Meta+z');
		await expect.poll(total).toBe('€0.00');
		await page.keyboard.press('Control+Shift+z');
		await expect.poll(total).toBe('€50.00');
		expect(await field('Unit price 2').inputValue()).toBe('50');

		// The result of the last redo was saved; the history itself was not.
		await page.reload();
		await field('Unit price 2').waitFor();
		expect(await field('Unit price 2').inputValue()).toBe('50');
		expect(await undoDisabled()).toBe(true);
		expect(await redoDisabled()).toBe(true);
		await page.keyboard.press('Control+z');
		expect(await field('Unit price 2').inputValue()).toBe('50'); // empty history: nothing to undo
		const keys = await page.evaluate(() => Object.keys(localStorage));
		expect(keys.every((key) => /^bubu:(budget|items):/.test(key))).toBe(true);
	});

	it('undoes adding a child with its conversion, and a subtree deletion', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await field('Unit price 2').waitFor();
		await commit('Unit price 2', '7');
		await commit('Quantity 2', '3');
		await expect.poll(total).toBe('€21.00');

		await page.getByRole('button', { name: 'Add child to 2', exact: true }).click();
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		await field('Description 2.1').waitFor();
		await page.keyboard.press('Escape'); // leave the new row's input
		await expect.poll(total).toBe('€0.00');

		await page.keyboard.press('Control+z'); // the whole conversion, in one step
		await expect.poll(total).toBe('€21.00');
		expect(await field('Unit price 2').inputValue()).toBe('7');
		expect(await field('Quantity 2').inputValue()).toBe('3');
		await page.keyboard.press('Meta+Shift+z');
		await expect.poll(total).toBe('€0.00');
		await page.keyboard.press('Control+z');

		// Subtree deletion.
		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect.poll(() => page.locator('tbody tr').count()).toBe(1);
		await page.keyboard.press('Meta+z');
		await expect.poll(() => page.locator('tbody tr').count()).toBe(3);
		expect(await field('Description 1.1').inputValue()).toBe('Hall rental');
		await page.keyboard.press('Control+Shift+z');
		await expect.poll(() => page.locator('tbody tr').count()).toBe(1);
	});

	it('keeps each Budget history separate when switching', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await field('Quantity 2').waitFor();
		await commit('Quantity 2', '9');

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Renovation/ }).click();
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(await undoDisabled()).toBe(true); // B has no history of its own
		await page.keyboard.press('Control+z');
		expect(await items()).toEqual(['1 Paint', '2 Flooring']);

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await page.getByRole('link', { name: /Wedding/ }).click();
		await page.getByRole('heading', { name: 'Wedding' }).waitFor();
		expect(await field('Quantity 2').inputValue()).toBe('9'); // untouched by B's undo
		expect(await undoDisabled()).toBe(false);
		await page.keyboard.press('Control+z');
		expect(await field('Quantity 2').inputValue()).toBe('1');
	});

	it('drops redo once a new change follows an undo', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await field('Quantity 2').waitFor();
		await commit('Quantity 2', '2');
		await page.keyboard.press('Control+z');
		expect(await redoDisabled()).toBe(false);
		await commit('Quantity 2', '3');
		expect(await redoDisabled()).toBe(true);
		await page.keyboard.press('Control+Shift+z');
		expect(await field('Quantity 2').inputValue()).toBe('3');
	});

	it('leaves the browser its own undo while text is being typed', async () => {
		await page.goto(`${baseUrl}/budgets/${A}`);
		await field('Quantity 2').waitFor();
		await commit('Quantity 2', '4');
		await field('Description 2').click();
		await page.keyboard.type(' extra'); // uncommitted text in the cell
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Meta+z');

		expect(await field('Quantity 2').inputValue()).toBe('4'); // the committed command was not undone
		expect(await undoDisabled()).toBe(false); // and its history is intact
		await page.keyboard.press('Escape'); // abandon the typing
		await page.keyboard.press('Control+z');
		expect(await field('Quantity 2').inputValue()).toBe('1'); // now the shortcut is the editor's again
	});
});
