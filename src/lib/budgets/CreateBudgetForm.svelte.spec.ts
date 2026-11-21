import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem } from '../budget/model';
import { toString } from '../budget/numbers';
import { CommandHistory } from '../history/commands';
import { TEMPLATE_FILENAME } from '../excel/template';
import { XLSX_MIME, readWorkbook } from '../excel/workbook';
import { bubuStorage } from '../storage/bubu';
import { BudgetStore } from '../state/budgets.svelte';
import CreateBudgetForm from './CreateBudgetForm.svelte';

const OTHER = '44444444-4444-4444-8444-444444444444';

function setup(options: { hydrate?: boolean; withExistingBudget?: boolean } = {}) {
	const { hydrate = true, withExistingBudget = false } = options;
	if (withExistingBudget) {
		bubuStorage.writeBudget(createBudget({ id: OTHER, name: 'Existing', currency: 'USD' }));
		bubuStorage.writeItems(OTHER, [createItem({ budgetId: OTHER, description: 'Existing item' })]);
	}
	const store = new BudgetStore({ history: new CommandHistory() });
	if (hydrate) store.hydrate();
	const onCreated = vi.fn();
	const oncancel = vi.fn();
	render(CreateBudgetForm, { store, onCreated, oncancel });
	return { store, onCreated, oncancel };
}

