import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { bubuStorage } from '../storage/bubu';
import { BudgetStore } from '../state/budgets.svelte';
import { BudgetPersistence } from '../state/persistence.svelte';
import { settled } from '../testing/motion';
import BudgetsDrawer from './BudgetsDrawer.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const itemId = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function seed() {
	bubuStorage.writeBudget(createBudget({ id: A, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00Z') }));
	bubuStorage.writeItems(A, [createItem({ id: itemId(101), budgetId: A, description: 'Venue' })]);
	bubuStorage.writeBudget(createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date('2026-03-01T00:00:00Z') }));
	bubuStorage.writeItems(B, [createItem({ id: itemId(201), budgetId: B, description: 'Paint' })]);
}
const newStore = () => {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate();
	return store;
};
/** The Budgets drawer, open on the saved list, where the "⋯" menu with Clear all Bubu data lives. */
const openDrawer = async (store: BudgetStore) => {
	render(BudgetsDrawer, { open: true, view: 'list', store, oncreated: vi.fn() });
	await settled(); // it slides in: wait until it is in place, or a click can land on the dimmed page instead
};

const open = async () => {
	await page.getByRole('button', { name: 'More actions' }).click();
	await page.getByRole('menuitem', { name: 'Clear all Bubu data…' }).click();
};
const confirm = () => page.getByRole('dialog', { name: 'Clear all Bubu data?' }).getByRole('button', { name: 'Clear all Bubu data' }).click();
const keep = () => {
	localStorage.setItem('other-app:settings', '{"theme":"dark"}');
	localStorage.setItem('unrelated', 'x');
};

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('Clear all Bubu data, in the Budgets drawer', () => {
	it('is a destructive item in a "⋯" menu to the right of the "My budgets" title, beside Close', async () => {
		seed();
		await openDrawer(newStore());
		await expect.element(page.getByRole('button', { name: 'Clear all Bubu data' })).not.toBeInTheDocument(); // not a button on the page
		const title = page.getByRole('heading', { name: 'My budgets' }).element().getBoundingClientRect();
		const more = page.getByRole('button', { name: 'More actions' }).element().getBoundingClientRect();
		const close = page.getByRole('button', { name: 'Close', exact: true }).element().getBoundingClientRect();
		expect(more.left).toBeGreaterThan(title.right); // right of the title
		expect(more.right).toBeLessThanOrEqual(close.left + 1); // and next to Close, in the header
		expect(Math.abs(more.top + more.height / 2 - (title.top + title.height / 2))).toBeLessThan(12); // on the same line

		await page.getByRole('button', { name: 'More actions' }).click();
		await expect.element(page.getByRole('menuitem', { name: 'Clear all Bubu data…' })).toBeVisible();
	});

	it('has no "New budget" button in the list any more', async () => {
		seed();
		await openDrawer(newStore());
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toBeVisible();
		expect(page.getByRole('button', { name: /new budget/i }).elements()).toHaveLength(0);
	});

	it('is hidden when there are no Budgets to clear, and appears with the first one', async () => {
		const store = newStore();
		await openDrawer(store);
		await expect.element(page.getByText('No saved Budgets yet.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'More actions' })).not.toBeInTheDocument();

		store.createBudget({ name: 'Fresh', currency: 'EUR' });
		await expect.element(page.getByRole('button', { name: 'More actions' })).toBeVisible();
	});

	it('asks first, in strong words: all Budgets are removed, it cannot be undone', async () => {
		seed();
		await openDrawer(newStore());
		await open();
		const dialog = page.getByRole('dialog', { name: 'Clear all Bubu data?' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog).toHaveTextContent('all 2 of your Budgets');
		await expect.element(dialog).toHaveTextContent('cannot be undone');
		await expect.element(dialog).toHaveTextContent('Anything else saved in your browser is left alone');
	});

	it('on Cancel or Escape changes nothing: storage, state and history stay, and the drawer stays open', async () => {
		seed();
		keep();
		const store = newStore();
		await openDrawer(store);
		store.editItem(A, itemId(101), 'description', 'edited');
		const before = JSON.stringify({ ...localStorage });
		const budgets = store.budgets;

		await open();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await open();
		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog', { name: 'Clear all Bubu data?' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('dialog', { name: 'My budgets' })).toBeVisible(); // Escape closed only the question
		expect(JSON.stringify({ ...localStorage })).toBe(before);
		expect(store.budgets).toBe(budgets);
		expect(store.canUndo(A)).toBe(true);
		expect(document.querySelectorAll('ul li')).toHaveLength(2);
	});

	it('on confirm removes only bubu: keys, leaves the other keys byte for byte, and shows the empty state', async () => {
		seed();
		keep();
		const store = newStore();
		const stopAutosave = new BudgetPersistence(store).start(); // as the app layout does: it must not write anything back
		await openDrawer(store);
		store.editItem(A, itemId(101), 'description', 'edited');

		await open();
		await confirm();
		await new Promise((resolve) => setTimeout(resolve, 50));
		stopAutosave();

		await expect.element(page.getByRole('dialog', { name: 'Clear all Bubu data?' })).not.toBeInTheDocument();
		expect(Object.keys(localStorage).sort()).toEqual(['other-app:settings', 'unrelated']);
		expect(localStorage.getItem('other-app:settings')).toBe('{"theme":"dark"}');
		expect(localStorage.getItem('unrelated')).toBe('x');
		await expect.element(page.getByText('No saved Budgets yet.')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'More actions' })).not.toBeInTheDocument(); // nothing left to clear
		expect(document.querySelectorAll('ul li')).toHaveLength(0);
		expect(store.budgets).toEqual([]);
		expect(store.canUndo(A)).toBe(false); // no stale history can bring a cleared Budget back
		await expect.element(page.getByRole('status')).toHaveTextContent('All Bubu data was cleared.');
		await expect.element(page.getByRole('dialog', { name: 'My budgets' })).toBeVisible(); // the drawer is still there, now empty
	});
});
