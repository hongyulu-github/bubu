import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { toString as decimalToString } from '../budget/numbers';
import { CommandHistory } from '../history/commands';
import { contrastRatio, resetTheme, setTheme, type Theme } from '../testing/theme';
import { BudgetStore } from '../state/budgets.svelte';
import BudgetEditorPage from './BudgetEditorPage.svelte';
import BudgetSpreadsheet from './BudgetSpreadsheet.svelte';

const BUDGET = '11111111-1111-4111-8111-111111111111';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

function item(n: number, parent: number | null, unitPrice: string, quantity = '1', sortIndex = n, extra: Partial<Item> = {}): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description: `Item ${n}`,
		unitPrice,
		quantity,
		...extra
	});
}

/** A store holding one open Budget with the given Items. */
function openStore(items: Item[], currency = 'EUR') {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate(); // empty storage: the store is ready, then the Budget is added in memory
	store.setBudget(createBudget({ id: BUDGET, name: 'Wedding', currency }), items);
	store.select(BUDGET);
	return store;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	localStorage.clear();
	resetTheme();
});

/** Every body row as an array of its six cell texts. */
const cellText = (cell: Element) => cell.querySelector('input')?.value ?? cell.textContent?.trim() ?? '';
const table = () =>
	[...document.querySelectorAll('table[aria-label="Budget Items"] tbody tr')].map((row) =>
		[...row.querySelectorAll('td')].slice(0, 6).map(cellText) // the six data columns; row actions come after
	);

// Outer (x2) = Inner (x3) of [10 x1, 5 x2] + Line 7.   Inner: unit 20, total 60.   Outer: unit 67, total 134.
const nested = () => [
	item(1, null, '0', '2'),
	item(2, 1, '0', '3'),
	item(3, 2, '10', '1'),
	item(4, 2, '5', '2'),
	item(5, 1, '7', '1')
];

describe('BudgetSpreadsheet', () => {
	it('has the columns Code, Description, Quantity, Unit, Unit price and Total in that order', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
		expect(headers).toEqual(['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
		await expect.element(page.getByRole('columnheader', { name: 'Total' })).toHaveAttribute('scope', 'col');
	});

	it('shows nested Quantity multipliers: each Group multiplies after summing its direct children', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		await expect.element(page.getByRole('grid', { name: 'Budget Items' })).toBeVisible();
		expect(table()).toEqual([
			['1', 'Item 1', '2', '', '€67.00', '€134.00'],
			['1.1', 'Item 2', '3', '', '€20.00', '€60.00'],
			['1.1.1', 'Item 3', '1', '', '€10.00', '€10.00'],
			['1.1.2', 'Item 4', '2', '', '€5.00', '€10.00'],
			['1.2', 'Item 5', '1', '', '€7.00', '€7.00']
		]);
	});

	it('shows negative Line prices rolling up into negative Group values', async () => {
		const items = [item(1, null, '0', '2'), item(2, 1, '100'), item(3, 1, '-250'), item(4, null, '40')];
		render(BudgetSpreadsheet, { rows: openStore(items).rows, currency: 'EUR' });
		expect(table()).toEqual([
			['1', 'Item 1', '2', '', '-€150.00', '-€300.00'],
			['1.1', 'Item 2', '1', '', '€100.00', '€100.00'],
			['1.2', 'Item 3', '1', '', '-€250.00', '-€250.00'],
			['2', 'Item 4', '1', '', '€40.00', '€40.00']
		]);
	});

	it('shows fractional quantities and precise amounts, rounding only for display', async () => {
		const items = [item(1, null, '19.99', '0.5'), item(2, null, '0.1'), item(3, null, '0.2')];
		const store = openStore(items);
		render(BudgetSpreadsheet, { rows: store.rows, currency: 'EUR' });
		// 0.5 x 19.99 is exactly 9.995, which shows as 10.00 in euros...
		expect(table().map((row) => row.slice(2).join('|'))).toEqual(['0.5||€19.99|€10.00', '1||€0.10|€0.10', '1||€0.20|€0.20']);
		// ...while the calculation behind it is untouched.
		expect(decimalToString(store.rows[0].amounts.total)).toBe('9.995');
		expect(store.itemsOf(BUDGET)[0].unitPrice).toBe('19.99');
	});

	it('shows the Unit when present and an empty cell otherwise', async () => {
		render(BudgetSpreadsheet, { rows: openStore([item(1, null, '5', '2', 1, { unit: 'hours' }), item(2, null, '5')]).rows, currency: 'EUR' });
		expect(table().map((row) => row[3])).toEqual(['hours', '']);
	});

	it('preserves derived sibling order and nesting, whatever the input order', async () => {
		const shuffled = [item(5, 1, '1', '1', 1), item(1, null, '0', '1', 1), item(3, null, '9', '1', 0), item(4, 1, '2', '1', 0)];
		render(BudgetSpreadsheet, { rows: openStore(shuffled).rows, currency: 'EUR' });
		expect(table().map((row) => `${row[0]} ${row[1]}`)).toEqual(['1 Item 3', '2 Item 1', '2.1 Item 4', '2.2 Item 5']);
		const kinds = [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-kind'));
		expect(kinds).toEqual(['line', 'group', 'line', 'line']);
	});

	it('renders arbitrarily deep nesting without a depth cap, with bounded indentation', async () => {
		const depth = 60;
		const items = Array.from({ length: depth }, (_, i) => item(i + 1, i === 0 ? null : i, '0', '1'));
		items.push(item(depth + 1, depth, '3'));
		render(BudgetSpreadsheet, { rows: openStore(items).rows, currency: 'EUR' });

		const rows = table();
		expect(rows).toHaveLength(depth + 1);
		expect(rows.at(-1)![0].split('.')).toHaveLength(depth + 1);
		expect(rows.at(-1)![5]).toBe('€3.00');

		const indent = (index: number) =>
			parseFloat(getComputedStyle(document.querySelectorAll('tbody tr')[index].querySelectorAll('td')[1]).paddingInlineStart);
		expect(indent(2)).toBeGreaterThan(indent(0));
		expect(indent(30)).toBe(indent(depth)); // growth stops at a fixed maximum
	});

	it('marks Code, Total and a Group Unit price read-only, with no input controls anywhere', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		const readOnly = (rowCode: string) =>
			[...document.querySelectorAll(`tr[data-code="${rowCode}"] td`)].map((cell) => cell.hasAttribute('data-readonly'));

		// Group row: Code, Unit price and Total read-only; Quantity, Unit, Description are the editable ones.
		expect(readOnly('1')).toEqual([true, false, false, false, true, true]);
		// Line row: only Code and Total are read-only; its Unit price is a real input.
		expect(readOnly('1.1.1')).toEqual([true, false, false, false, false, true]);

		expect(document.querySelectorAll('table input, table select, table textarea, table button, table [contenteditable]')).toHaveLength(0);
	});

	it.each<Theme>(['light', 'dark'])('tells read-only cells apart from editable ones and stays readable in %s', async (theme) => {
		setTheme(theme);
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		const cell = (rowCode: string, index: number) => document.querySelectorAll(`tr[data-code="${rowCode}"] td`)[index] as HTMLElement;

		const transparent = 'rgba(0, 0, 0, 0)';
		expect(getComputedStyle(cell('1.1.1', 0)).backgroundColor).not.toBe(transparent); // Code
		expect(getComputedStyle(cell('1.1.1', 5)).backgroundColor).not.toBe(transparent); // Total
		expect(getComputedStyle(cell('1', 4)).backgroundColor).not.toBe(transparent); // Group Unit price
		expect(getComputedStyle(cell('1.1.1', 4)).backgroundColor).toBe(transparent); // Line Unit price
		expect(getComputedStyle(cell('1.1.1', 1)).backgroundColor).toBe(transparent); // Description

		const total = getComputedStyle(cell('1.1.1', 5));
		expect(contrastRatio(total.color, total.backgroundColor)).toBeGreaterThanOrEqual(4.5);
		const code = cell('1.1.1', 0);
		const codeText = getComputedStyle(code.querySelector('span')!);
		expect(contrastRatio(codeText.color, getComputedStyle(code).backgroundColor)).toBeGreaterThanOrEqual(4.5);
	});

	it('distinguishes Group rows by weight', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		const weight = (code: string) =>
			parseInt(getComputedStyle(document.querySelectorAll(`tr[data-code="${code}"] td`)[1]).fontWeight);
		expect(weight('1')).toBeGreaterThan(weight('1.1.1'));
	});
});

describe('Budget root and grand total', () => {
	it('shows the name, currency and a zero grand total for an empty root Budget', async () => {
		const store = openStore([], 'DKK');
		render(BudgetEditorPage, { budgetId: BUDGET, store });

		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await expect.element(page.getByText('DKK', { exact: true })).toBeVisible();
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('DKK 0.00');
		expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
		await expect.element(page.getByRole('button', { name: 'New item', exact: true })).toBeVisible(); // the table is just its "New item" row
	});

	it('shows the grand total of the top-level Totals and the table', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore([...nested(), item(6, null, '1.5', '2')], 'USD') });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('$137.00'); // 134 + 1.5 x 2; decimals keep their scale until the currency formatter (LUL-56)
		expect(table()).toHaveLength(6);
	});

	it('shows a negative grand total when discounts exceed positives', async () => {
		const items = [item(1, null, '100'), item(2, null, '-350.25')];
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(items) });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('-€250.25');
	});

	it('updates the rows and grand total when the shared Items change', async () => {
		const store = openStore(nested());
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('€134.00');

		// Inner Group quantity 3 -> 4: inner 80, outer (80 + 7) x 2 = 174.
		store.execute(BUDGET, store.itemsOf(BUDGET).map((i) => (i.id === uuid(2) ? { ...i, quantity: '4' } : i)));
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('€174.00');
		expect(table()[1]).toEqual(['1.1', 'Item 2', '4', '', '€20.00', '€80.00']);

		store.undo(BUDGET);
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('€134.00');
	});
});

