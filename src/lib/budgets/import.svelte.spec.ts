import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Budget, type Item } from '../budget/model';
import { exportBudget } from '../excel/export-budget';
import { createTemplate } from '../excel/template';
import { createWorkbook, writeWorkbook } from '../excel/workbook';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { createBubuStorage } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';
import CreateBudgetForm from './CreateBudgetForm.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const item = (budgetId: string, n: number, parent: number | null, extra: Partial<Item> = {}) =>
	createItem({ id: uuid(n), budgetId, parentId: parent === null ? null : uuid(parent), sortIndex: n, description: `Item ${n}`, ...extra });
const budgetA = (): Budget => createBudget({ id: A, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00.000Z') });

// The workbook being imported: Budget A as exported earlier, with a Group, a negative price and a Unit.
const fileItems = (): Item[] => [
	item(A, 1, null, { description: 'Venue', quantity: '2.5' }),
	item(A, 2, 1, { description: 'Hall', unitPrice: '19.990', quantity: '3', unit: 'days' }),
	item(A, 3, null, { description: 'Discount', unitPrice: '-50' })
];
const asFile = (blob: Blob, name = 'budget.xlsx') => new File([blob], name, { type: blob.type });
const exportedFile = async () => asFile(await exportBudget(budgetA(), fileItems()));
const plainFile = async (rows: unknown[][]) => {
	const workbook = await createWorkbook();
	const sheet = workbook.addWorksheet('Budget');
	sheet.addRow(['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
	for (const row of rows) sheet.addRow(row as never);
	return asFile(await writeWorkbook(workbook), 'plain.xlsx');
};

class SelectiveStorage extends FakeStorage {
	failKeys: string[] = [];
	setItem(key: string, value: string) {
		if (this.failKeys.some((prefix) => key.startsWith(prefix))) throw new Error('quota');
		super.setItem(key, value);
	}
}

/** A store over its own fake storage, already holding an older Budget A (one Item) and an unrelated Budget B. */
function setup({ seedA = true } = {}) {
	const fake = new SelectiveStorage();
	const storage = createBubuStorage(() => fake);
	if (seedA) {
		storage.writeBudget({ ...budgetA(), name: 'Wedding (old)' });
		storage.writeItems(A, [item(A, 9, null, { description: 'Old item', unitPrice: '1' })]);
	}
	storage.writeBudget(createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date('2026-03-01T00:00:00.000Z') }));
	storage.writeItems(B, [item(B, 20, null, { description: 'Paint', unitPrice: '10' })]);
	const store = new BudgetStore({ storage, history: new CommandHistory() });
	store.hydrate();
	const onCreated = vi.fn();
	render(CreateBudgetForm, { store, onCreated, oncancel: vi.fn() });
	return { fake, storage, store, onCreated };
}

const upload = async (file: File) => {
	await userEvent.upload(page.elementLocator(document.querySelector<HTMLInputElement>('input[type="file"]')!), file);
};
const dialog = () => page.getByRole('dialog');
const snapshot = (fake: FakeStorage) => JSON.stringify([...fake.data.entries()].sort());

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('importing an Excel workbook', () => {
	it('offers an .xlsx file picker next to the template download', async () => {
		setup();
		await expect.element(page.getByRole('button', { name: 'Import an Excel workbook' })).toBeVisible();
		const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
		expect(input.accept).toContain('.xlsx');
	});

	it('imports an export of a new Budget at once, keeping its identities and Budget details, and opens it', async () => {
		const { fake, store, onCreated } = setup({ seedA: false });
		await upload(await exportedFile());

		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		expect(dialog().elements()).toHaveLength(0); // nothing to ask: no dialog
		expect(onCreated.mock.calls[0][0]).toEqual(budgetA()); // the editor to open
		expect(store.budgets.find((b) => b.id === A)).toEqual(budgetA());
		expect(store.itemsOf(A).map((i) => [i.id, i.description, i.unitPrice, i.quantity, i.unit])).toEqual([
			[uuid(1), 'Venue', '0', '2.5', undefined],
			[uuid(2), 'Hall', '19.990', '3', 'days'],
			[uuid(3), 'Discount', '-50', '1', undefined]
		]);
		expect(fake.data.has(`bubu:budget:${A}`) && fake.data.has(`bubu:items:${A}`)).toBe(true);
	});

	it('asks for a name and currency when the workbook has no BuBu details, and adds no starter Items', async () => {
		const { store, onCreated } = setup();
		await upload(await plainFile([['1', 'Venue', 1, null, 100, 100], ['1.1', 'Hall', 2, 'days', 30, 60]]));

		await expect.element(page.getByRole('dialog', { name: 'Name this Budget' })).toBeVisible();
		await page.getByRole('button', { name: 'Import Budget' }).click();
		await expect.element(page.getByText('Enter a name')).toBeVisible(); // not saved yet
		expect(onCreated).not.toHaveBeenCalled();
		expect(store.budgets).toHaveLength(2);

		await dialog().getByLabelText('Name').fill('Garden');
		await dialog().getByLabelText('Currency').selectOptions('GBP');
		await page.getByRole('button', { name: 'Import Budget' }).click();

		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		const created = onCreated.mock.calls[0][0] as Budget;
		expect(created).toMatchObject({ name: 'Garden', currency: 'GBP' });
		expect([A, B]).not.toContain(created.id); // a new identity
		expect(store.itemsOf(created.id).map((i) => i.description)).toEqual(['Venue', 'Hall']); // exactly the file's rows
		expect(store.itemsOf(created.id).every((i) => ![uuid(1), uuid(2)].includes(i.id))).toBe(true);
		expect(store.canUndo(created.id)).toBe(false);
	});

	it('imports a workbook from the empty template as an empty Budget', async () => {
		const { store, onCreated } = setup();
		await upload(asFile(await createTemplate(), 'template.xlsx'));
		await dialog().getByLabelText('Name').fill('Blank');
		await dialog().getByLabelText('Currency').selectOptions('EUR');
		await page.getByRole('button', { name: 'Import Budget' }).click();
		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		expect(store.itemsOf((onCreated.mock.calls[0][0] as Budget).id)).toEqual([]);
	});

	it('changes nothing when the name and currency dialog is cancelled', async () => {
		const { fake, store, onCreated } = setup();
		const before = snapshot(fake);
		const budgets = store.budgets;
		await upload(await plainFile([['1', 'Venue', 1, null, 100, 100]]));
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); // the dialog's, not the form's

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(snapshot(fake)).toBe(before);
		expect(store.budgets).toBe(budgets);
		expect(onCreated).not.toHaveBeenCalled();
	});
});

describe('a Budget that is already saved', () => {
	it('asks what to do instead of overwriting, and Cancel changes nothing', async () => {
		const { fake, store, onCreated } = setup();
		const before = snapshot(fake);
		const budgets = store.budgets;
		const items = store.itemsOf(A);
		await upload(await exportedFile());

		await expect.element(page.getByRole('dialog', { name: '“Wedding (old)” is already saved' })).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); // the dialog's, not the form's

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(snapshot(fake)).toBe(before);
		expect(store.budgets).toBe(budgets);
		expect(store.itemsOf(A)).toBe(items);
		expect(onCreated).not.toHaveBeenCalled();
	});

	it('imports a copy with fresh identities for the Budget and every Item, leaving the saved Budget alone', async () => {
		const { store, onCreated } = setup();
		const saved = store.budgets.find((b) => b.id === A);
		const savedItems = store.itemsOf(A);
		await upload(await exportedFile());
		await page.getByRole('button', { name: 'Import as copy' }).click();

		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		const copy = onCreated.mock.calls[0][0] as Budget;
		expect(copy.id).not.toBe(A);
		expect(copy.name).toBe('Wedding (copy)');
		const items = store.itemsOf(copy.id);
		expect(items.map((i) => i.description)).toEqual(['Venue', 'Hall', 'Discount']);
		expect(items.every((i) => i.budgetId === copy.id && ![uuid(1), uuid(2), uuid(3)].includes(i.id))).toBe(true);
		const own = new Set(items.map((i) => i.id));
		expect(items.every((i) => i.parentId === null || own.has(i.parentId))).toBe(true); // parent links remapped consistently
		expect(items.find((i) => i.description === 'Hall')!.parentId).toBe(items.find((i) => i.description === 'Venue')!.id);
		expect(store.budgets.find((b) => b.id === A)).toBe(saved); // the existing Budget is untouched
		expect(store.itemsOf(A)).toBe(savedItems);
	});

	it('asks again before replacing, and Back returns to the choice without changing anything', async () => {
		const { fake, store } = setup();
		const before = snapshot(fake);
		await upload(await exportedFile());
		await page.getByRole('button', { name: 'Replace…' }).click();

		await expect.element(page.getByRole('dialog', { name: 'Replace “Wedding (old)”?' })).toBeVisible();
		await expect.element(dialog()).toHaveTextContent('Undo cannot bring them back');
		await page.getByRole('button', { name: 'Back' }).click();
		await expect.element(page.getByRole('dialog', { name: '“Wedding (old)” is already saved' })).toBeVisible();
		expect(snapshot(fake)).toBe(before);
		expect(store.itemsOf(A).map((i) => i.description)).toEqual(['Old item']);
	});

	it('replaces on confirmation, keeping the imported identities, and drops only that Budget\'s history', async () => {
		const { fake, store, onCreated } = setup();
		store.editItem(A, uuid(9), 'description', 'edited old');
		store.editItem(B, uuid(20), 'description', 'edited paint');
		expect(store.canUndo(A) && store.canUndo(B)).toBe(true);
		const itemsB = store.itemsOf(B);
		await upload(await exportedFile());
		await page.getByRole('button', { name: 'Replace…' }).click();
		await page.getByRole('button', { name: 'Replace Budget' }).click();

		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		expect(onCreated.mock.calls[0][0]).toEqual(budgetA());
		expect(store.budgets.find((b) => b.id === A)).toEqual(budgetA());
		expect(store.itemsOf(A).map((i) => i.id)).toEqual([uuid(1), uuid(2), uuid(3)]); // the file's identities
		expect(JSON.parse(fake.data.get(`bubu:items:${A}`)!).data).toHaveLength(3);
		expect(store.canUndo(A)).toBe(false); // an earlier command cannot overwrite the imported document
		expect(store.undo(A)).toBe(false);
		expect(store.itemsOf(A).map((i) => i.id)).toEqual([uuid(1), uuid(2), uuid(3)]);
		expect(store.canUndo(B)).toBe(true); // another Budget keeps its history and Items
		expect(store.itemsOf(B)).toBe(itemsB);
		expect(store.budgets).toHaveLength(2);
	});
});

