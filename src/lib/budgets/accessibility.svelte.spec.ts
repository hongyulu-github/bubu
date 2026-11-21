import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/theme.css';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { createBubuStorage } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';
import { settled } from '../testing/motion';
import Landing from '../landing/Landing.svelte';
import BudgetEditorPage from './BudgetEditorPage.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n: number, parent: number | null, extra: Partial<Item> = {}) =>
	createItem({ id: id(n), budgetId: A, parentId: parent === null ? null : id(parent), sortIndex: n, description: `Item ${n}`, ...extra });

function openStore() {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate();
	// 1 Venue (Group) > 1.1 Hall (Group) > 1.1.1 Rent; 2 Music (Line)
	store.setBudget(createBudget({ id: A, name: 'Wedding', currency: 'EUR' }), [
		item(1, null),
		item(2, 1),
		item(3, 2, { unitPrice: '100', unit: 'day' }),
		item(4, null, { unitPrice: '50' })
	]);
	store.select(A);
	return store;
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

const rowOf = (code: string) => document.querySelector<HTMLElement>(`tr[data-code="${code}"]`)!;

describe('the Budget table', () => {
	it('is a named treegrid whose columns keep meaningful header associations', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		await expect.element(page.getByRole('treegrid', { name: 'Budget Items' })).toBeVisible();
		const headers = ['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total'];
		for (const name of headers) await expect.element(page.getByRole('columnheader', { name, exact: true })).toHaveAttribute('scope', 'col');
		const cells = [...rowOf('1.1.1').querySelectorAll('td')].slice(0, 6);
		expect(cells).toHaveLength(headers.length); // one cell under each header, in the same order
	});

	it('says the level of every Item and whether each Group is open, for assistive technology', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		await expect.element(page.getByRole('treegrid', { name: 'Budget Items' })).toBeVisible();
		expect([rowOf('1'), rowOf('1.1'), rowOf('1.1.1'), rowOf('2')].map((row) => row.getAttribute('aria-level'))).toEqual(['1', '2', '3', '1']);
		expect(rowOf('1').getAttribute('aria-expanded')).toBe('true');
		expect(rowOf('1.1').getAttribute('aria-expanded')).toBe('true');
		expect(rowOf('1.1.1').hasAttribute('aria-expanded')).toBe(false); // a Line has nothing to expand
		expect(rowOf('2').hasAttribute('aria-expanded')).toBe(false);
	});

	it('exposes a Group control with its state, and the row follows when it is collapsed and expanded again', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		const toggle = page.getByRole('button', { name: 'Collapse 1', exact: true });
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'true');
		await toggle.click();
		await expect.element(page.getByRole('button', { name: 'Expand 1', exact: true })).toHaveAttribute('aria-expanded', 'false');
		expect(rowOf('1').getAttribute('aria-expanded')).toBe('false');
		expect(document.querySelector('tr[data-code="1.1"]')).toBeNull(); // hidden rows are not left for a reader to wander into
		await page.getByRole('button', { name: 'Expand 1', exact: true }).click();
		expect(rowOf('1').getAttribute('aria-expanded')).toBe('true');
	});

	it('tells computed and fixed cells (read-only) apart from editable ones', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		await expect.element(page.getByRole('treegrid', { name: 'Budget Items' })).toBeVisible();
		const cell = (code: string, column: string) => rowOf(code).querySelector<HTMLElement>(`td[data-cell$="|${column}"]`)!;
		for (const column of ['code', 'total']) expect(cell('1.1.1', column).getAttribute('aria-readonly'), column).toBe('true');
		expect(cell('1', 'unitPrice').getAttribute('aria-readonly')).toBe('true'); // a Group's Unit price is the sum of what is inside
		expect(cell('1', 'unitPrice').querySelector('input')).toBeNull(); // so there is nothing to type in
		for (const column of ['description', 'quantity', 'unit']) expect(cell('1.1.1', column).hasAttribute('aria-readonly'), column).toBe(false);
		expect(cell('1.1.1', 'unitPrice').hasAttribute('aria-readonly')).toBe(false);
		expect(cell('1.1.1', 'unitPrice').querySelector('input')).not.toBeNull();
	});

	it('names every input by what it is and which Item it belongs to, and every icon button by what it does', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		for (const name of ['Description 1.1.1', 'Quantity 1.1.1', 'Unit 1.1.1', 'Unit price 1.1.1']) {
			await expect.element(page.getByRole('textbox', { name, exact: true })).toBeVisible();
		}
		for (const name of ['Add item below 1.1.1', 'Add child to 1.1.1', 'Delete 1.1.1', 'Undo', 'Redo', 'Collapse all', 'Expand all', 'Download as Excel', 'Rename Budget']) {
			await expect.element(page.getByRole('button', { name, exact: true })).toBeVisible();
		}
		const unnamed = [...document.querySelectorAll('button')].filter((button) => !(button.getAttribute('aria-label') || button.textContent?.trim()));
		expect(unnamed).toEqual([]);
	});

	it('ties a cell error to its input: invalid, with the message as its description', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		const quantity = page.getByRole('textbox', { name: 'Quantity 1.1.1', exact: true });
		await userEvent.fill(quantity, 'lots');
		await userEvent.keyboard('{Enter}');
		await expect.element(quantity).toHaveAttribute('aria-invalid', 'true');
		const describedBy = quantity.element().getAttribute('aria-describedby')!;
		const message = describedBy.split(' ').map((token) => document.getElementById(token)).find((el) => el?.textContent?.trim());
		expect(message?.textContent).toMatch(/number/i);
	});
});