describe('inline editing', () => {
	function editor(items: Item[] = nested()) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const field = (column: string, code: string) => page.getByLabelText(`${column} ${code}`, { exact: true });
	const itemOf = (store: BudgetStore, n: number) => store.itemsOf(BUDGET).find((i) => i.id === uuid(n))!;
	const total = () => page.getByLabelText('Grand total');

	it('makes Description, Quantity and Unit editable on every row, and Unit price on Lines only', async () => {
		editor();
		for (const code of ['1', '1.1', '1.1.1']) {
			await expect.element(field('Description', code)).toBeVisible();
			await expect.element(field('Quantity', code)).toBeVisible();
			await expect.element(field('Unit', code)).toBeVisible();
		}
		await expect.element(field('Unit price', '1.1.1')).toBeVisible();
		await expect.element(field('Unit price', '1.2')).toBeVisible();
		expect(document.querySelector('[aria-label="Unit price 1"]')).toBeNull(); // Group
		expect(document.querySelector('[aria-label="Unit price 1.1"]')).toBeNull(); // nested Group
	});

	it('never puts an input in the Code, Total or Group Unit price cells', async () => {
		editor();
		for (const row of document.querySelectorAll('tbody tr')) {
			const cells = [...row.querySelectorAll('td')];
			expect(cells[0].querySelector('input, select, textarea, button'), 'Code').toBeNull();
			expect(cells[5].querySelector('input, select, textarea, button'), 'Total').toBeNull();
			if (row.getAttribute('data-kind') === 'group') {
				expect(cells[4].querySelector('input, select, textarea, button'), 'Group Unit price').toBeNull();
			}
		}
	});

	it('commits a Quantity on Enter, refreshing roll-ups at once, as one command', async () => {
		const store = editor();
		await field('Quantity', '1.1').fill('4');
		await userEvent.keyboard('{Enter}');

		await expect.element(total()).toHaveTextContent('€174.00');
		expect(itemOf(store, 2).quantity).toBe('4');
		expect(table()[1]).toEqual(['1.1', 'Item 2', '4', '', '€20.00', '€80.00']);
		store.undo(BUDGET);
		expect(store.canUndo(BUDGET)).toBe(false);
	});

	it('commits on blur as well', async () => {
		const store = editor();
		await field('Description', '1.1.1').fill('Renamed line');
		field('Description', '1.1.1').element().blur();
		await expect.poll(() => itemOf(store, 3).description).toBe('Renamed line');
		expect(store.canUndo(BUDGET)).toBe(true);
	});

	it('commits a fractional Quantity, a Unit and a negative Line price (discount) exactly', async () => {
		const store = editor();
		await field('Quantity', '1.1.2').fill('0.5');
		await userEvent.keyboard('{Enter}');
		await field('Unit', '1.1.2').fill('hours');
		await userEvent.keyboard('{Enter}');
		await field('Unit price', '1.2').fill('-250.25');
		await userEvent.keyboard('{Enter}');

		expect(itemOf(store, 4)).toMatchObject({ quantity: '0.5', unit: 'hours' });
		expect(itemOf(store, 5).unitPrice).toBe('-250.25');
		// inner: 10 + 5 x 0.5 = 12.5 -> x3 = 37.5; outer: (37.5 + -250.25) x 2 = -425.5
		await expect.element(total()).toHaveTextContent('-€425.50');
		expect(table()[4]).toEqual(['1.2', 'Item 5', '1', '', '-250.25', '-€250.25']); // the Line price is an input: exact, unformatted
	});

	it('shows validation for blank, non-numeric and negative-Quantity commits without changing data or history', async () => {
		const store = editor();
		const before = store.items;

		await field('Quantity', '1.1.1').fill('abc');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
		await expect.element(field('Quantity', '1.1.1')).toHaveAttribute('aria-invalid', 'true');

		await field('Unit price', '1.1.1').fill('');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Enter a number.')).toBeVisible();

		await field('Quantity', '1.1.2').fill('-1');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Quantity cannot be negative.')).toBeVisible();

		expect(store.items).toBe(before);
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(total()).toHaveTextContent('€134.00');
	});

	it('cancels an edit with Escape, restoring the committed value without touching data or history', async () => {
		const store = editor();
		const before = store.items;
		await field('Quantity', '1.1.1').fill('99');
		await userEvent.keyboard('{Escape}');

		await expect.element(field('Quantity', '1.1.1')).toHaveValue('1');
		expect(store.items).toBe(before);
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(total()).toHaveTextContent('€134.00');
	});

	it('clears an error when the edit is cancelled', async () => {
		editor();
		await field('Quantity', '1.1.1').fill('abc');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByText('Enter a valid number.')).not.toBeInTheDocument();
		await expect.element(field('Quantity', '1.1.1')).toHaveValue('1');
	});

	it('does not record a command when the value did not change', async () => {
		const store = editor();
		await field('Quantity', '1.1.1').fill('1');
		await userEvent.keyboard('{Enter}');
		expect(store.canUndo(BUDGET)).toBe(false);
	});

	it('undo restores the prior value in the inputs and a new commit clears redo', async () => {
		const store = editor();
		await field('Quantity', '1.1').fill('4');
		await userEvent.keyboard('{Enter}');
		await expect.element(total()).toHaveTextContent('€174.00');

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.element(field('Quantity', '1.1')).toHaveValue('3');
		await expect.element(total()).toHaveTextContent('€134.00');
		await expect.element(page.getByRole('button', { name: 'Redo' })).toBeEnabled();

		await field('Quantity', '1.1').fill('5');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
		expect(store.canRedo(BUDGET)).toBe(false);
	});

	it('keeps the Undo and Redo buttons in step with history', async () => {
		editor();
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
		await field('Unit', '1').fill('lot');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
	});
});

describe('adding Items', () => {
	function editor(items: Item[]) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const rowIds = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'));
	const codes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const grandTotal = () => page.getByLabelText('Grand total');

	it('adds the first Item to an empty Budget with the defaults and focuses its Description', async () => {
		editor([]);
		expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
		await expect.element(grandTotal()).toHaveTextContent('€0.00');

		await page.getByRole('button', { name: 'New item', exact: true }).click();

		await expect.element(page.getByRole('grid', { name: 'Budget Items' })).toBeVisible();
		expect(codes()).toEqual(['1']);
		expect(table()).toEqual([['1', '', '1', '', '0', '€0.00']]); // empty Description, Quantity 1, Unit price 0 (an input), Total 0
		await expect.element(page.getByLabelText('Description 1', { exact: true })).toHaveFocus();
		await expect.element(grandTotal()).toHaveTextContent('€0.00');
	});

	it('adds top-level Items one after another in insertion order', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'New item', exact: true }).click();
		await page.getByRole('button', { name: 'New item', exact: true }).click();
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2', '3']);
		await expect.element(grandTotal()).toHaveTextContent('€134.00');
	});

	it('adds a sibling directly below a nested row, with the Codes below it renumbered at once', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Add item below 1.1.1' }).click();

		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.2']);
		const kinds = [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-kind'));
		expect(kinds).toEqual(['group', 'group', 'line', 'line', 'line', 'line']);
		expect(table()[3]).toEqual(['1.1.2', '', '1', '', '0', '€0.00']); // the new Item
		expect(table()[4][1]).toBe('Item 4'); // the old 1.1.2 moved down to 1.1.3
		await expect.element(grandTotal()).toHaveTextContent('€134.00');
		await expect.element(page.getByLabelText('Description 1.1.2', { exact: true })).toHaveFocus();
	});

	it('adds beside a Group at the Group level, not inside it', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Add item below 1', exact: true }).click();
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
		const kinds = [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-kind'));
		expect(kinds[0]).toBe('group');
		expect(kinds[5]).toBe('line');
	});

	it('is one undoable command: undo removes the Item, redo restores the same identities and order', async () => {
		editor(nested());
		const before = rowIds();

		await page.getByRole('button', { name: 'Add item below 1.1.1' }).click();
		const afterAdd = rowIds();
		expect(afterAdd).toHaveLength(before.length + 1);

		await page.getByRole('button', { name: 'Undo' }).click();
		expect(rowIds()).toEqual(before);
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // a single command

		await page.getByRole('button', { name: 'Redo' }).click();
		expect(rowIds()).toEqual(afterAdd); // same UUIDs, same order
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.2']);
	});

	it('keeps existing rows and their values intact', async () => {
		editor(nested());
		const before = table();
		await page.getByRole('button', { name: 'Add item below 1.2' }).click();
		const after = table();
		expect(after.filter((row) => row[0] !== '1.3')).toEqual(before);
		expect(after.at(-1)).toEqual(['1.3', '', '1', '', '0', '€0.00']);
	});

	it('shows a row action only for editable tables, with an accessible name per row', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		expect(document.querySelector('tbody button')).toBeNull(); // read-only table: no controls
		expect([...document.querySelectorAll('thead th')]).toHaveLength(6);
	});

	it('adds a labelled Actions column when editable', async () => {
		editor(nested());
		const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
		expect(headers).toEqual(['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total', 'Actions']);
		expect(document.querySelectorAll('tbody button')).toHaveLength(17); // Add below, Add child and Delete on each of the 5 rows, plus a toggle on each of the 2 Groups
	});
});