describe('files that cannot be imported', () => {
	it('lists the cell errors, changes nothing, and closes cleanly', async () => {
		const { fake, store, onCreated } = setup();
		const before = snapshot(fake);
		const budgets = store.budgets;
		await upload(await plainFile([['1', 'a', 'lots', null, 5, 5], ['1', 'b', 1, null, 'ten', 1], ['x', 'c', 1, null, 1, 1]]));

		const shown = page.getByRole('dialog', { name: 'This workbook cannot be imported' });
		await expect.element(shown).toBeVisible();
		await expect.element(shown).toHaveTextContent('Nothing was changed');
		await expect.element(shown).toHaveTextContent('Row 2 · Quantity (C2)');
		await expect.element(shown).toHaveTextContent('Row 3 · Unit price (E3)');
		await expect.element(shown).toHaveTextContent('Row 4 · Code (A4)');
		await page.getByRole('button', { name: 'Close' }).click();

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(snapshot(fake)).toBe(before);
		expect(store.budgets).toBe(budgets);
		expect(onCreated).not.toHaveBeenCalled();
	});

	it('says so when the file is not a workbook at all', async () => {
		const { fake, onCreated } = setup();
		const before = snapshot(fake);
		await upload(new File(['this is not a spreadsheet'], 'notes.xlsx'));
		await expect.element(dialog()).toHaveTextContent('could not be read as an Excel (.xlsx) workbook');
		expect(snapshot(fake)).toBe(before);
		expect(onCreated).not.toHaveBeenCalled();
	});

	it('shows a few errors and counts the rest', async () => {
		setup();
		const rows = Array.from({ length: 30 }, (_, i) => [String(i + 1), 'x', 'bad', null, 1, 1]);
		await upload(await plainFile(rows));
		await expect.element(dialog()).toHaveTextContent('and 10 more');
		expect(dialog().element().querySelectorAll('li')).toHaveLength(20);
	});

	it('lets the same file be chosen again after it was rejected', async () => {
		const { store } = setup();
		const file = await plainFile([['x', 'bad code', 1, null, 1, 1]]);
		await upload(file);
		await page.getByRole('button', { name: 'Close' }).click();
		await upload(file);
		await expect.element(page.getByRole('dialog', { name: 'This workbook cannot be imported' })).toBeVisible();
		expect(store.budgets).toHaveLength(2);
	});
});

