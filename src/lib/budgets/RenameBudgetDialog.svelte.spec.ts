import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import BudgetEditorPage from './BudgetEditorPage.svelte';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const item = (n: number, parent: number | null, unitPrice: string): Item =>
	createItem({ id: uuid(n), budgetId: BUDGET, parentId: parent === null ? null : uuid(parent), sortIndex: n, description: `Item ${n}`, unitPrice });

const clock = () => new Date('2026-05-06T07:08:09.000Z');

function open() {
	const store = new BudgetStore({ history: new CommandHistory(), now: clock });
	store.hydrate();
	store.setBudget(createBudget({ id: BUDGET, name: 'Wedding', currency: 'EUR', now: new Date('2026-01-01T00:00:00.000Z') }), [
		item(1, null, '0'),
		item(2, 1, '100'),
		item(3, null, '7')
	]);
	store.select(BUDGET);
	render(BudgetEditorPage, { budgetId: BUDGET, store });
	return store;
}

const renameButton = () => page.getByRole('button', { name: 'Rename' });
const dialog = () => page.getByRole('dialog', { name: 'Rename Budget' });
const nameField = () => page.getByLabelText('Name', { exact: true });
const budgetOf = (store: BudgetStore) => store.budgets.find((b) => b.id === BUDGET)!;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('RenameBudgetDialog', () => {
	it('opens from the editor with the current name and focus inside', async () => {
		open();
		await renameButton().click();
		await expect.element(dialog()).toBeVisible();
		await expect.element(nameField()).toHaveValue('Wedding');
		await expect.element(nameField()).toHaveFocus();
		expect(document.querySelector('.error')?.textContent ?? '').toBe(''); // no error up front
	});

	it('renames on Save: only the name and updatedAt change, and the heading updates', async () => {
		const store = open();
		const before = budgetOf(store);
		const items = store.itemsOf(BUDGET);

		await renameButton().click();
		await nameField().fill('  Summer wedding  ');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(dialog()).not.toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Summer wedding' })).toBeVisible();
		const after = budgetOf(store);
		expect(after).toEqual({ ...before, name: 'Summer wedding', updatedAt: '2026-05-06T07:08:09.000Z' });
		expect(store.itemsOf(BUDGET)).toBe(items);
	});

	it('saves with Enter', async () => {
		const store = open();
		await renameButton().click();
		await nameField().fill('Via Enter');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByRole('heading', { name: 'Via Enter' })).toBeVisible();
		expect(budgetOf(store).name).toBe('Via Enter');
	});

	it('shows a validation error for an empty name and keeps the dialog open and the name unchanged', async () => {
		const store = open();
		await renameButton().click();
		await nameField().fill('');
		await page.getByRole('button', { name: 'Save' }).click();

		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		await expect.element(nameField()).toHaveAttribute('aria-invalid', 'true');
		await expect.element(nameField()).toHaveFocus();
		await expect.element(dialog()).toBeVisible();
		expect(budgetOf(store).name).toBe('Wedding');
		expect(budgetOf(store).updatedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('rejects a whitespace-only name', async () => {
		const store = open();
		await renameButton().click();
		await nameField().fill('     ');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		expect(budgetOf(store).name).toBe('Wedding');
	});

	it('clears the error once the name is fixed, then saves', async () => {
		const store = open();
		await renameButton().click();
		await nameField().fill('');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();

		await nameField().fill('Fixed');
		await expect.element(page.getByText('Enter a name for the Budget.')).not.toBeInTheDocument();
		await page.getByRole('button', { name: 'Save' }).click();
		expect(budgetOf(store).name).toBe('Fixed');
	});

	it('leaves the name unchanged on Cancel and returns focus to the Rename button', async () => {
		const store = open();
		const before = budgetOf(store);
		await renameButton().click();
		await nameField().fill('Should not stick');
		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(budgetOf(store)).toBe(before);
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await expect.element(renameButton()).toHaveFocus();
	});

	it('leaves the name unchanged on Escape', async () => {
		const store = open();
		const before = budgetOf(store);
		await renameButton().click();
		await nameField().fill('Should not stick');
		await userEvent.keyboard('{Escape}');

		await expect.element(dialog()).not.toBeInTheDocument();
		expect(budgetOf(store)).toBe(before);
	});

	it('starts from the current name each time it opens, not from an abandoned edit', async () => {
		open();
		await renameButton().click();
		await nameField().fill('Abandoned');
		await page.getByRole('button', { name: 'Cancel' }).click();

		await renameButton().click();
		await expect.element(nameField()).toHaveValue('Wedding');
		await expect.element(page.getByText('Enter a name for the Budget.')).not.toBeInTheDocument();
	});

	it('does not alter Items, their order, the totals or the Item history', async () => {
		const store = open();
		const rowsBefore = [...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'));
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('107 EUR');

		await renameButton().click();
		await nameField().fill('Renamed');
		await page.getByRole('button', { name: 'Save' }).click();

		expect([...document.querySelectorAll('tbody tr')].map((row) => row.getAttribute('data-item-id'))).toEqual(rowsBefore);
		await expect.element(page.getByLabelText('Grand total')).toHaveTextContent('107 EUR');
		expect(store.canUndo(BUDGET)).toBe(false);
		await expect.element(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
	});
});