describe('deleting Items', () => {
	function editor(items: Item[]) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const rowIds = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'));
	const codes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const grandTotal = () => page.getByLabelText('Grand total');
	const dialog = (name: string | RegExp) => page.getByRole('dialog', { name });

	it('deletes a Line straight away (no confirmation), with Codes and totals refreshed', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Delete 1.2', exact: true }).click(); // the 7 Line
		expect(document.querySelector('dialog[open]')).toBeNull();
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2']);
		await expect.element(grandTotal()).toHaveTextContent('€120.00');
	});

	it('asks before deleting a Group, naming what goes with it', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();

		await expect.element(dialog('Delete “Item 2”?')).toBeVisible();
		await expect.element(dialog('Delete “Item 2”?')).toHaveAccessibleDescription(
			'This removes the group and 2 items inside it. You can undo this.'
		);
		const listed = [...document.querySelectorAll('dialog ul.impact li')].map((li) => li.textContent?.trim());
		expect(listed).toEqual(['Item 3', 'Item 4']);
		expect(rowIds()).toHaveLength(5); // nothing deleted yet
	});

	it('changes nothing when cancelled, by button or Escape', async () => {
		const store = editor(nested());
		const before = rowIds();
		const items = store.items;

		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(dialog('Delete “Item 2”?')).not.toBeInTheDocument();
		expect(rowIds()).toEqual(before);
		expect(store.items).toBe(items);
		expect(store.canUndo(BUDGET)).toBe(false);

		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog('Delete “Item 1”?')).not.toBeInTheDocument();
		expect(store.items).toBe(items);
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(grandTotal()).toHaveTextContent('€134.00');
	});

	it('on confirmation removes the whole subtree, leaving no orphans, and refreshes Codes and totals', async () => {
		const store = editor(nested());
		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
		await dialog('Delete “Item 2”?').getByRole('button', { name: 'Delete' }).click();

		await expect.element(dialog('Delete “Item 2”?')).not.toBeInTheDocument();
		expect(codes()).toEqual(['1', '1.1']);
		expect(store.itemsOf(BUDGET).map((i) => i.id)).toEqual([uuid(1), uuid(5)]);
		await expect.element(grandTotal()).toHaveTextContent('€14.00');
		expect(store.tree.unreachableIds).toEqual([]);
	});

	it('normalizes a parent that loses its last child: it becomes a Line and its stored price resets to 0', async () => {
		const store = editor([item(1, null, '999', '2'), item(2, 1, '10')]);
		await expect.element(grandTotal()).toHaveTextContent('€20.00');
		expect(document.querySelector('[aria-label="Unit price 1"]')).toBeNull(); // a Group: calculated

		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();

		expect(codes()).toEqual(['1']);
		await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue('0'); // now an editable Line
		await expect.element(page.getByLabelText('Quantity 1', { exact: true })).toHaveValue('2'); // quantity kept
		await expect.element(grandTotal()).toHaveTextContent('€0.00');
		expect(store.itemsOf(BUDGET)[0].unitPrice).toBe('0');
	});

	it('warns in the confirmation when the parent will become a Line', async () => {
		editor([item(1, null, '5'), item(2, 1, '0'), item(3, 2, '1')]); // 1 > 2 > 3
		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
		await expect.element(
			page.getByText('“Item 1” has no other items, so it becomes a Line and its Unit price resets to 0.')
		).toBeVisible();
	});

	it('does not show that warning when the parent keeps other children', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click(); // Outer also has 1.2
		expect(document.querySelector('dialog .note')).toBeNull();
	});

	it('undo restores all UUIDs, hierarchy, order and parent pricing; redo removes the same subtree as one command', async () => {
		const store = editor([item(1, null, '999', '2'), item(2, 1, '0', '3'), item(3, 2, '10'), item(4, 2, '5', '2')]);
		const before = rowIds();
		const original = store.itemsOf(BUDGET);

		await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
		await dialog('Delete “Item 2”?').getByRole('button', { name: 'Delete' }).click();
		const after = rowIds();
		expect(after).toEqual([uuid(1)]);
		await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue('0');

		await page.getByRole('button', { name: 'Undo' }).click();
		expect(rowIds()).toEqual(before);
		expect(store.itemsOf(BUDGET)).toEqual(original);
		expect(store.itemsOf(BUDGET)[0].unitPrice).toBe('999'); // original parent pricing is back
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // a single command

		await page.getByRole('button', { name: 'Redo' }).click();
		expect(rowIds()).toEqual(after);
		await expect.element(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
	});

	it('puts focus somewhere stable after a deletion', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Delete 1.2', exact: true }).click();
		await expect.element(page.getByRole('button', { name: 'New item', exact: true })).toHaveFocus();
	});

	it('uses the singular for a Group with one item inside', async () => {
		editor([item(1, null, '0'), item(2, 1, '1')]);
		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await expect.element(dialog('Delete “Item 1”?')).toHaveAccessibleDescription(
			'This removes the group and 1 item inside it. You can undo this.'
		);
	});

	it('truncates a long impact list but still states the count', async () => {
		const items = [item(1, null, '0'), ...Array.from({ length: 8 }, (_, i) => item(i + 2, 1, '1'))];
		editor(items);
		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await expect.element(dialog('Delete “Item 1”?')).toHaveAccessibleDescription(
			'This removes the group and 8 items inside it. You can undo this.'
		);
		const listed = [...document.querySelectorAll('dialog ul.impact li')].map((li) => li.textContent?.trim());
		expect(listed).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6', 'and 3 more']);
	});

	it('shows no Delete action in a read-only table', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows, currency: 'EUR' });
		expect(document.querySelector('tbody button')).toBeNull();
	});
});

