import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
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
const table = () =>
	[...document.querySelectorAll('table[aria-label="Budget Items"] tbody tr')].map((row) =>
		[...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim() ?? '')
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
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows });
		const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent?.trim());
		expect(headers).toEqual(['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
		await expect.element(page.getByRole('columnheader', { name: 'Total' })).toHaveAttribute('scope', 'col');
	});

	it('shows nested Quantity multipliers: each Group multiplies after summing its direct children', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows });
		await expect.element(page.getByRole('table', { name: 'Budget Items' })).toBeVisible();
		expect(table()).toEqual([
			['1', 'Item 1', '2', '', '67', '134'],
			['1.1', 'Item 2', '3', '', '20', '60'],
			['1.1.1', 'Item 3', '1', '', '10', '10'],
			['1.1.2', 'Item 4', '2', '', '5', '10'],
			['1.2', 'Item 5', '1', '', '7', '7']
		]);
	});

	it('shows negative Line prices rolling up into negative Group values', async () => {
		const items = [item(1, null, '0', '2'), item(2, 1, '100'), item(3, 1, '-250'), item(4, null, '40')];
		render(BudgetSpreadsheet, { rows: openStore(items).rows });
		expect(table()).toEqual([
			['1', 'Item 1', '2', '', '-150', '-300'],
			['1.1', 'Item 2', '1', '', '100', '100'],
			['1.2', 'Item 3', '1', '', '-250', '-250'],
			['2', 'Item 4', '1', '', '40', '40']
		]);
	});

	it('shows fractional quantities and precise decimals without rounding', async () => {
		const items = [item(1, null, '19.99', '0.5'), item(2, null, '0.1'), item(3, null, '0.2')];
		render(BudgetSpreadsheet, { rows: openStore(items).rows });
		expect(table().map((row) => row.slice(2).join('|'))).toEqual(['0.5||19.99|9.995', '1||0.1|0.1', '1||0.2|0.2']);
	});

	it('shows the Unit when present and an empty cell otherwise', async () => {
		render(BudgetSpreadsheet, { rows: openStore([item(1, null, '5', '2', 1, { unit: 'hours' }), item(2, null, '5')]).rows });
		expect(table().map((row) => row[3])).toEqual(['hours', '']);
	});

	it('preserves derived sibling order and nesting, whatever the input order', async () => {
		const shuffled = [item(5, 1, '1', '1', 1), item(1, null, '0', '1', 1), item(3, null, '9', '1', 0), item(4, 1, '2', '1', 0)];
		render(BudgetSpreadsheet, { rows: openStore(shuffled).rows });
		expect(table().map((row) => `${row[0]} ${row[1]}`)).toEqual(['1 Item 3', '2 Item 1', '2.1 Item 4', '2.2 Item 5']);
		const kinds = [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-kind'));
		expect(kinds).toEqual(['line', 'group', 'line', 'line']);
	});

	it('renders arbitrarily deep nesting without a depth cap, with bounded indentation', async () => {
		const depth = 60;
		const items = Array.from({ length: depth }, (_, i) => item(i + 1, i === 0 ? null : i, '0', '1'));
		items.push(item(depth + 1, depth, '3'));
		render(BudgetSpreadsheet, { rows: openStore(items).rows });

		const rows = table();
		expect(rows).toHaveLength(depth + 1);
		expect(rows.at(-1)![0].split('.')).toHaveLength(depth + 1);
		expect(rows.at(-1)![5]).toBe('3');

		const indent = (index: number) =>
			parseFloat(getComputedStyle(document.querySelectorAll('tbody tr')[index].querySelectorAll('td')[1]).paddingInlineStart);
		expect(indent(2)).toBeGreaterThan(indent(0));
		expect(indent(30)).toBe(indent(depth)); // growth stops at a fixed maximum
	});

	it('marks Code, Total and a Group Unit price read-only, with no input controls anywhere', async () => {
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows });
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
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows });
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
		render(BudgetSpreadsheet, { rows: openStore(nested()).rows });
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
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('0 DKK');
		await expect.element(page.getByText('This Budget has no Items yet.')).toBeVisible();
		expect(document.querySelector('table')).toBeNull();
	});

	it('shows the grand total of the top-level Totals and the table', async () => {
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore([...nested(), item(6, null, '1.5', '2')], 'USD') });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('137.0 USD'); // 134 + 1.5 x 2; decimals keep their scale until the currency formatter (LUL-56)
		expect(table()).toHaveLength(6);
	});

	it('shows a negative grand total when discounts exceed positives', async () => {
		const items = [item(1, null, '100'), item(2, null, '-350.25')];
		render(BudgetEditorPage, { budgetId: BUDGET, store: openStore(items) });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('-250.25 EUR');
	});

	it('updates the rows and grand total when the shared Items change', async () => {
		const store = openStore(nested());
		render(BudgetEditorPage, { budgetId: BUDGET, store });
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('134 EUR');

		// Inner Group quantity 3 -> 4: inner 80, outer (80 + 7) x 2 = 174.
		store.execute(BUDGET, store.itemsOf(BUDGET).map((i) => (i.id === uuid(2) ? { ...i, quantity: '4' } : i)));
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('174 EUR');
		expect(table()[1]).toEqual(['1.1', 'Item 2', '4', '', '20', '80']);

		store.undo(BUDGET);
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('134 EUR');
	});
});
