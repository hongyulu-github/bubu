import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
		await expect.element(page.getByRole('table', { name: 'Budget Items' })).toBeVisible();
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
		await expect.element(page.getByText('This Budget has no Items yet.')).toBeVisible();
		expect(document.querySelector('table')).toBeNull();
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
		await expect.element(page.getByText('This Budget has no Items yet.')).toBeVisible();
		await expect.element(grandTotal()).toHaveTextContent('€0.00');

		await page.getByRole('button', { name: 'Add item', exact: true }).click();

		await expect.element(page.getByRole('table', { name: 'Budget Items' })).toBeVisible();
		expect(codes()).toEqual(['1']);
		expect(table()).toEqual([['1', '', '1', '', '0', '€0.00']]); // empty Description, Quantity 1, Unit price 0 (an input), Total 0
		await expect.element(page.getByLabelText('Description 1', { exact: true })).toHaveFocus();
		await expect.element(grandTotal()).toHaveTextContent('€0.00');
		expect(document.body.textContent).not.toContain('This Budget has no Items yet.');
	});

	it('adds top-level Items one after another in insertion order', async () => {
		editor(nested());
		await page.getByRole('button', { name: 'Add item', exact: true }).click();
		await page.getByRole('button', { name: 'Add item', exact: true }).click();
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
		expect(document.querySelectorAll('tbody button')).toHaveLength(15); // Add below, Add child and Delete on each of the 5 rows
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
		await expect.element(page.getByRole('button', { name: 'Add item', exact: true })).toHaveFocus();
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
