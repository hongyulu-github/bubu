import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { calculateBudget } from '../src/lib/budget/calculate';
import { formatMoney } from '../src/lib/budget/currency';
import { createBudget, createItem, type Budget, type Item } from '../src/lib/budget/model';
import { METADATA_SHEET } from '../src/lib/excel/metadata';
import { readWorkbook, writeWorkbook } from '../src/lib/excel/workbook';

/**
 * The whole .xlsx workflow on the production static build (LUL-39): export from the editor, read the file,
 * import it back through the real dialogs, and compare what is stored and what is shown. The build is served as
 * plain static files, so everything here runs without a backend.
 */
const baseUrl = inject('baseUrl');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const AT = '2026-02-01T10:20:30.456Z';

const budgetA = (): Budget => createBudget({ id: A, name: 'Wedding', currency: 'EUR', now: new Date(AT) });
const make = (n: number, parent: number | null, sortIndex: number, description: string, extra: Partial<Item> = {}) =>
	createItem({ id: uuid(n), budgetId: A, parentId: parent === null ? null : uuid(parent), sortIndex, description, ...extra });

// Four roots, four levels deep, negative Line prices, fractional Quantities, Groups whose Quantity is not 1,
// Units on some Lines only, and exact decimals no double can hold.
const fixture = (): Item[] => [
	make(1, null, 0, 'Venue', { quantity: '2.5' }),
	make(2, 1, 0, 'Hall rental', { unitPrice: '19.990', quantity: '3', unit: 'days' }),
	make(3, 1, 1, 'Decoration', { quantity: '0.5' }),
	make(4, 3, 0, 'Flowers', { unitPrice: '-0.1000000000000000055511151231257827' }),
	make(5, 3, 1, 'Lights', { unitPrice: '12.345', quantity: '1.5', unit: 'pcs' }),
	make(6, 1, 2, 'Deposit', { unitPrice: '-250' }),
	make(7, null, 1, 'Catering', { quantity: '2' }),
	make(8, 7, 0, 'Food', { unitPrice: '45.5', quantity: '0.25', unit: 'kg' }),
	make(9, 7, 1, 'Drinks', { quantity: '3' }),
	make(10, 9, 0, 'Wine', { unitPrice: '8.75', quantity: '12', unit: 'bottles' }),
	make(11, 9, 1, 'Corkage', { unitPrice: '-1.5', quantity: '12' }),
	make(12, null, 2, 'Music', { unitPrice: '1200.5', unit: 'hours' }),
	make(13, null, 3, 'Discounts', { quantity: '3' }),
	make(14, 13, 0, 'Coupon', { unitPrice: '-10' }),
	make(15, 13, 1, 'Voucher', { unitPrice: '-5.5', quantity: '2' })
];
const grandTotalText = () => formatMoney(calculateBudget(fixture()).grandTotal, 'EUR');

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
	page = await (await browser.newContext({ acceptDownloads: true })).newPage();
	requests = [];
	page.on('request', (request) => requests.push(request.url()));
	await page.goto(`${baseUrl}/`);
});
afterEach(async () => {
	await page.context().close();
});

/** Put Budgets straight into browser storage, in the saved format, as if they had been made earlier. */
async function seed(budget: Budget, items: Item[]) {
	await page.evaluate(
		([key, doc, itemsKey, list]) => {
			localStorage.setItem(key, JSON.stringify({ version: 1, data: doc }));
			localStorage.setItem(itemsKey, JSON.stringify({ version: 1, data: list }));
		},
		[`bubu:budget:${budget.id}`, budget, `bubu:items:${budget.id}`, items] as const
	);
}
/** Every BuBu key with its raw text, sorted: equal snapshots mean not a byte changed. */
const stored = () =>
	page.evaluate(() =>
		Object.keys(localStorage)
			.filter((key) => key.startsWith('bubu:'))
			.sort()
			.map((key) => [key, localStorage.getItem(key) ?? ''] as const)
	);
const storedBudget = async (id: string) => JSON.parse((await stored()).find(([key]) => key === `bubu:budget:${id}`)![1]).data as Budget;
const storedItems = async (id: string) => JSON.parse((await stored()).find(([key]) => key === `bubu:items:${id}`)![1]).data as Item[];
const byId = (items: Item[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));