describe('adding children', () => {
	function editor(items: Item[]) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const rowIds = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'));
	const codes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const kinds = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-kind'));
	const grandTotal = () => page.getByLabelText('Grand total');
	const dialog = () => page.getByRole('dialog', { name: /into a group\?/ });
	const addChild = (code: string) => page.getByRole('button', { name: `Add child to ${code}`, exact: true });

	// A Line with a manual price and a Quantity above 1, then a plain Line.
	const lines = () => [item(1, null, '-250.5', '3'), item(2, null, '7')];

	it('warns before converting a Line, naming the manual price that will be replaced and the Quantity that is kept', async () => {
		editor(lines());
		await addChild('1').click();

		await expect.element(dialog()).toBeVisible();
		await expect.element(page.getByRole('dialog').getByText('-250.5', { exact: true })).toBeVisible();
		await expect.element(page.getByText('is replaced by the total of its items')).toBeVisible();
		await expect.element(page.getByText('3 is kept')).toBeVisible();
		expect(rowIds()).toHaveLength(2); // nothing added yet
	});

	it('makes no command and no change when the conversion is cancelled', async () => {
		const store = editor(lines());
		const items = store.items;
		await addChild('1').click();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(store.items).toBe(items);
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue('-250.5'); // still a Line

		await addChild('1').click();
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();
		expect(store.items).toBe(items);
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(grandTotal()).toHaveTextContent('-€744.50');
	});

	it('on confirmation converts the Line to a Group with the child, keeping Quantity', async () => {
		const store = editor(lines());
		await addChild('1').click();
		await page.getByRole('button', { name: 'Convert and add item' }).click();

		expect(codes()).toEqual(['1', '1.1', '2']);
		expect(kinds()).toEqual(['group', 'line', 'line']);
		expect(document.querySelector('[aria-label="Unit price 1"]')).toBeNull(); // now calculated
		await expect.element(page.getByLabelText('Quantity 1', { exact: true })).toHaveValue('3'); // not reset to 1
		await expect.element(page.getByLabelText('Description 1.1', { exact: true })).toHaveFocus();
		expect(table()[1]).toEqual(['1.1', '', '1', '', '0', '€0.00']); // child defaults
		await expect.element(grandTotal()).toHaveTextContent('€7.00'); // the group is now priced from its (empty) child
		expect(store.itemsOf(BUDGET).find((i) => i.id === uuid(1))!.unitPrice).toBe('0');
	});

	it('handles a positive manual price too', async () => {
		editor([item(1, null, '4500.50', '2')]);
		await addChild('1').click();
		await expect.element(page.getByRole('dialog').getByText('4500.50', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		expect(kinds()).toEqual(['group', 'line']);
		await expect.element(page.getByLabelText('Quantity 1', { exact: true })).toHaveValue('2');
	});

	it('undo restores the whole conversion in one step and redo reapplies it with the same identities', async () => {
		const store = editor(lines());
		const before = rowIds();
		await addChild('1').click();
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		const after = rowIds();
		expect(after).toHaveLength(3);

		await page.getByRole('button', { name: 'Undo' }).click();
		expect(rowIds()).toEqual(before);
		await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue('-250.5'); // manual price back
		await expect.element(page.getByLabelText('Quantity 1', { exact: true })).toHaveValue('3');
		await expect.element(grandTotal()).toHaveTextContent('-€744.50');
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // a single command

		await page.getByRole('button', { name: 'Redo' }).click();
		expect(rowIds()).toEqual(after);
		expect(kinds()).toEqual(['group', 'line', 'line']);
		expect(store.itemsOf(BUDGET).find((i) => i.id === uuid(1))!.unitPrice).toBe('0');
	});

	it('adds a child to an existing Group straight away, with no conversion warning', async () => {
		editor(nested());
		await addChild('1.1').click(); // an existing Group
		expect(document.querySelector('dialog[open]')).toBeNull();
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.2']);
		await expect.element(page.getByLabelText('Description 1.1.3', { exact: true })).toHaveFocus();
		await expect.element(grandTotal()).toHaveTextContent('€134.00');
	});

	it('adds children at any nesting depth', async () => {
		editor([item(1, null, '0'), item(2, 1, '0'), item(3, 2, '40', '2')]);
		await addChild('1.1.1').click(); // a Line three levels down
		await page.getByRole('button', { name: 'Convert and add item' }).click();
		expect(codes()).toEqual(['1', '1.1', '1.1.1', '1.1.1.1']);
		expect(kinds()).toEqual(['group', 'group', 'group', 'line']);
	});

	it('offers Add child on every row, with an accessible name per row', async () => {
		editor(nested());
		expect(document.querySelectorAll('tbody button[aria-label^="Add child to"]')).toHaveLength(5);
	});
});

describe('money display in the Budget currency', () => {
	// A Group of 2 containing a Line 1234.5 and a discount of -34.25: Group unit price 1200.25, total 2400.5.
	const priced = () => [item(1, null, '0', '2'), item(2, 1, '1234.5'), item(3, 1, '-34.25')];

	const totalCell = (code: string) => document.querySelectorAll(`tr[data-code="${code}"] td`)[5]?.textContent?.trim();
	const priceCell = (code: string) => document.querySelectorAll(`tr[data-code="${code}"] td`)[4]?.textContent?.trim();

	it('shows Line prices, Group prices, Totals and the grand total in the Budget currency', async () => {
		const store = openStore(priced(), 'USD');
		render(BudgetSpreadsheet, { rows: store.rows, currency: 'USD' });
		expect(priceCell('1')).toBe('$1,200.25'); // Group unit price (calculated)
		expect(totalCell('1')).toBe('$2,400.50'); // Group total
		expect(priceCell('1.1')).toBe('$1,234.50'); // Line unit price (read-only table)
		expect(totalCell('1.1')).toBe('$1,234.50');
		expect(priceCell('1.2')).toBe('-$34.25'); // negative Line price
		expect(totalCell('1.2')).toBe('-$34.25');
	});

	it('shows the grand total in the Budget currency, including when it is zero or negative', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(priced(), 'USD') });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('$2,400.50');
	});

	it('uses the currency decimal places: none for yen, three for dinars', async () => {
		const yen = openStore([item(1, null, '1234.5', '3')], 'JPY');
		render(BudgetSpreadsheet, { rows: yen.rows, currency: 'JPY' });
		expect(priceCell('1')).toBe('¥1,235'); // 1234.5 rounded for display only
		expect(totalCell('1')).toBe('¥3,704'); // 3 x 1234.5 = 3703.5, shown rounded; not 3 x 1235
		expect(decimalToString(yen.rows[0].amounts.total)).toBe('3703.5'); // the calculation keeps the exact value
	});

	it('shows three decimals for a three-digit currency', async () => {
		const store = openStore([item(1, null, '12.3456', '2')], 'KWD');
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('KWD 24.691'); // 24.6912
		expect(totalCell('1')?.replace(/\s/g, ' ')).toBe('KWD 24.691');
	});

	it('renders zero as a plain zero amount', async () => {
		const store = openStore([item(1, null, '0'), item(2, null, '0', '0')], 'EUR');
		render(BudgetSpreadsheet, { rows: store.rows, currency: 'EUR' });
		expect(totalCell('1')).toBe('€0.00');
		expect(totalCell('2')).toBe('€0.00');
	});

	it('does not print a negative zero for a total that rounds to nothing', async () => {
		const store = openStore([item(1, null, '-0.001')], 'USD');
		render(BudgetSpreadsheet, { rows: store.rows, currency: 'USD' });
		expect(totalCell('1')).toBe('$0.00');
	});

	it('shows the same amount identically in the Line, the Group above it and the grand total', async () => {
		const store = openStore([item(1, null, '0'), item(2, 1, '1234.5')], 'EUR');
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		const shown = '€1,234.50';
		expect(totalCell('1.1')).toBe(shown);
		expect(priceCell('1')).toBe(shown);
		expect(totalCell('1')).toBe(shown);
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent(shown);
	});

	it('leaves the exact value in editable inputs, unformatted and unrounded', async () => {
		const precise = '0.1000000000000000055511151231257827';
		const store = openStore([item(1, null, precise, '2.50'), item(2, null, '-1234.567')], 'USD');
		render(BudgetEditorPage, { budgetId: BUDGET, store });

		await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue(precise);
		await expect.element(page.getByLabelText('Unit price 2', { exact: true })).toHaveValue('-1234.567');
		await expect.element(page.getByLabelText('Quantity 1', { exact: true })).toHaveValue('2.50');
		expect(totalCell('2')).toBe('-$1,234.57'); // read-only Total is formatted
	});

	it('never changes stored values by displaying them: they are the same after rendering and editing elsewhere', async () => {
		const store = openStore([item(1, null, '19.99', '0.5'), item(2, null, '3')], 'USD');
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		expect(totalCell('1')).toBe('$10.00'); // 9.995 shown rounded
		await page.getByLabelText('Unit price 2', { exact: true }).fill('4');
		await userEvent.keyboard('{Enter}');

		const stored = store.itemsOf(BUDGET);
		expect(stored[0]).toMatchObject({ unitPrice: '19.99', quantity: '0.5' }); // untouched by display
		expect(stored[1].unitPrice).toBe('4');
		expect(decimalToString(store.rows[0].amounts.total)).toBe('9.995'); // the roll-up is still exact
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('$14.00'); // 9.995 + 4 = 13.995 exactly, shown rounded half up
	});

	it('formats Group prices as read-only cells and gives them no input', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(priced(), 'USD') });
		const cell = document.querySelectorAll('tr[data-code="1"] td')[4];
		expect(cell.hasAttribute('data-readonly')).toBe(true);
		expect(cell.querySelector('input, select, textarea, button')).toBeNull();
		expect(cell.textContent?.trim()).toBe('$1,200.25');
	});
});

describe('collapsing groups', () => {
	/**
	 * 1 Item 1 (group, x2)
	 *   1.1 Item 2 (group, x3)
	 *     1.1.1 Item 3  10
	 *     1.1.2 Item 4  5 x2
	 *   1.2 Item 5  7
	 * 2 Item 6  100      (grand total: 2 x (3 x 20 + 7) + 100 = 234)
	 */
	const tree = () => [...nested(), item(6, null, '100')];

	function editor(items: Item[] = tree()) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const shownCodes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const toggle = (code: string) => page.getByRole('button', { name: new RegExp(`^(Collapse|Expand) ${code.replaceAll('.', '\\.')}$`) });
	const grandTotal = () => page.getByLabelText('Grand total');

	it('puts a toggle on every Group and none on Lines, starting expanded', async () => {
		editor();
		for (const code of ['1', '1.1']) {
			await expect.element(page.getByRole('button', { name: `Collapse ${code}`, exact: true })).toHaveAttribute('aria-expanded', 'true');
		}
		expect(document.querySelectorAll('button.toggle')).toHaveLength(2);
		expect(document.querySelector('[aria-label="Collapse 1.1.1"]')).toBeNull(); // a Line
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
	});

	it('collapses and expands a nested Group, hiding just its descendants', async () => {
		editor();
		await page.getByRole('button', { name: 'Collapse 1.1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.2', '2']);
		await expect.element(page.getByRole('button', { name: 'Expand 1.1', exact: true })).toHaveAttribute('aria-expanded', 'false');

		await page.getByRole('button', { name: 'Expand 1.1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
	});

	it('hides everything below a collapsed top-level Group, and remembers an inner collapsed Group on expand', async () => {
		editor();
		await page.getByRole('button', { name: 'Collapse 1.1', exact: true }).click();
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '2']);

		await page.getByRole('button', { name: 'Expand 1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.2', '2']); // 1.1 is still collapsed

		await page.getByRole('button', { name: 'Expand 1.1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
	});

	it('collapses all Groups at every depth, and expands them all again', async () => {
		editor();
		await page.getByRole('button', { name: 'Collapse all' }).click();
		expect(shownCodes()).toEqual(['1', '2']);
		await expect.element(page.getByRole('button', { name: 'Expand 1', exact: true })).toBeVisible();

		await page.getByRole('button', { name: 'Expand all' }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
		await expect.element(page.getByRole('button', { name: 'Collapse 1.1', exact: true })).toBeVisible();
	});

	it('disables the all-Group actions when they would do nothing, and shows none without Groups', async () => {
		editor();
		await expect.element(page.getByRole('button', { name: 'Expand all' })).toBeDisabled(); // nothing collapsed
		await expect.element(page.getByRole('button', { name: 'Collapse all' })).toBeEnabled();
		await page.getByRole('button', { name: 'Collapse all' }).click();
		await expect.element(page.getByRole('button', { name: 'Collapse all' })).toBeDisabled(); // all collapsed
		await expect.element(page.getByRole('button', { name: 'Expand all' })).toBeEnabled();
	});

	it('offers no collapse controls when the Budget has no Groups', async () => {
		editor([item(1, null, '5'), item(2, null, '6')]);
		expect(document.querySelector('[aria-label="Groups"]')).toBeNull();
		expect(document.querySelectorAll('button.toggle')).toHaveLength(0);
	});

	it('still counts hidden Items in every total, and keeps the Codes of what stays visible', async () => {
		editor();
		await expect.element(grandTotal()).toHaveTextContent('€234.00');
		const before = table();

		await page.getByRole('button', { name: 'Collapse all' }).click();

		await expect.element(grandTotal()).toHaveTextContent('€234.00'); // unchanged
		expect(table()).toEqual([before[0], before[5]]); // the same Total for Group 1, the same Codes
		expect(table()[0][5]).toBe('€134.00'); // Group 1's Total still includes its hidden descendants
		expect(shownCodes()).toEqual(['1', '2']); // not renumbered
	});

	it('leaves the flat Items, history and storage alone', async () => {
		const store = editor();
		const items = store.items;
		const setItem = vi.spyOn(Storage.prototype, 'setItem');

		await page.getByRole('button', { name: 'Collapse 1.1', exact: true }).click();
		await page.getByRole('button', { name: 'Collapse all' }).click();
		await page.getByRole('button', { name: 'Expand all' }).click();

		expect(store.items).toBe(items); // the very same array
		expect(store.canUndo(BUDGET)).toBe(false); // no undo entry
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
		expect(setItem).not.toHaveBeenCalled(); // nothing written
	});

	it('does not disturb existing undo history', async () => {
		const store = editor();
		await page.getByLabelText('Quantity 2', { exact: true }).fill('3'); // an Item edit: one command
		await userEvent.keyboard('{Enter}');
		expect(store.canUndo(BUDGET)).toBe(true);

		await page.getByRole('button', { name: 'Collapse all' }).click();
		await page.getByRole('button', { name: 'Expand all' }).click();

		expect(store.canUndo(BUDGET)).toBe(true);
		store.undo(BUDGET);
		expect(store.canUndo(BUDGET)).toBe(false); // exactly one command, as before
	});

	it('keeps totals live while Items are hidden: an edit, then undo, updates them', async () => {
		const store = editor();
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '2']);

		store.editItem(BUDGET, uuid(3), 'unitPrice', '20'); // a hidden Line: Item 3 10 -> 20
		await expect.element(grandTotal()).toHaveTextContent('€294.00'); // 2 x (3 x 30 + 7) + 100
		store.undo(BUDGET);
		await expect.element(grandTotal()).toHaveTextContent('€234.00');
		expect(shownCodes()).toEqual(['1', '2']); // still collapsed
	});

	it('is not remembered: a fresh editor starts fully expanded', async () => {
		const store = openStore(tree());
		const first = render(BudgetEditorPage, { budgetId: BUDGET, store });
		await page.getByRole('button', { name: 'Collapse all' }).click();
		expect(shownCodes()).toEqual(['1', '2']);
		first.unmount();

		render(BudgetEditorPage, { budgetId: BUDGET, store });
		await expect.element(page.getByRole('button', { name: 'Collapse 1', exact: true })).toBeVisible();
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
	});

	it('opens a collapsed Group when a child is added to it, so the new row is visible and focused', async () => {
		const store = editor();
		await page.getByRole('button', { name: 'Collapse 1.1', exact: true }).click();
		expect(shownCodes()).toEqual(['1', '1.1', '1.2', '2']);

		await page.getByRole('button', { name: 'Add child to 1.1', exact: true }).click();

		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.1.3', '1.2', '2']);
		await expect.element(page.getByLabelText('Description 1.1.3', { exact: true })).toHaveFocus();
		expect(store.itemsOf(BUDGET)).toHaveLength(7);
	});

	it('can still delete a collapsed Group, with the confirmation naming everything hidden inside it', async () => {
		editor();
		await page.getByRole('button', { name: 'Collapse 1', exact: true }).click();
		await page.getByRole('button', { name: 'Delete 1', exact: true }).click();
		await expect.element(page.getByRole('dialog', { name: 'Delete “Item 1”?' })).toHaveAccessibleDescription(
			'This removes the group and 4 items inside it. You can undo this.'
		);
	});

	it('works from the keyboard like any button', async () => {
		editor();
		page.getByRole('button', { name: 'Collapse 1.1', exact: true }).element().focus();
		await userEvent.keyboard('{Enter}');
		expect(shownCodes()).toEqual(['1', '1.1', '1.2', '2']);
		await userEvent.keyboard(' ');
		expect(shownCodes()).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2']);
	});

	it('shows no toggles in a read-only table', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR' });
		expect(document.querySelectorAll('button.toggle')).toHaveLength(0);
	});
});

