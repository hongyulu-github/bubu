import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createBudget, createItem } from '../src/lib/budget/model';
import { exportBudget } from '../src/lib/excel/export-budget';
import { decodeBudgetWorkbook } from '../src/lib/excel/metadata';
import { readWorkbook } from '../src/lib/excel/workbook';

const baseUrl = inject('baseUrl');

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser.close();
});

describe('ExcelJS in the built static site', () => {
	it('writes and reads a workbook in the browser from the production bundle, with no request leaving the site', async () => {
		const page = await (await browser.newContext()).newPage();
		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto(`${baseUrl}/prototypes/excel`);
		await page.waitForLoadState('networkidle'); // hydrated: a click before that would be lost
		await page.getByRole('button', { name: 'Write and read a workbook' }).click();
		await page.getByText(/^OK:/).waitFor();

		const status = await page.getByRole('status').innerText();
		expect(status).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		expect(status).toContain('A1 = BuBu');
		expect(errors).toEqual([]);
		expect(requests.every((url) => url.startsWith(baseUrl))).toBe(true); // static files only: no API, no CDN
		await page.context().close();
	});

	it('does not load ExcelJS until a workbook is needed', async () => {
		const page = await (await browser.newContext()).newPage();
		const scripts: Promise<string>[] = [];
		page.on('response', (response) => {
			if (response.url().endsWith('.js')) scripts.push(response.text());
		});
		await page.goto(`${baseUrl}/budgets`);
		await page.waitForLoadState('networkidle');
		const loaded = await Promise.all(scripts);
		expect(loaded.length).toBeGreaterThan(0);
		expect(loaded.some((code) => code.includes('lastModifiedBy'))).toBe(false); // the ~900 kB ExcelJS chunk is not among the start-up files
		await page.context().close();
	});

	it('ships the third-party notice with the site', async () => {
		const response = await fetch(`${baseUrl}/third-party-notices.txt`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('ExcelJS');
		expect(text).toContain('Permission is hereby granted, free of charge');
	});

	it('downloads the empty Budget template from the New Budget page', async () => {
		const page = await (await browser.newContext()).newPage();
		await page.goto(`${baseUrl}/budgets/new`);
		await page.waitForLoadState('networkidle'); // hydrated: a click before that would be lost

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download an empty template' }).click()
		]);

		expect(download.suggestedFilename()).toBe('bubu-budget-template.xlsx');
		const chunks: Buffer[] = [];
		for await (const chunk of (await download.createReadStream())!) chunks.push(chunk as Buffer);
		const bytes = Buffer.concat(chunks);
		const workbook = await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

		expect(workbook.worksheets.map((sheet) => [sheet.name, sheet.state])).toEqual([['Budget', 'visible']]);
		const sheet = workbook.getWorksheet('Budget')!;
		expect(sheet.getRow(1).values).toEqual([undefined, 'Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
		expect(sheet.actualRowCount).toBe(1);
		await page.context().close();
	});

	it('downloads a saved Budget as an .xlsx from its editor, with no request leaving the site', async () => {
		const id = '11111111-1111-4111-8111-111111111111';
		const item = (n: number, parentId: string | null, description: string, unitPrice: string) => ({
			id: `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`,
			budgetId: id,
			parentId,
			sortIndex: n,
			description,
			unitPrice,
			quantity: '2'
		});
		const at = '2026-02-01T00:00:00.000Z';
		const page = await (await browser.newContext()).newPage();
		await page.goto(`${baseUrl}/`);
		await page.evaluate(
			([budgetId, saved]) => {
				localStorage.clear();
				localStorage.setItem(`bubu:budget:${budgetId}`, JSON.stringify({ version: 1, data: { id: budgetId, name: 'Wedding', currency: 'EUR', createdAt: saved, updatedAt: saved } }));
			},
			[id, at] as const
		);
		await page.evaluate(
			([budgetId, items]) => localStorage.setItem(`bubu:items:${budgetId}`, JSON.stringify({ version: 1, data: items })),
			[id, [item(1, null, 'Venue', '0'), item(2, '00000000-0000-4000-8000-000000000001', 'Hall', '19.990')]] as const
		);

		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		await page.goto(`${baseUrl}/budgets/${id}`);
		await page.getByRole('heading', { level: 1, name: 'Wedding' }).waitFor();
		await page.waitForLoadState('networkidle');
		requests.length = 0;

		const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as Excel' }).click()]);

		expect(download.suggestedFilename()).toBe('Wedding.xlsx');
		const chunks: Buffer[] = [];
		for await (const chunk of (await download.createReadStream())!) chunks.push(chunk as Buffer);
		const bytes = Buffer.concat(chunks);
		const decoded = decodeBudgetWorkbook(await readWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer));
		if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
		expect(decoded.budget.name).toBe('Wedding');
		expect(decoded.rows.map((row) => [row.code, row.description, row.unitPrice])).toEqual([['1', 'Venue', '0'], ['1.1', 'Hall', '19.990']]);
		expect(requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('blob:'))).toEqual([]);
		await page.context().close();
	});

	it('imports an exported workbook on the built site, opens its editor and keeps it after a reload', async () => {
		const id = '44444444-4444-4444-8444-444444444444';
		const budget = createBudget({ id, name: 'Imported wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00.000Z') });
		const items = [
			createItem({ id: '00000000-0000-4000-8000-000000000001', budgetId: id, description: 'Venue', quantity: '2' }),
			createItem({ id: '00000000-0000-4000-8000-000000000002', budgetId: id, parentId: '00000000-0000-4000-8000-000000000001', description: 'Hall', unitPrice: '19.990', unit: 'days' })
		];
		const blob = await exportBudget(budget, items);

		const page = await (await browser.newContext()).newPage();
		await page.goto(`${baseUrl}/budgets/new`);
		await page.waitForLoadState('networkidle'); // hydrated before the file is chosen
		await page.locator('input[type="file"]').setInputFiles({
			name: 'wedding.xlsx',
			mimeType: blob.type,
			buffer: Buffer.from(await blob.arrayBuffer())
		});

		await page.waitForURL(`${baseUrl}/budgets/${id}`);
		await page.getByRole('heading', { name: 'Imported wedding' }).waitFor();
		await page.getByLabel('Description 1.1', { exact: true }).waitFor();
		expect(await page.getByLabel('Description 1.1', { exact: true }).inputValue()).toBe('Hall');

		await page.reload();
		await page.getByRole('heading', { name: 'Imported wedding' }).waitFor();
		expect(await page.getByLabel('Unit price 1.1', { exact: true }).inputValue()).toBe('19.990');
		await page.context().close();
	});
});