async function bytesOf(download: { createReadStream(): Promise<NodeJS.ReadableStream | null> }) {
	const chunks: Buffer[] = [];
	for await (const chunk of (await download.createReadStream())!) chunks.push(chunk as Buffer);
	return Buffer.concat(chunks);
}
async function downloadFrom(url: string, button: string) {
	await page.goto(`${baseUrl}${url}`);
	await page.waitForLoadState('networkidle');
	const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
	return bytesOf(download);
}
const exportBudgetA = () => downloadFrom(`/budgets/${A}`, 'Download as Excel');

async function chooseFile(buffer: Buffer, name = 'budget.xlsx') {
	await page.goto(`${baseUrl}/budgets/new`);
	await page.waitForLoadState('networkidle'); // hydrated before a file is chosen
	await page.locator('input[type="file"]').setInputFiles({ name, mimeType: XLSX, buffer });
}
// The import dialog opens on top of the Budgets drawer, so it is the last (innermost) dialog on the page.
const dialog = () => page.getByRole('dialog').last();
/** The import dialog that asks for a Budget name, on top of the drawer's own form, which has fields with the same labels. */
const nameDialog = () => page.getByRole('dialog', { name: 'Name this Budget' });
const press = (name: string) => dialog().getByRole('button', { name, exact: true }).click();

/** What the editor shows for the open Budget: every row's Code and cells, and the grand total. */
async function shown() {
	await page.locator('table[aria-label="Budget Items"] tbody tr').first().waitFor();
	const rows = await page.locator('table[aria-label="Budget Items"] tbody tr').evaluateAll((trs) =>
		trs.map((tr) => [tr.getAttribute('data-code'), ...[...tr.querySelectorAll('td')].slice(1, 6).map((td) => td.querySelector('input')?.value ?? td.textContent?.trim() ?? '')])
	);
	const total = await page.getByLabel('Grand total', { exact: true }).innerText();
	return { rows, total };
}
const openEditor = async (id: string) => {
	await page.goto(`${baseUrl}/budgets/${id}`);
	await page.getByLabel('Grand total', { exact: true }).waitFor();
	return shown();
};