describe('keyboard navigation and editing', () => {
	/**
	 * 1 Item 1 (group, x2)            1.1 Item 2 (group, x3)
	 *   1.1.1 Item 3 line 10            1.1.2 Item 4 line 5 x2
	 *   1.2 Item 5 line 7
	 * 2 Item 6 line 100
	 */
	const tree = () => [...nested(), item(6, null, '100')];

	function editor(items: Item[] = tree()) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const cellEl = (code: string, column: string) =>
		document.querySelector<HTMLElement>(`tr[data-code="${code}"] td[data-cell$="|${column}"]`)!;
	/** Where focus is, as "code:column:mode" (mode is nav on a cell, edit inside its input), or null. */
	const where = () => {
		const el = document.activeElement as HTMLElement | null;
		const td = el?.closest<HTMLElement>('[data-cell]');
		if (!el || !td) return null;
		return `${td.closest('tr')!.dataset.code}:${td.dataset.cell!.split('|')[1]}:${el.tagName === 'INPUT' ? 'edit' : 'nav'}`;
	};
	const press = (keys: string) => userEvent.keyboard(keys);
	const focus = (code: string, column: string) => cellEl(code, column).focus();
	const itemOf = (store: BudgetStore, n: number) => store.itemsOf(BUDGET).find((i) => i.id === uuid(n))!;

	describe('the grid as one tab stop', () => {
		it('has a single cell in the Tab order, and keeps the inputs out of it', async () => {
			editor();
			const stops = [...document.querySelectorAll('tbody td[data-cell]')].filter((td) => td.getAttribute('tabindex') === '0');
			expect(stops).toHaveLength(1);
			expect(stops[0]).toBe(cellEl('1', 'description')); // the first Description until a cell is active
			expect([...document.querySelectorAll('tbody input')].every((input) => input.getAttribute('tabindex') === '-1')).toBe(true);
		});

		it('moves the tab stop to the active cell', async () => {
			editor();
			focus('1.2', 'quantity');
			await expect.poll(() => cellEl('1.2', 'quantity').getAttribute('tabindex')).toBe('0');
			expect(cellEl('1', 'description').getAttribute('tabindex')).toBe('-1');
		});
	});

	describe('arrow keys (not editing)', () => {
		it('move between cells, including the read-only ones', async () => {
			editor();
			focus('1.1.1', 'description');
			await press('{ArrowRight}');
			expect(where()).toBe('1.1.1:quantity:nav');
			await press('{ArrowRight}{ArrowRight}');
			expect(where()).toBe('1.1.1:unitPrice:nav');
			await press('{ArrowRight}');
			expect(where()).toBe('1.1.1:total:nav'); // read-only, but navigable
			await press('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}');
			expect(where()).toBe('1.1.1:code:nav');
		});

		it('move up and down through the rows, keeping the column', async () => {
			editor();
			focus('1', 'quantity');
			await press('{ArrowDown}');
			expect(where()).toBe('1.1:quantity:nav');
			await press('{ArrowDown}{ArrowDown}{ArrowDown}');
			expect(where()).toBe('1.2:quantity:nav');
			await press('{ArrowDown}');
			expect(where()).toBe('2:quantity:nav');
			await press('{ArrowUp}');
			expect(where()).toBe('1.2:quantity:nav');
		});

		it('stop at the edges instead of wrapping', async () => {
			editor();
			focus('1', 'code');
			await press('{ArrowUp}{ArrowLeft}');
			expect(where()).toBe('1:code:nav');
			focus('2', 'total');
			await press('{ArrowDown}{ArrowRight}');
			expect(where()).toBe('2:total:nav');
		});

		it('do not edit anything and do not scroll the page', async () => {
			const store = editor();
			const before = store.items;
			focus('1.1.1', 'quantity');
			const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
			cellEl('1.1.1', 'quantity').dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true); // the page does not scroll
			expect(store.items).toBe(before);
			expect(store.canUndo(BUDGET)).toBe(false);
		});

		it('are ignored with a modifier key held', async () => {
			editor();
			focus('1.1.1', 'quantity');
			await press('{Control>}{ArrowDown}{/Control}');
			expect(where()).toBe('1.1.1:quantity:nav');
		});
	});

	describe('Enter and F2 begin editing', () => {
		it('Enter on an editable cell focuses its input with the text selected', async () => {
			editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			expect(where()).toBe('1.1.1:quantity:edit');
			const input = document.activeElement as HTMLInputElement;
			expect(input.selectionStart).toBe(0);
			expect(input.selectionEnd).toBe(input.value.length);
		});

		it('F2 does the same', async () => {
			editor();
			focus('1.1.1', 'description');
			await press('{F2}');
			expect(where()).toBe('1.1.1:description:edit');
		});

		it('works on every editable cell: Description, Quantity, Unit, and a Line Unit price', async () => {
			editor();
			for (const column of ['description', 'quantity', 'unit', 'unitPrice']) {
				focus('1.2', column);
				await press('{Enter}');
				expect(where(), column).toBe(`1.2:${column}:edit`);
				await press('{Escape}');
			}
		});

		it('never starts editing a read-only cell', async () => {
			editor();
			const readOnly: [string, string][] = [
				['1.1.1', 'code'],
				['1.1.1', 'total'],
				['1', 'unitPrice'], // a Group's Unit price is calculated
				['1.1', 'unitPrice'],
				['1', 'total']
			];
			for (const [code, column] of readOnly) {
				focus(code, column);
				await press('{Enter}');
				expect(where(), `${code} ${column} Enter`).toBe(`${code}:${column}:nav`);
				await press('{F2}');
				expect(where(), `${code} ${column} F2`).toBe(`${code}:${column}:nav`);
				expect(cellEl(code, column).querySelector('input')).toBeNull();
			}
		});
	});

	describe('typing in an input is editing, not navigation', () => {
		it('arrow keys move the caret and leave focus in the input', async () => {
			editor();
			focus('1.1.1', 'description');
			await press('{Enter}');
			await userEvent.keyboard('hello');
			const input = document.activeElement as HTMLInputElement;
			expect(input.value).toBe('hello');
			await press('{ArrowLeft}{ArrowLeft}');
			expect(where()).toBe('1.1.1:description:edit');
			expect(input.selectionStart).toBe(3);
			await press('{ArrowUp}{ArrowDown}{ArrowRight}');
			expect(where()).toBe('1.1.1:description:edit');
			expect(input.value).toBe('hello');
		});

		it('every printable key just types', async () => {
			editor();
			focus('1.1.1', 'unit');
			await press('{Enter}');
			await userEvent.keyboard('kg/m2 {Home}x');
			expect((document.activeElement as HTMLInputElement).value).toBe('xkg/m2 ');
			expect(where()).toBe('1.1.1:unit:edit');
		});
	});

	describe('Enter while editing', () => {
		it('commits and moves down to the cell below, ready to navigate', async () => {
			const store = editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('4{Enter}');
			expect(itemOf(store, 3).quantity).toBe('4');
			expect(where()).toBe('1.1.2:quantity:nav');
			expect(store.canUndo(BUDGET)).toBe(true);
		});

		it('keeps going down column by column, and stays on the last row', async () => {
			const store = editor();
			focus('1.2', 'unit');
			await press('{Enter}');
			await userEvent.keyboard('a{Enter}');
			expect(where()).toBe('2:unit:nav');
			await press('{Enter}');
			await userEvent.keyboard('b{Enter}');
			expect(where()).toBe('2:unit:nav'); // the last row: nowhere further down
			expect(itemOf(store, 5).unit).toBe('a');
			expect(itemOf(store, 6).unit).toBe('b');
		});

		it('commits nothing and records nothing when the value is unchanged, but still moves', async () => {
			const store = editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}{Enter}');
			expect(where()).toBe('1.1.2:quantity:nav');
			expect(store.canUndo(BUDGET)).toBe(false);
		});

		it('refreshes the roll-ups at once', async () => {
			editor();
			focus('1.1.1', 'unitPrice');
			await press('{Enter}');
			await userEvent.keyboard('20{Enter}');
			await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('€294.00'); // 2 x (3 x 30 + 7) + 100
		});
	});

	describe('Escape while editing', () => {
		it('cancels the edit, restoring the committed value, and returns to navigating that cell', async () => {
			const store = editor();
			const before = store.items;
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('99{Escape}');

			expect(where()).toBe('1.1.1:quantity:nav');
			await expect.element(page.getByLabelText('Quantity 1.1.1', { exact: true })).toHaveValue('1');
			expect(store.items).toBe(before);
			expect(store.canUndo(BUDGET)).toBe(false);

			await press('{ArrowDown}'); // navigation works again straight away
			expect(where()).toBe('1.1.2:quantity:nav');
		});

		it('also clears a validation message', async () => {
			editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('abc{Enter}');
			await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
			await press('{Escape}');
			await expect.element(page.getByText('Enter a valid number.')).not.toBeInTheDocument();
			expect(where()).toBe('1.1.1:quantity:nav');
		});

		it('does nothing while only navigating', async () => {
			editor();
			focus('1.1.1', 'quantity');
			await press('{Escape}');
			expect(where()).toBe('1.1.1:quantity:nav');
		});
	});

	describe('Tab and Shift+Tab while editing', () => {
		it('commit and move to the next editable cell', async () => {
			const store = editor();
			focus('1.1.1', 'description');
			await press('{Enter}');
			await userEvent.keyboard('Renamed{Tab}');
			expect(itemOf(store, 3).description).toBe('Renamed');
			expect(where()).toBe('1.1.1:quantity:nav');
			await press('{Tab}'); // while navigating, Tab is the browser's
			expect(where()).not.toBe('1.1.1:unit:nav');
		});

		it('skip read-only cells: from a Group Unit to the next row, from a Line Unit price to the next row', async () => {
			editor();
			focus('1.1', 'unit'); // a Group: its Unit price, Total and the next Code are skipped
			await press('{Enter}{Tab}');
			expect(where()).toBe('1.1.1:description:nav');

			focus('1.1.1', 'unitPrice');
			await press('{Enter}{Tab}');
			expect(where()).toBe('1.1.2:description:nav'); // past Total and the next Code
		});

		it('Shift+Tab commits and moves to the previous editable cell', async () => {
			const store = editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('7{Shift>}{Tab}{/Shift}');
			expect(itemOf(store, 3).quantity).toBe('7');
			expect(where()).toBe('1.1.1:description:nav');

			focus('1.1.2', 'description');
			await press('{Enter}{Shift>}{Tab}{/Shift}');
			expect(where()).toBe('1.1.1:unitPrice:nav'); // back over the row boundary, skipping Code and Total
		});

		it('Shift+Tab skips a Group Unit price on the way back', async () => {
			editor();
			focus('1.1.1', 'description');
			await press('{Enter}{Shift>}{Tab}{/Shift}');
			expect(where()).toBe('1.1:unit:nav');
		});

		it('leave the grid at the very ends instead of trapping the keyboard', async () => {
			editor();
			focus('2', 'unitPrice');
			await press('{Enter}');
			const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
			document.activeElement!.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false); // the browser moves on, out of the cells
		});

		it('record one command per commit', async () => {
			const store = editor();
			focus('1.1.1', 'description');
			await press('{Enter}');
			await userEvent.keyboard('A{Tab}');
			await press('{Enter}');
			await userEvent.keyboard('2{Tab}');
			store.undo(BUDGET);
			expect(itemOf(store, 3).quantity).toBe('1'); // the second commit was its own command
			expect(itemOf(store, 3).description).toBe('A');
			store.undo(BUDGET);
			expect(itemOf(store, 3).description).toBe('Item 3');
			expect(store.canUndo(BUDGET)).toBe(false);
		});
	});

	describe('an invalid commit stays in editing', () => {
		it('keeps focus in the input with the validation showing, for Enter', async () => {
			const store = editor();
			const before = store.items;
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('abc{Enter}');

			expect(where()).toBe('1.1.1:quantity:edit');
			await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
			await expect.element(page.getByLabelText('Quantity 1.1.1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
			expect(store.items).toBe(before);
			expect(store.canUndo(BUDGET)).toBe(false);
		});

		it('keeps focus for Tab and Shift+Tab too, blocking the browser from moving on', async () => {
			editor();
			focus('1.1.1', 'unitPrice');
			await press('{Enter}');
			const input = document.activeElement as HTMLInputElement;
			await userEvent.fill(input, '');
			for (const tab of ['{Tab}', '{Shift>}{Tab}{/Shift}']) {
				await press(tab);
				expect(where(), tab).toBe('1.1.1:unitPrice:edit');
			}
			await expect.element(page.getByText('Enter a number.')).toBeVisible();
		});

		it('rejects a negative Quantity and stays', async () => {
			editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('-1{Enter}');
			expect(where()).toBe('1.1.1:quantity:edit');
			await expect.element(page.getByText('Quantity cannot be negative.')).toBeVisible();
		});

		it('moves on once the value is fixed', async () => {
			const store = editor();
			focus('1.1.1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('abc{Enter}');
			expect(where()).toBe('1.1.1:quantity:edit');
			await userEvent.fill(document.activeElement as HTMLInputElement, '5');
			await press('{Enter}');
			expect(itemOf(store, 3).quantity).toBe('5');
			expect(where()).toBe('1.1.2:quantity:nav');
			await expect.element(page.getByText('Enter a valid number.')).not.toBeInTheDocument();
		});
	});

	describe('collapsed rows', () => {
		const collapse = (code: string) => page.getByRole('button', { name: `Collapse ${code}`, exact: true }).click();

		it('arrow keys skip rows hidden by a collapsed Group', async () => {
			editor();
			await collapse('1.1');
			focus('1.1', 'quantity');
			await press('{ArrowDown}');
			expect(where()).toBe('1.2:quantity:nav'); // not 1.1.1
			await press('{ArrowUp}');
			expect(where()).toBe('1.1:quantity:nav');
		});

		it('skip every level of nested collapsed rows', async () => {
			editor();
			await collapse('1.1');
			await collapse('1');
			focus('1', 'description');
			await press('{ArrowDown}');
			expect(where()).toBe('2:description:nav');
			await press('{ArrowUp}');
			expect(where()).toBe('1:description:nav');
		});

		it('Tab moves over hidden rows to the next visible editable cell', async () => {
			editor();
			await collapse('1.1');
			focus('1.1', 'unit');
			await press('{Enter}{Tab}');
			expect(where()).toBe('1.2:description:nav'); // 1.1.1 and 1.1.2 are hidden
			focus('1.2', 'description');
			await press('{Enter}{Shift>}{Tab}{/Shift}');
			expect(where()).toBe('1.1:unit:nav');
		});

		it('Enter moves down to the next visible row', async () => {
			const store = editor();
			await collapse('1');
			focus('1', 'quantity');
			await press('{Enter}');
			await userEvent.keyboard('3{Enter}');
			expect(itemOf(store, 1).quantity).toBe('3');
			expect(where()).toBe('2:quantity:nav');
		});

		it('picks up again after expanding', async () => {
			editor();
			await collapse('1.1');
			await page.getByRole('button', { name: 'Expand 1.1', exact: true }).click();
			focus('1.1', 'quantity');
			await press('{ArrowDown}');
			expect(where()).toBe('1.1.1:quantity:nav');
		});
	});

	describe('focus survives re-renders', () => {
		it('stays on the active cell when the data under it changes', async () => {
			const store = editor();
			focus('1.1.1', 'quantity');
			store.editItem(BUDGET, uuid(4), 'unitPrice', '9'); // totals and the whole table re-render
			store.undo(BUDGET);
			await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('€234.00');
			expect(where()).toBe('1.1.1:quantity:nav');
		});

		it('stays in the input being edited while other rows change', async () => {
			const store = editor();
			focus('1.1.1', 'description');
			await press('{Enter}');
			await userEvent.keyboard('typing');
			store.editItem(BUDGET, uuid(6), 'unitPrice', '5');
			expect(where()).toBe('1.1.1:description:edit');
			expect((document.activeElement as HTMLInputElement).value).toBe('typing');
		});

		it('settles on the neighbouring row when the focused row is deleted', async () => {
			const store = editor();
			focus('1.1.2', 'quantity');
			store.deleteItem(BUDGET, uuid(4));
			await expect.poll(where).toBe('1.2:quantity:nav'); // the row that took its place, same column
		});

		it('settles on the last row when the last row is deleted', async () => {
			const store = editor();
			focus('2', 'unit');
			store.deleteItem(BUDGET, uuid(6));
			await expect.poll(where).toBe('1.2:unit:nav');
		});

		it('keeps the cell when a row is added elsewhere', async () => {
			const store = editor();
			focus('1.2', 'quantity');
			store.addTopLevelItem(BUDGET);
			await expect.element(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
			expect(where()).toBe('1.2:quantity:nav');
		});

		it('makes a clicked input the active cell, so arrows continue from there after Escape', async () => {
			editor();
			await page.getByLabelText('Quantity 1.2', { exact: true }).click();
			expect(where()).toBe('1.2:quantity:edit');
			await press('{Escape}{ArrowDown}');
			expect(where()).toBe('2:quantity:nav');
		});

		it('does not take focus when it was never in the grid', async () => {
			const store = editor();
			page.getByRole('button', { name: 'New item', exact: true }).element().focus();
			store.editItem(BUDGET, uuid(3), 'quantity', '2');
			await expect.element(page.getByRole('button', { name: 'New item', exact: true })).toHaveFocus();
		});
	});

	describe('read-only mode', () => {
		it('lets cells be navigated but never edited when there is no edit handler', async () => {
			render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR' });
			focus('1.1.1', 'quantity');
			await press('{ArrowRight}');
			expect(where()).toBe('1.1.1:unit:nav');
			await press('{Enter}{F2}');
			expect(where()).toBe('1.1.1:unit:nav');
			expect(document.querySelector('tbody input')).toBeNull();
		});
	});
});

describe('undo and redo shortcuts', () => {
	/** Item 1 (group x2) > [Item 2 (group x3) > [Item 3 10, Item 4 5 x2], Item 5 7], Item 6 100  =>  total 234 */
	const tree = () => [...nested(), item(6, null, '100')];

	function editor(items: Item[] = tree()) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const undo = (modifier: 'Control' | 'Meta' = 'Control') => userEvent.keyboard(`{${modifier}>}z{/${modifier}}`);
	const redo = (modifier: 'Control' | 'Meta' = 'Control') => userEvent.keyboard(`{${modifier}>}{Shift>}z{/Shift}{/${modifier}}`);
	const codes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const rowIds = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'));
	const grandTotal = () => page.getByLabelText('Grand total');
	const cell = (code: string, column: string) =>
		document.querySelector<HTMLElement>(`tr[data-code="${code}"] td[data-cell$="|${column}"]`)!;
	const itemOf = (store: BudgetStore, n: number) => store.itemsOf(BUDGET).find((i) => i.id === uuid(n))!;

	/** Commit an edit through the keyboard-free path the user would use, leaving focus on the page. */
	async function commit(label: string, text: string) {
		await page.getByLabelText(label, { exact: true }).fill(text);
		await userEvent.keyboard('{Enter}');
		(document.activeElement as HTMLElement).blur();
	}

	describe('with either platform modifier', () => {
		it('Ctrl+Z undoes and Ctrl+Shift+Z redoes a committed cell edit, updating Codes and totals at once', async () => {
			const store = editor();
			await commit('Unit price 1.1.1', '20');
			await expect.element(grandTotal()).toHaveTextContent('€294.00');

			await undo('Control');
			expect(itemOf(store, 3).unitPrice).toBe('10');
			await expect.element(grandTotal()).toHaveTextContent('€234.00');
			await expect.element(page.getByLabelText('Unit price 1.1.1', { exact: true })).toHaveValue('10');

			await redo('Control');
			expect(itemOf(store, 3).unitPrice).toBe('20');
			await expect.element(grandTotal()).toHaveTextContent('€294.00');
		});

		it('Cmd+Z and Cmd+Shift+Z do the same', async () => {
			const store = editor();
			await commit('Quantity 1.1', '4');
			await expect.element(grandTotal()).toHaveTextContent('€274.00'); // 2 x (4 x 20 + 7) + 100 = 174 + 100
			await undo('Meta');
			expect(itemOf(store, 2).quantity).toBe('3');
			await redo('Meta');
			expect(itemOf(store, 2).quantity).toBe('4');
		});

		it('works through several steps, in order', async () => {
			const store = editor();
			await commit('Description 1.1.1', 'First');
			await commit('Description 1.1.1', 'Second');
			await commit('Description 1.1.1', 'Third');
			await undo('Control');
			await undo('Meta');
			expect(itemOf(store, 3).description).toBe('First');
			await redo('Meta');
			await redo('Control');
			expect(itemOf(store, 3).description).toBe('Third');
		});

		it('behaves exactly like the Undo and Redo buttons', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '2');
			await page.getByRole('button', { name: 'Undo' }).click();
			const viaButton = store.itemsOf(BUDGET);
			await page.getByRole('button', { name: 'Redo' }).click();
			await undo('Control');
			expect(store.itemsOf(BUDGET)).toEqual(viaButton);
		});

		it('tells assistive technology about the shortcuts on the buttons', async () => {
			editor();
			await expect.element(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
			await expect.element(page.getByRole('button', { name: 'Redo' })).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z');
		});
	});

	describe('across the feature commands', () => {
		it('undoes and redoes adding an Item', async () => {
			const store = editor();
			const before = rowIds();
			await page.getByRole('button', { name: 'New item', exact: true }).click();
			(document.activeElement as HTMLElement).blur();
			const after = rowIds();
			expect(after).toHaveLength(before.length + 1);

			await undo();
			expect(rowIds()).toEqual(before);
			await redo();
			expect(rowIds()).toEqual(after); // the same identities, in the same order
			expect(store.itemsOf(BUDGET)).toHaveLength(7);
		});

		it('undoes adding a child with its Line-to-Group conversion in one step, and redoes it', async () => {
			const store = editor([item(1, null, '-250.5', '3'), item(2, null, '7')]);
			const before = rowIds();
			await page.getByRole('button', { name: 'Add child to 1', exact: true }).click();
			await page.getByRole('button', { name: 'Convert and add item' }).click();
			(document.activeElement as HTMLElement).blur();
			const after = rowIds();
			expect(itemOf(store, 1).unitPrice).toBe('0'); // converted: manual price replaced
			expect(after).toHaveLength(3);

			await undo('Meta');
			expect(rowIds()).toEqual(before);
			expect(itemOf(store, 1)).toMatchObject({ unitPrice: '-250.5', quantity: '3' }); // manual price and Quantity back
			await expect.element(page.getByLabelText('Unit price 1', { exact: true })).toHaveValue('-250.5');
			expect(store.canUndo(BUDGET)).toBe(false); // a single command

			await redo('Meta');
			expect(rowIds()).toEqual(after);
			expect(itemOf(store, 1).unitPrice).toBe('0');
		});

		it('undoes and redoes a subtree deletion, restoring every identity and the parent pricing', async () => {
			const store = editor([item(1, null, '999', '2'), item(2, 1, '0', '3'), item(3, 2, '10'), item(4, 2, '5', '2')]);
			const before = rowIds();
			const original = store.itemsOf(BUDGET);
			await page.getByRole('button', { name: 'Delete 1.1', exact: true }).click();
			await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			(document.activeElement as HTMLElement).blur();
			expect(rowIds()).toEqual([uuid(1)]);
			expect(itemOf(store, 1).unitPrice).toBe('0'); // the childless parent was normalized

			await undo();
			expect(rowIds()).toEqual(before);
			expect(store.itemsOf(BUDGET)).toEqual(original);
			expect(itemOf(store, 1).unitPrice).toBe('999'); // original parent pricing

			await redo();
			expect(rowIds()).toEqual([uuid(1)]);
		});

		it('restores focus to a sensible cell when undo removes the row it was on', async () => {
			editor();
			await page.getByRole('button', { name: 'New item', exact: true }).click();
			const added = rowIds().at(-1)!;
			cell(codes().at(-1)!, 'quantity').focus();
			await undo();
			expect(rowIds()).not.toContain(added);
			await expect.poll(() => document.activeElement?.closest('[data-cell]')?.closest('tr')?.getAttribute('data-code')).toBe('2');
		});
	});

	describe('typing keeps the browser undo', () => {
		it('leaves Ctrl/Cmd+Z alone while a cell has uncommitted text, and records nothing', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '5'); // one real command to protect
			const items = store.items;
			await page.getByLabelText('Description 1.1.1', { exact: true }).fill('half typed');

			for (const modifier of ['ctrlKey', 'metaKey'] as const) {
				for (const shiftKey of [false, true]) {
					const event = new KeyboardEvent('keydown', { key: shiftKey ? 'Z' : 'z', [modifier]: true, shiftKey, bubbles: true, cancelable: true });
					document.activeElement!.dispatchEvent(event);
					expect(event.defaultPrevented, `${modifier} shift=${shiftKey}`).toBe(false); // the browser still gets it
				}
			}
			expect(store.items).toBe(items); // no Item command ran
			expect(itemOf(store, 3).quantity).toBe('5'); // the earlier command was not undone
			expect((document.activeElement as HTMLInputElement).value).toBe('half typed');
		});

		it('makes no accidental Item command from text editing', async () => {
			const store = editor();
			await page.getByLabelText('Description 1.1.1', { exact: true }).fill('typing');
			await userEvent.keyboard('{Control>}z{/Control}');
			await userEvent.keyboard('{Meta>}z{/Meta}');
			expect(store.canUndo(BUDGET)).toBe(false);
			expect(store.canRedo(BUDGET)).toBe(false);
		});

		it('takes the shortcut again once the text is committed or abandoned', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '5');
			await page.getByLabelText('Description 1.1.1', { exact: true }).fill('abandon me');
			await userEvent.keyboard('{Escape}'); // nothing uncommitted any more
			await undo();
			expect(itemOf(store, 3).quantity).toBe('1');
		});

		it('hands over from a focused cell input with nothing typed', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '5');
			cell('1.1.1', 'quantity').focus();
			await userEvent.keyboard('{Enter}'); // editing, but unchanged text
			expect(document.activeElement?.tagName).toBe('INPUT');
			const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
			document.activeElement!.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
			expect(itemOf(store, 3).quantity).toBe('1');
		});

		it('does not undo on a plain z, with Alt, or with both modifiers', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '5');
			cell('1.1.1', 'code').focus();
			await userEvent.keyboard('z');
			await userEvent.keyboard('{Control>}{Alt>}z{/Alt}{/Control}');
			await userEvent.keyboard('{Control>}{Meta>}z{/Meta}{/Control}');
			expect(itemOf(store, 3).quantity).toBe('5');
		});

		it('leaves the title field to the browser while it is being edited, and does not undo behind it', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '5');
			await page.getByRole('button', { name: 'Rename Budget' }).click();
			await page.getByLabelText('Budget name').fill('Typed in the title');
			const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
			document.activeElement!.dispatchEvent(event);
			expect(event.defaultPrevented).toBe(false);
			expect(itemOf(store, 3).quantity).toBe('5');

			await userEvent.keyboard('{Escape}');
			await undo();
			expect(itemOf(store, 3).quantity).toBe('1'); // normal again once the title edit is over
		});
	});

	describe('empty stacks, invalidation and isolation', () => {
		it('does nothing, harmlessly, when there is nothing to undo or redo', async () => {
			const store = editor();
			const items = store.items;
			const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
			document.body.dispatchEvent(event);
			await undo();
			await redo();
			expect(store.items).toBe(items);
			expect(store.canUndo(BUDGET)).toBe(false);
			expect(store.canRedo(BUDGET)).toBe(false);
		});

		it('redo is gone after a new commit following an undo', async () => {
			const store = editor();
			await commit('Quantity 1.1.1', '2');
			await undo();
			expect(store.canRedo(BUDGET)).toBe(true);
			await commit('Quantity 1.1.1', '3');
			expect(store.canRedo(BUDGET)).toBe(false);
			await redo();
			expect(itemOf(store, 3).quantity).toBe('3'); // nothing was redone
			await expect.element(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
		});

		it('only touches the Budget that is open, leaving the other history alone', async () => {
			const A = BUDGET;
			const B = '22222222-2222-4222-8222-222222222222';
			const store = new BudgetStore({ history: new CommandHistory() });
			store.hydrate();
			store.setBudget(createBudget({ id: A, name: 'A', currency: 'EUR' }), [item(1, null, '1')]);
			store.setBudget(createBudget({ id: B, name: 'B', currency: 'EUR' }), [
				createItem({ id: uuid(901), budgetId: B, sortIndex: 0, description: 'B item', unitPrice: '2' })
			]);
			store.select(A);
			const view = render(BudgetEditorPage, { budgetId: A, store });
			await commit('Quantity 1', '7');
			expect(store.canUndo(A)).toBe(true);

			await view.rerender({ budgetId: B, store });
			await expect.element(page.getByRole('heading', { name: 'B', exact: true })).toBeVisible();
			await undo(); // B has no history of its own
			expect(store.canUndo(A)).toBe(true);
			expect(store.itemsOf(A)[0].quantity).toBe('7'); // A untouched by B's undo

			await view.rerender({ budgetId: A, store });
			await expect.element(page.getByRole('heading', { name: 'A', exact: true })).toBeVisible();
			await undo();
			expect(store.itemsOf(A)[0].quantity).toBe('1');
			expect(store.canUndo(A)).toBe(false);
		});

		it('is only active in the editor: nothing happens once it is closed', async () => {
			const store = openStore(tree());
			const view = render(BudgetEditorPage, { budgetId: BUDGET, store });
			await commit('Quantity 1.1.1', '5');
			view.unmount();
			await undo();
			expect(itemOf(store, 3).quantity).toBe('5');
		});
	});
});