describe('dialogs', () => {
	it('are named by their title and described by their text', async () => {
		render(BudgetEditorPage, { budgetId: A, store: openStore() });
		await page.getByRole('button', { name: 'Delete 1', exact: true }).click(); // a Group: it asks first
		const dialog = page.getByRole('dialog');
		await expect.element(dialog).toBeVisible();
		const element = dialog.element();
		const title = document.getElementById(element.getAttribute('aria-labelledby')!);
		expect(title?.textContent?.trim().length).toBeGreaterThan(3);
		expect(element.getAttribute('aria-describedby')).not.toBeNull();
		expect(document.getElementById(element.getAttribute('aria-describedby')!)?.textContent?.trim().length).toBeGreaterThan(3);
		await expect.element(page.getByRole('dialog', { name: title!.textContent!.trim() })).toBeVisible();
	});

	it('tie the error in a field to that field: invalid, with the message as its description', async () => {
		const fake = new FakeStorage();
		const store = new BudgetStore({ storage: createBubuStorage(() => fake), history: new CommandHistory() });
		store.hydrate();
		render(Landing, { store, navigate: vi.fn() });
		await page.getByRole('button', { name: 'Create a budget', exact: true }).click();
		await page.getByRole('button', { name: 'Create Budget', exact: true }).click(); // empty form
		for (const [label, text] of [['Name', /name/i], ['Currency', /currency/i]] as const) {
			const field = page.getByLabelText(label);
			await expect.element(field).toHaveAttribute('aria-invalid', 'true');
			const described = field.element().getAttribute('aria-describedby')!.split(' ').map((token) => document.getElementById(token)?.textContent?.trim());
			expect(described.join(' '), label).toMatch(text);
		}
	});
});

describe('the Budgets drawer and what opens it', () => {
	function landing() {
		const fake = new FakeStorage();
		const store = new BudgetStore({ storage: createBubuStorage(() => fake), history: new CommandHistory() });
		store.hydrate();
		render(Landing, { store, navigate: vi.fn() });
	}

	it('is a named dialog with named Close, and exposes its opener as expanded only while it is open', async () => {
		landing();
		const mine = page.getByRole('button', { name: 'My budgets', exact: true });
		const create = page.getByRole('button', { name: 'Create a budget', exact: true });
		for (const trigger of [mine, create]) {
			await expect.element(trigger).toHaveAttribute('aria-haspopup', 'dialog');
			await expect.element(trigger).toHaveAttribute('aria-expanded', 'false');
		}

		await mine.click();
		await settled();
		await expect.element(page.getByRole('dialog', { name: 'My budgets', exact: true })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
		await expect.element(mine).toHaveAttribute('aria-expanded', 'true');
		await expect.element(create).toHaveAttribute('aria-expanded', 'false'); // only the one that opened it

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await settled();
		await expect.element(mine).toHaveAttribute('aria-expanded', 'false');
	});

	it('does not add a second banner landmark inside the dialog', async () => {
		landing();
		await page.getByRole('button', { name: 'My budgets', exact: true }).click();
		await settled();
		expect(document.querySelector('dialog[open] header')).toBeNull();
		expect(page.getByRole('banner').elements()).toHaveLength(0);
	});
});