describe('round trip: export, then import with a confirmed Replace', () => {
	it('brings back the same identities, Budget details, hierarchy, order and exact values', async () => {
		await seed(budgetA(), fixture());
		const before = { budget: await storedBudget(A), items: byId(await storedItems(A)), screen: await openEditor(A) };
		expect(before.screen.total).toBe(grandTotalText()); // the app itself agrees with the shared engine

		const file = await exportBudgetA();
		await chooseFile(file);
		await press('Replace…');
		await press('Replace Budget');
		await page.waitForURL(`${baseUrl}/budgets/${A}`);
		await page.getByLabel('Grand total', { exact: true }).waitFor();

		expect(await storedBudget(A)).toEqual(before.budget); // id, name, currency, both timestamps
		expect(byId(await storedItems(A))).toEqual(before.items); // ids, parents, order, every editable value, exact decimals
		expect(await shown()).toEqual(before.screen); // Codes, Group prices, Totals and the grand total, recomputed

		await page.reload(); // and it is really saved
		await page.getByLabel('Grand total', { exact: true }).waitFor();
		expect(await shown()).toEqual(before.screen);
	});

	it('reproduces the derived values the shared engine gives, negative and fractional parts included', async () => {
		await seed(budgetA(), fixture());
		await chooseFile(await exportBudgetA());
		await press('Replace…');
		await press('Replace Budget');
		await page.waitForURL(`${baseUrl}/budgets/${A}`);

		const { rows, total } = await shown();
		expect(total).toBe(grandTotalText());
		expect(rows.map((row) => row[0])).toEqual(['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.3', '2', '2.1', '2.2', '2.2.1', '2.2.2', '3', '4', '4.1', '4.2']);
		const { amounts } = calculateBudget(fixture());
		const money = (id: string, field: 'unitPrice' | 'total') => formatMoney(amounts.get(id)![field], 'EUR');
		const plain = (text: string | null) => (text ?? '').replace(/[^\d.-]/g, '');
		const row = (code: string) => rows.find((r) => r[0] === code)!;
		expect(plain(row('4')[5])).toBe(plain(money(uuid(13), 'total'))); // Discounts: a negative roll-up, Quantity 3
		expect(plain(row('1')[4])).toBe(plain(money(uuid(1), 'unitPrice'))); // a Group's Unit price is the sum of its children
		expect(plain(row('1.2')[5])).toBe(plain(money(uuid(3), 'total'))); // a Group of Quantity 0.5
	});

	it('needs no backend: only static files from the site are requested', async () => {
		await seed(budgetA(), fixture());
		await chooseFile(await exportBudgetA());
		await press('Replace…');
		await press('Replace Budget');
		await page.waitForURL(`${baseUrl}/budgets/${A}`);
		expect(requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('blob:') && !url.startsWith('data:'))).toEqual([]);
		expect(requests.some((url) => /\/api\//.test(url))).toBe(false);
	});
});

describe('round trip: import as a copy', () => {
	it('creates a disjoint identity graph with the same values and structure, leaving the saved Budget unchanged', async () => {
		await seed(budgetA(), fixture());
		await seed(createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date(AT) }), []);
		const before = await openEditor(A);
		const file = await exportBudgetA();
		const saved = await stored();

		await chooseFile(file);
		await press('Import as copy');
		await page.waitForURL(new RegExp(`/budgets/(?!${A}|${B})[0-9a-f-]{36}$`));
		const copyId = page.url().split('/').pop()!;
		await page.getByLabel('Grand total', { exact: true }).waitFor();

		// the existing Budgets are byte for byte what they were
		const after = await stored();
		for (const [key, value] of saved) expect(after.find(([k]) => k === key)![1]).toBe(value);

		const original = byId(await storedItems(A));
		const copy = await storedItems(copyId);
		expect((await storedBudget(copyId)).name).toBe('Wedding (copy)');
		expect(copyId).not.toBe(A);
		const originalIds = new Set([A, ...original.map((i) => i.id)]);
		expect(copy.every((item) => !originalIds.has(item.id))).toBe(true); // no identity shared
		expect(new Set(copy.map((i) => i.id)).size).toBe(copy.length);
		expect(copy.every((item) => item.budgetId === copyId)).toBe(true);
		const ids = new Set(copy.map((i) => i.id));
		expect(copy.every((item) => item.parentId === null || ids.has(item.parentId))).toBe(true);

		// the same structure and values: map each copy item back to its original by description
		const named = (items: Item[]) => new Map(items.map((i) => [i.description, i]));
		const originals = named(original);
		for (const item of copy) {
			const twin = originals.get(item.description)!;
			expect({ ...item, id: '', budgetId: '', parentId: item.parentId && copy.find((c) => c.id === item.parentId)!.description }).toEqual({
				...twin,
				id: '',
				budgetId: '',
				parentId: twin.parentId && original.find((o) => o.id === twin.parentId)!.description
			});
		}
		expect((await shown()).total).toBe(before.total); // recomputed totals match
		expect((await shown()).rows).toEqual(before.rows);
	});
});

