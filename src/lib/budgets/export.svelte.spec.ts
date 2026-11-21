import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { decodeBudgetWorkbook } from '../excel/metadata';
import { XLSX_MIME, readWorkbook } from '../excel/workbook';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import BudgetEditorPage from './BudgetEditorPage.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const item = (n: number, parent: number | null, extra: Partial<Item> = {}) =>
	createItem({ id: uuid(n), budgetId: A, parentId: parent === null ? null : uuid(parent), sortIndex: n, description: `Item ${n}`, ...extra });

function openStore(items: Item[]) {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate();
	store.setBudget(createBudget({ id: A, name: 'Wedding / 2026', currency: 'EUR' }), items);
	store.select(A);
	return store;
}

/** Catch the file the browser would be given, without saving it, and note any network use. */
function captureDownload() {
	const blobs: Blob[] = [];
	const names: string[] = [];
	vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
		blobs.push(blob as Blob);
		return 'blob:test';
	});
	vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
		names.push(this.download);
	});
	return { blobs, names, fetch: vi.spyOn(globalThis, 'fetch'), xhr: vi.spyOn(XMLHttpRequest.prototype, 'open') };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('Download as Excel', () => {
	it('downloads the Budget as an .xlsx named after it, built in the browser with no request', async () => {
		const store = openStore([item(1, null), item(2, 1, { unitPrice: '19.990', quantity: '3', unit: 'days' }), item(3, null, { unitPrice: '-5' })]);
		render(BudgetEditorPage, { budgetId: A, store });
		const download = captureDownload();

		await page.getByRole('button', { name: 'Download as Excel' }).click();

		await expect.poll(() => download.blobs.length).toBe(1);
		expect(download.names).toEqual(['Wedding - 2026.xlsx']); // a "/" cannot be in a file name
		expect(download.blobs[0].type).toBe(XLSX_MIME);
		expect(download.fetch).not.toHaveBeenCalled();
		expect(download.xhr).not.toHaveBeenCalled();

		const decoded = decodeBudgetWorkbook(await readWorkbook(await download.blobs[0].arrayBuffer()));
		if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
		expect(decoded.budget.id).toBe(A);
		expect(decoded.rows.map((row) => [row.code, row.itemId])).toEqual([['1', uuid(1)], ['1.1', uuid(2)], ['2', uuid(3)]]);
		expect(decoded.rows[1]).toMatchObject({ unitPrice: '19.990', quantity: '3', unit: 'days' });
	});

	it('exports the current state, including a cell that was just edited', async () => {
		const store = openStore([item(1, null, { unitPrice: '1' }), item(2, null, { unitPrice: '2' })]);
		render(BudgetEditorPage, { budgetId: A, store });
		store.editItem(A, uuid(2), 'unitPrice', '7.25');
		const download = captureDownload();

		await page.getByRole('button', { name: 'Download as Excel' }).click();

		await expect.poll(() => download.blobs.length).toBe(1);
		const sheet = (await readWorkbook(await download.blobs[0].arrayBuffer())).getWorksheet('Budget')!;
		expect(sheet.getCell('E3').value).toBe(7.25);
	});

	it('changes no Items and records no history', async () => {
		const store = openStore([item(1, null)]);
		const items = store.items;
		render(BudgetEditorPage, { budgetId: A, store });
		captureDownload();

		await page.getByRole('button', { name: 'Download as Excel' }).click();

		expect(store.items).toBe(items);
		expect(store.canUndo(A)).toBe(false);
	});
});