describe('row actions as icons and a context menu', () => {
	function editor(items: Item[] = nested()) {
		const store = openStore(items);
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		return store;
	}
	const codes = () => [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-code'));
	const row = (code: string) => document.querySelector<HTMLElement>(`tr[data-code="${code}"]`)!;
	const actions = (code: string) => row(code).querySelector<HTMLElement>('.actions')!;
	const rightClick = (target: Element) =>
		target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 }));
	const menu = (code: string) => page.getByRole('menu', { name: `Actions for ${code}` });

	it('has no visible text buttons per row: three icon buttons, each named for its row', async () => {
		editor();
		const buttons = [...actions('1.2').querySelectorAll('button')];
		expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual(['Add item below 1.2', 'Add child to 1.2', 'Delete 1.2']);
		expect(buttons.map((button) => button.textContent?.trim())).toEqual(['', '', '']);
	});

	it('shows the row actions on hover and on keyboard focus, and hides them otherwise', async () => {
		editor();
		await userEvent.hover(document.body); // a pointer left over from an earlier test must not count as hover
		await vi.waitFor(() => expect(getComputedStyle(actions('1.2')).opacity).toBe('0'));

		await page.getByRole('button', { name: 'Delete 1.2', exact: true }).hover();
		await vi.waitFor(() => expect(getComputedStyle(actions('1.2')).opacity).toBe('1'));

		await userEvent.hover(document.body);
		await vi.waitFor(() => expect(getComputedStyle(actions('1.2')).opacity).toBe('0'));

		page.getByRole('button', { name: 'Add child to 1.2', exact: true }).element().focus();
		await vi.waitFor(() => expect(getComputedStyle(actions('1.2')).opacity).toBe('1')); // reachable by keyboard
	});

	it('opens a context menu on right-click with the same actions, Delete last and marked', async () => {
		editor();
		rightClick(row('1.2').querySelector('[data-cell$="|description"]')!);
		await expect.element(menu('1.2')).toBeVisible();
		const items = [...menu('1.2').element().querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());
		expect(items).toEqual(['Add item below', 'Add child', 'Delete']);
		await expect.element(page.getByRole('menuitem', { name: 'Add item below' })).toHaveFocus();
	});

	it('runs the chosen action on the right-clicked row', async () => {
		const store = editor();
		const before = codes().length;
		rightClick(row('1.2').querySelector('[data-cell$="|code"]')!);
		await page.getByRole('menuitem', { name: 'Add item below' }).click();
		expect(codes()).toHaveLength(before + 1);
		expect(store.canUndo(BUDGET)).toBe(true);

		rightClick(row('1.1.1').querySelector('[data-cell$="|total"]')!);
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		expect(codes()).not.toContain('1.1.2');
	});

	it('closes on Escape without doing anything', async () => {
		editor();
		const before = codes();
		rightClick(row('1').querySelector('[data-cell$="|code"]')!);
		await expect.element(menu('1')).toBeVisible();
		await userEvent.keyboard('{Escape}');
		await expect.element(menu('1')).not.toBeInTheDocument();
		expect(codes()).toEqual(before);
	});

	it('leaves the browser menu alone inside a cell input (cut, copy, paste)', async () => {
		editor();
		const input = page.getByLabelText('Description 1.2', { exact: true }).element();
		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		input.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		expect(document.querySelector('[role="menu"]')).toBeNull();
	});
});