describe('import without BuBu metadata', () => {
	const rowsOf = (...rows: unknown[][]) => rows;
	async function templateWith(rows: unknown[][]) {
		const template = await downloadFrom('/budgets/new', 'Download an empty template');
		const workbook = await readWorkbook(template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer);
		expect(workbook.getWorksheet(METADATA_SHEET)).toBeUndefined(); // a template carries no identity
		const sheet = workbook.getWorksheet('Budget')!;
		for (const row of rows) sheet.addRow(row as never);
		return Buffer.from(await (await writeWorkbook(workbook)).arrayBuffer());
	}

	it('imports the downloaded empty template as an empty Budget after asking for a name and currency', async () => {
		await chooseFile(await templateWith([]));
		await nameDialog().getByLabel('Name').fill('Blank');
		await nameDialog().getByLabel('Currency').selectOption('SEK');
		await press('Import Budget');
		await page.waitForURL(/\/budgets\/[0-9a-f-]{36}$/);
		const id = page.url().split('/').pop()!;
		expect(await storedItems(id)).toEqual([]); // no starter Items
		expect(await storedBudget(id)).toMatchObject({ name: 'Blank', currency: 'SEK' });
	});

	it('imports a filled template with fresh identities and the file\'s exact values and totals', async () => {
		const file = await templateWith(
			rowsOf(
				['1', 'Venue', 2.5, null, 'ignored', 'ignored'],
				['1.1', 'Hall', 3, 'days', 19.99, 59.97],
				['1.2', 'Deposit', 1, null, -250, -250],
				['2', 'Music', 0.5, 'hours', 1200.5, 600.25]
			)
		);
		await chooseFile(file);
		await nameDialog().getByLabel('Name').fill('From template');
		await nameDialog().getByLabel('Currency').selectOption('EUR');
		await press('Import Budget');
		await page.waitForURL(/\/budgets\/[0-9a-f-]{36}$/);
		const id = page.url().split('/').pop()!;

		const items = await storedItems(id);
		expect(items.map((i) => [i.description, i.quantity, i.unitPrice, i.unit])).toEqual([
			['Venue', '2.5', '0', undefined],
			['Hall', '3', '19.99', 'days'],
			['Deposit', '1', '-250', undefined],
			['Music', '0.5', '1200.5', 'hours']
		]);
		expect(items.every((i) => i.budgetId === id)).toBe(true);
		expect(items.some((i) => [uuid(1), uuid(2)].includes(i.id))).toBe(false);
		await page.getByLabel('Grand total', { exact: true }).waitFor();
		// (19.99 x 3 - 250) x 2.5 + 1200.5 x 0.5 = -475.075 + 600.25 = 125.175, from the values only: the Total cells were ignored
		expect((await shown()).total).toBe(formatMoney(calculateBudget(items).grandTotal, 'EUR'));
		expect((await shown()).total).toBe('€125.18');
	});
});

describe('files that must be refused, and cancelled imports', () => {
	/** An exported workbook of the fixture, then changed by `edit` before it is "sent back". */
	async function edited(edit: (workbook: Awaited<ReturnType<typeof readWorkbook>>) => void) {
		const file = await exportBudgetA();
		const workbook = await readWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
		edit(workbook);
		return Buffer.from(await (await writeWorkbook(workbook)).arrayBuffer());
	}
	const refused = async (file: Buffer, expected: string[]) => {
		const before = await stored();
		await chooseFile(file);
		const shown = page.getByRole('dialog', { name: 'This workbook cannot be imported' });
		await shown.waitFor();
		for (const text of expected) expect(await shown.innerText()).toContain(text);
		await press('Close');
		expect(page.url()).toBe(`${baseUrl}/`); // still on the main page, nothing opened
		expect(await stored()).toEqual(before); // not a byte changed
	};

	beforeEach(async () => {
		await seed(budgetA(), fixture());
	});

	it('refuses an unsupported metadata version', async () => {
		await refused(await edited((wb) => (wb.getWorksheet(METADATA_SHEET)!.getCell('B1').value = '2')), ['version 2']);
	});

	it('refuses malformed metadata', async () => {
		await refused(await edited((wb) => (wb.getWorksheet(METADATA_SHEET)!.getCell('C10').value = 'not-a-uuid')), ['not a UUID']);
	});

	it('refuses rows that were sorted away from their saved identities', async () => {
		await refused(
			await edited((wb) => {
				const sheet = wb.getWorksheet('Budget')!;
				const first = sheet.getRow(4).values as unknown[];
				sheet.getRow(4).values = sheet.getRow(5).values as never;
				sheet.getRow(5).values = first as never;
			}),
			['Row ']
		);
	});

	it('refuses missing or misplaced columns, naming the cell', async () => {
		await refused(await edited((wb) => (wb.getWorksheet('Budget')!.getCell('C1').value = 'Qty')), ['Column C should be titled "Quantity", but is "Qty"']);
	});

	it('refuses a missing parent, a duplicate Code and a malformed Code', async () => {
		await refused(
			await edited((wb) => {
				const sheet = wb.getWorksheet('Budget')!;
				sheet.getCell('A5').value = '9.9.9'; // no parent 9.9
				sheet.getCell('A6').value = '1'; // a second "1"
				sheet.getCell('A7').value = 'one'; // not a Code
			}),
			['has no parent', 'already used', 'is not a Code']
		);
	});

	it('refuses invalid numbers, naming each cell: blank, text and negative Quantity, and a text Unit price', async () => {
		await refused(
			await edited((wb) => {
				const sheet = wb.getWorksheet('Budget')!;
				sheet.getCell('C4').value = 'lots';
				sheet.getCell('C5').value = -1;
				sheet.getCell('C6').value = null;
				sheet.getCell('E8').value = 'ten';
			}),
			['Quantity (C4)', 'Quantity cannot be negative', 'Quantity (C6)', 'Unit price (E8)']
		);
	});

	it('refuses a file that is not a workbook', async () => {
		await refused(Buffer.from('definitely not a spreadsheet'), ['could not be read as an Excel (.xlsx) workbook']);
	});

	it('changes nothing when the conflict dialog is cancelled, or Replace is backed out of', async () => {
		const file = await exportBudgetA();
		const before = await stored();

		await chooseFile(file);
		await press('Cancel');
		await page.getByRole('dialog', { name: /already saved/ }).waitFor({ state: 'detached' });
		await chooseFile(file);
		await press('Replace…');
		await press('Back');
		await press('Cancel');
		await page.getByRole('dialog', { name: /already saved/ }).waitFor({ state: 'detached' });

		expect(page.url()).toBe(`${baseUrl}/`);
		expect(await stored()).toEqual(before);
	});

	it('changes nothing when the name and currency dialog is cancelled', async () => {
		const template = await downloadFrom('/budgets/new', 'Download an empty template');
		const before = await stored();
		await chooseFile(template);
		await press('Cancel');
		await page.getByRole('dialog', { name: 'Name this Budget' }).waitFor({ state: 'detached' });
		expect(await stored()).toEqual(before);
	});
});