const name = () => page.getByLabelText('Name');
const currency = () => page.getByLabelText('Currency');
const create = () => page.getByRole('button', { name: 'Create Budget' });

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('CreateBudgetForm', () => {
	it('has a labelled name field, a currency choice and no errors to start with', async () => {
		setup();
		await expect.element(name()).toBeVisible();
		await expect.element(currency()).toHaveValue('');
		await expect.element(name()).not.toHaveAttribute('aria-invalid');
		expect(document.body.textContent).not.toContain('Enter a name');
	});

	it('creates one root Budget with no Items and a zero grand total', async () => {
		const { store, onCreated } = setup();
		await name().fill('Wedding');
		await currency().selectOptions('EUR');
		await create().click();

		expect(onCreated).toHaveBeenCalledOnce();
		const budget = onCreated.mock.calls[0][0];
		expect(store.budgets).toEqual([budget]);
		expect(store.itemsOf(budget.id)).toEqual([]);

		store.select(budget.id);
		expect(store.rows).toEqual([]);
		expect(toString(store.grandTotal)).toBe('0');
		expect(store.canUndo(budget.id)).toBe(false);
	});

	it('populates the UUID and timestamps and carries the chosen currency', async () => {
		const { store, onCreated } = setup();
		await name().fill('  Trip to Lisbon  ');
		await currency().selectOptions('GBP');
		await create().click();

		const budget = onCreated.mock.calls[0][0];
		expect(budget.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(budget.name).toBe('Trip to Lisbon');
		expect(budget.currency).toBe('GBP');
		expect(Number.isNaN(Date.parse(budget.createdAt))).toBe(false);
		expect(budget.updatedAt).toBe(budget.createdAt);
		expect(store.budgets[0].currency).toBe('GBP');
	});

	it('blocks an empty name and shows the error', async () => {
		const { store, onCreated } = setup();
		await currency().selectOptions('EUR');
		await create().click();

		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		await expect.element(name()).toHaveAttribute('aria-invalid', 'true');
		await expect.element(name()).toHaveFocus();
		expect(onCreated).not.toHaveBeenCalled();
		expect(store.budgets).toEqual([]);
	});

	it('blocks a whitespace-only name', async () => {
		const { store, onCreated } = setup();
		await name().fill('     ');
		await currency().selectOptions('EUR');
		await create().click();

		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		expect(onCreated).not.toHaveBeenCalled();
		expect(store.budgets).toEqual([]);
	});

	it('blocks a missing currency and shows the error', async () => {
		const { store, onCreated } = setup();
		await name().fill('Wedding');
		await create().click();

		await expect.element(page.getByText('Choose a currency.')).toBeVisible();
		await expect.element(currency()).toHaveAttribute('aria-invalid', 'true');
		await expect.element(currency()).toHaveFocus();
		expect(onCreated).not.toHaveBeenCalled();
		expect(store.budgets).toEqual([]);
	});

	it('shows both errors together, then clears each as it is fixed', async () => {
		const { onCreated } = setup();
		await create().click();
		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		await expect.element(page.getByText('Choose a currency.')).toBeVisible();

		await name().fill('Wedding');
		await expect.element(page.getByText('Enter a name for the Budget.')).not.toBeInTheDocument();
		await expect.element(page.getByText('Choose a currency.')).toBeVisible();

		await currency().selectOptions('EUR');
		await expect.element(page.getByText('Choose a currency.')).not.toBeInTheDocument();
		expect(onCreated).not.toHaveBeenCalled();

		await create().click();
		expect(onCreated).toHaveBeenCalledOnce();
	});

	it('loads no template data and leaves other Budgets alone', async () => {
		const { store, onCreated } = setup({ withExistingBudget: true });
		await name().fill('Blank slate');
		await currency().selectOptions('SEK');
		await create().click();

		const created = onCreated.mock.calls[0][0];
		expect(store.budgets.map((budget) => budget.name).sort()).toEqual(['Blank slate', 'Existing']);
		expect(store.itemsOf(created.id)).toEqual([]);
		expect(store.itemsOf(OTHER).map((item) => item.description)).toEqual(['Existing item']);
		expect(store.loadIssues).toEqual([]);
	});

	it('does not write to storage itself (persistence is wired elsewhere)', async () => {
		setup();
		const before = JSON.stringify({ ...localStorage });
		await name().fill('Wedding');
		await currency().selectOptions('EUR');
		await create().click();
		expect(JSON.stringify({ ...localStorage })).toBe(before);
	});

	it('disables creating until saved Budgets have loaded', async () => {
		const { store } = setup({ hydrate: false });
		await expect.element(create()).toBeDisabled();
		store.hydrate();
		await expect.element(create()).toBeEnabled();
	});

	it('has a Cancel button that calls back and creates nothing', async () => {
		const { store, onCreated, oncancel } = setup();
		await name().fill('Typed but not created');
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		expect(oncancel).toHaveBeenCalledOnce();
		expect(onCreated).not.toHaveBeenCalled();
		expect(store.budgets).toEqual([]);
		expect(page.getByRole('link', { name: 'Cancel' }).elements()).toHaveLength(0); // a button, not a link to a page
	});

	describe('Download an empty template', () => {
		/** Catch the file the browser would be given, without actually saving it. */
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
			return { blobs, names };
		}
		afterEach(() => vi.restoreAllMocks());

		it('offers the template as a download and gives an .xlsx file with the six headers and no rows', async () => {
			setup();
			const download = captureDownload();

			await page.getByRole('button', { name: 'Download an empty template' }).click();

			await expect.poll(() => download.blobs.length).toBe(1);
			expect(download.names).toEqual([TEMPLATE_FILENAME]);
			expect(download.blobs[0].type).toBe(XLSX_MIME);
			const workbook = await readWorkbook(await download.blobs[0].arrayBuffer());
			expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Budget']); // no hidden metadata sheet
			const sheet = workbook.getWorksheet('Budget')!;
			expect(sheet.getRow(1).values).toEqual([undefined, 'Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
			expect(sheet.actualRowCount).toBe(1);
		});

		it('creates no Budget and leaves the form as it was', async () => {
			const { store, onCreated } = setup();
			captureDownload();
			await name().fill('Typed name');

			await page.getByRole('button', { name: 'Download an empty template' }).click();

			expect(store.budgets).toEqual([]);
			expect(onCreated).not.toHaveBeenCalled();
			await expect.element(name()).toHaveValue('Typed name');
		});
	});
});