describe('the "New item" row', () => {
	it('is the last row of the table, with a plus icon, and adds a top-level Item inline', async () => {
		const store = openStore(nested());
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		const add = page.getByRole('button', { name: 'New item', exact: true });
		await expect.element(add).toBeVisible();
		expect(add.element().querySelector('svg')).not.toBeNull();
		expect(add.element().closest('tfoot')).not.toBeNull(); // after every Item row
		const before = store.rows.length;
		await add.click();
		expect(store.rows.length).toBe(before + 1);
		expect(document.querySelectorAll('tbody tr')).toHaveLength(before + 1);
	});

	it('replaces the old "Add item" button and the "Rename" text button', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(nested()) });
		expect(page.getByRole('button', { name: 'Add item', exact: true }).elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Rename', exact: true }).elements()).toHaveLength(0);
	});
});

describe('the compact icon toolbar', () => {
	it('keeps Undo, Redo, Collapse all and Expand all as named icon buttons with shortcut hints', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(nested()) });
		for (const name of ['Undo', 'Redo', 'Collapse all', 'Expand all']) {
			const button = page.getByRole('button', { name, exact: true });
			await expect.element(button).toBeVisible();
			expect(button.element().textContent?.trim()).toBe('');
		}
		await expect.element(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
		await expect.element(page.getByRole('button', { name: 'Redo' })).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z');
		const height = page.getByRole('button', { name: 'Undo' }).element().getBoundingClientRect().height;
		expect(height).toBeLessThanOrEqual(36); // compact, not a 44px text button
	});

	it('uses the full width of the window for the table', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(nested()) });
		const main = document.querySelector('main')!.getBoundingClientRect();
		const scroll = document.querySelector('.scroll')!.getBoundingClientRect();
		expect(scroll.width).toBeGreaterThan(main.width - 80); // only the page padding is left over
	});

	it('has compact rows', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(nested()) });
		const row = document.querySelector('tbody tr')!.getBoundingClientRect();
		expect(row.height).toBeLessThanOrEqual(40);
	});
});