describe('a failure while saving leaves no partial Budget', () => {
	/** Make the browser refuse to store any Budget document (as a full disk would), from now on. */
	const failBudgetWrites = () =>
		page.evaluate(() => {
			const original = Storage.prototype.setItem;
			Storage.prototype.setItem = function (key: string, value: string) {
				if (key.startsWith('bubu:budget:')) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
				return original.call(this, key, value);
			};
		});

	it('keeps a new import out of storage entirely: not even its Items are left', async () => {
		await seed(createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date(AT) }), []);
		const before = await stored();
		const file = await exportBudgetFromFixtureOffline(); // Budget A is not saved here, so this is a new Budget
		await page.goto(`${baseUrl}/budgets/new`);
		await page.waitForLoadState('networkidle');
		await failBudgetWrites();
		await page.locator('input[type="file"]').setInputFiles({ name: 'budget.xlsx', mimeType: XLSX, buffer: file });

		const shown = page.getByRole('dialog', { name: 'The Budget could not be imported' });
		await shown.waitFor();
		expect(await shown.innerText()).toContain('Nothing was changed');
		expect(await stored()).toEqual(before);
		expect(page.url()).toBe(`${baseUrl}/`);
	});

	it('leaves a replaced Budget exactly as it was when the replacement cannot be saved', async () => {
		await seed(budgetA(), fixture());
		const file = await exportBudgetA();
		const before = await stored();
		await page.goto(`${baseUrl}/budgets/new`);
		await page.waitForLoadState('networkidle');
		await failBudgetWrites();
		await page.locator('input[type="file"]').setInputFiles({ name: 'budget.xlsx', mimeType: XLSX, buffer: file });
		await press('Replace…');
		await press('Replace Budget');

		await page.getByRole('dialog', { name: 'The Budget could not be imported' }).waitFor();
		expect(await stored()).toEqual(before);
	});
});

/** An export of the fixture made without the app: used where the Budget is not saved in the browser yet. */
async function exportBudgetFromFixtureOffline(): Promise<Buffer> {
	const { exportBudget } = await import('../src/lib/excel/export-budget');
	return Buffer.from(await (await exportBudget(budgetA(), fixture())).arrayBuffer());
}