describe('persistence failure', () => {
	it('saves no partial Budget when the browser cannot store the import, and says so', async () => {
		const { fake, store, onCreated } = setup({ seedA: false });
		const before = snapshot(fake);
		fake.failKeys = ['bubu:budget:']; // the Items get written, then the document fails
		await upload(await exportedFile());

		const shown = page.getByRole('dialog', { name: 'The Budget could not be imported' });
		await expect.element(shown).toBeVisible();
		await expect.element(shown).toHaveTextContent('Nothing was changed');
		fake.failKeys = [];
		expect(snapshot(fake)).toBe(before); // not even the Items are left behind
		expect(store.budgets.map((b) => b.id)).toEqual([B]);
		expect(onCreated).not.toHaveBeenCalled();
	});

	it('leaves a Budget exactly as it was when a replace cannot be saved', async () => {
		const { fake, store, onCreated } = setup();
		const itemsA = store.itemsOf(A);
		const before = snapshot(fake);
		await upload(await exportedFile());
		await page.getByRole('button', { name: 'Replace…' }).click();
		fake.failKeys = ['bubu:budget:'];
		await page.getByRole('button', { name: 'Replace Budget' }).click();

		await expect.element(page.getByRole('dialog', { name: 'The Budget could not be imported' })).toBeVisible();
		fake.failKeys = [];
		expect(snapshot(fake)).toBe(before);
		expect(store.itemsOf(A)).toBe(itemsA);
		expect(onCreated).not.toHaveBeenCalled();
	});
});

describe('after a successful import', () => {
	it('survives a reload: a new store reads the same Budget and Items from storage', async () => {
		const { storage, store, onCreated } = setup({ seedA: false });
		await upload(await exportedFile());
		await expect.poll(() => onCreated.mock.calls.length).toBe(1);

		const reloaded = new BudgetStore({ storage, history: new CommandHistory() });
		reloaded.hydrate();
		expect(reloaded.budgets.find((b) => b.id === A)).toEqual(store.budgets.find((b) => b.id === A));
		expect(reloaded.itemsOf(A)).toEqual(store.itemsOf(A));
		expect(reloaded.loadIssues).toEqual([]);
	});

	it('does not change the active Budget or add any history', async () => {
		const { store, onCreated } = setup({ seedA: false });
		store.select(B);
		await upload(await exportedFile());
		await expect.poll(() => onCreated.mock.calls.length).toBe(1);
		expect(store.activeBudgetId).toBe(B);
		expect(store.canUndo(A)).toBe(false);
		expect(store.canUndo(B)).toBe(false);
	});
});
