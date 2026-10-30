import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { bubuStorage, budgetKey, createBubuStorage } from '../storage/bubu';
import { BudgetStore } from '../state/budgets.svelte';
import BudgetEditorPage from './BudgetEditorPage.svelte';
import BudgetsList from './BudgetsList.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const MISSING = '33333333-3333-4333-8333-333333333333';

function item(budgetId: string, n: number, parent: number | null, description: string): Item {
	return createItem({
		id: `00000000-0000-4000-8000-${(budgetId === A ? 100 + n : 200 + n).toString().padStart(12, '0')}`,
		budgetId,
		parentId: parent === null ? null : `00000000-0000-4000-8000-${(budgetId === A ? 100 + parent : 200 + parent).toString().padStart(12, '0')}`,
		sortIndex: n,
		description
	});
}

function seed() {
	bubuStorage.writeBudget(
		createBudget({ id: A, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00Z') })
	);
	bubuStorage.writeItems(A, [item(A, 1, null, 'Venue'), item(A, 2, 1, 'Hall rental'), item(A, 3, null, 'Music')]);
	bubuStorage.writeBudget(
		createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date('2026-03-01T00:00:00Z') })
	);
	bubuStorage.writeItems(B, [item(B, 1, null, 'Paint'), item(B, 2, null, 'Flooring')]);
}

/** Code and Description of every row in the Budget table, e.g. "1.1 Hall rental". */
const outline = () =>
	[...document.querySelectorAll('table[aria-label="Budget Items"] tbody tr')].map((row) =>
		[...row.querySelectorAll('td')].slice(0, 2).map((cell) => cell.querySelector('input')?.value ?? cell.textContent?.trim()).join(' ')
	);

const newStore = (hydrate = true) => {
	const store = new BudgetStore({ history: new CommandHistory() });
	if (hydrate) store.hydrate();
	return store;
};

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('BudgetsList', () => {
	it('shows every saved Budget with its name and currency, most recently changed first', async () => {
		seed();
		render(BudgetsList, { store: newStore() });

		const links = page.getByRole('list').getByRole('link');
		await expect.element(links.nth(0)).toHaveTextContent('Renovation');
		await expect.element(links.nth(0)).toHaveTextContent('USD');
		await expect.element(links.nth(1)).toHaveTextContent('Wedding');
		await expect.element(links.nth(1)).toHaveTextContent('EUR');
		expect(document.querySelectorAll('main ul li')).toHaveLength(2);
	});

	it('links each Budget to its own editor route by UUID', async () => {
		seed();
		render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toHaveAttribute('href', `/budgets/${A}`);
		await expect.element(page.getByRole('link', { name: /Renovation/ })).toHaveAttribute('href', `/budgets/${B}`);
	});

	it('offers a New Budget link to the create form', async () => {
		render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('link', { name: 'New Budget' })).toHaveAttribute('href', '/budgets/new');
	});

	it('duplicates a Budget from the list and shows the copy next to the original', async () => {
		seed();
		const store = newStore();
		render(BudgetsList, { store });
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toBeVisible();

		await page.getByRole('button', { name: 'Duplicate Wedding' }).click();

		await expect.element(page.getByRole('link', { name: /Wedding \(copy\)/ })).toBeVisible();
		expect(document.querySelectorAll('main ul li')).toHaveLength(3);
		await expect.element(page.getByRole('link', { name: /^Wedding EUR/ })).toBeVisible(); // the original is still there
		expect(store.budgets).toHaveLength(3);
		const copy = store.budgets.find((b) => b.name === 'Wedding (copy)')!;
		await expect.element(page.getByRole('link', { name: /Wedding \(copy\)/ })).toHaveAttribute('href', `/budgets/${copy.id}`);
		await expect.element(page.getByRole('link', { name: /Wedding \(copy\)/ })).toHaveFocus();
		await expect.element(page.getByRole('status')).toHaveTextContent('Duplicated “Wedding” as “Wedding (copy)”.');
	});

	it('keeps the original and the copy independent after duplicating', async () => {
		seed();
		const store = newStore();
		render(BudgetsList, { store });
		await page.getByRole('button', { name: 'Duplicate Wedding' }).click();

		const copy = store.budgets.find((b) => b.name === 'Wedding (copy)')!;
		const originalBefore = store.itemsOf(A);
		store.editItem(copy.id, store.itemsOf(copy.id)[0].id, 'description', 'edited copy');

		expect(store.itemsOf(A)).toBe(originalBefore);
		expect(store.canUndo(A)).toBe(false);
		expect(store.canUndo(copy.id)).toBe(true);
	});

	it('offers Duplicate for every Budget, each named for its Budget', async () => {
		seed();
		render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('button', { name: 'Duplicate Wedding' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Duplicate Renovation' })).toBeVisible();
	});

	it('duplicates an empty Budget as an empty Budget', async () => {
		seed(); // Renovation has Items; create a blank one in the store
		const store = newStore();
		const blank = store.createBudget({ name: 'Blank', currency: 'USD' });
		if (!blank.ok) throw new Error('creation failed');
		render(BudgetsList, { store });
		await page.getByRole('button', { name: 'Duplicate Blank' }).click();
		const copy = store.budgets.find((b) => b.name === 'Blank (copy)')!;
		expect(store.itemsOf(copy.id)).toEqual([]);
	});

	it('shows a loading state before hydration and an empty state with no Budgets', async () => {
		const store = newStore(false);
		render(BudgetsList, { store });
		await expect.element(page.getByRole('status')).toHaveTextContent('Loading your Budgets');

		store.hydrate();
		await expect.element(page.getByText('No saved Budgets yet.')).toBeVisible();
	});

	it('reports unavailable storage', async () => {
		render(BudgetsList, { store: hydrated(createBubuStorage(() => null)) });
		await expect.element(page.getByRole('alert')).toHaveTextContent('Browser storage is not available');
	});

	it('lists readable Budgets and warns about an unreadable one', async () => {
		seed();
		localStorage.setItem(budgetKey(MISSING), '{broken');
		render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('alert')).toHaveTextContent('1 saved Budget could not be loaded');
		expect(document.querySelectorAll('main ul li')).toHaveLength(2);
	});

	it('hydrates again after a reload (a new store reads the same saved Budgets)', async () => {
		seed();
		const first = render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toBeVisible();
		first.unmount();

		render(BudgetsList, { store: newStore() });
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toBeVisible();
		await expect.element(page.getByRole('link', { name: /Renovation/ })).toBeVisible();
	});
});

function hydrated(storage: ReturnType<typeof createBubuStorage>) {
	const store = new BudgetStore({ storage, history: new CommandHistory() });
	store.hydrate();
	return store;
}

describe('BudgetEditorPage', () => {
	it('opens the Budget named by the route with only its own Items', async () => {
		seed();
		render(BudgetEditorPage, { budgetId: A, store: newStore() });

		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await expect.element(page.getByText('EUR', { exact: true })).toBeVisible();
		const items = outline();
		expect(items).toEqual(['1 Venue', '1.1 Hall rental', '2 Music']);
		expect(outline().join('|')).not.toContain('Paint'); // Items live in inputs, so check their values
	});

	it('keeps two Budget routes from mixing Items when the route changes', async () => {
		seed();
		const store = newStore();
		const view = render(BudgetEditorPage, { budgetId: A, store });
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();

		await view.rerender({ budgetId: B, store });
		await expect.element(page.getByRole('heading', { name: 'Renovation' })).toBeVisible();
		const items = outline();
		expect(items).toEqual(['1 Paint', '2 Flooring']);
		expect(store.activeBudgetId).toBe(B);
	});

	it('keeps command history isolated between Budget routes and retained when navigating back', async () => {
		seed();
		const store = newStore();
		const view = render(BudgetEditorPage, { budgetId: A, store });
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();

		store.execute(A, [...store.itemsOf(A), item(A, 9, null, 'Cake')]);
		await expect.poll(outline).toContain('3 Cake');
		expect(store.canUndo(A)).toBe(true);

		await view.rerender({ budgetId: B, store });
		await expect.element(page.getByRole('heading', { name: 'Renovation' })).toBeVisible();
		expect(store.canUndo(B)).toBe(false);
		expect(outline().join('|')).not.toContain('Cake');

		await view.rerender({ budgetId: A, store });
		await expect.poll(outline).toContain('3 Cake');
		expect(store.canUndo(A)).toBe(true);
		expect(store.undo(A)).toBe(true);
		await expect.poll(outline).not.toContain('3 Cake');
	});

	it('handles a missing id without selecting any other Budget', async () => {
		seed();
		const store = newStore();
		render(BudgetEditorPage, { budgetId: MISSING, store });

		await expect.element(page.getByRole('heading', { name: 'Budget not found' })).toBeVisible();
		expect(store.activeBudgetId).toBeNull();
		expect(store.activeBudget).toBeNull();
		expect(document.body.textContent).not.toContain('Wedding');
		expect(document.querySelector('table')).toBeNull(); // no Items of any Budget
		await expect.element(page.getByRole('link', { name: /All Budgets/ })).toHaveAttribute('href', '/budgets');
	});

	it('treats a malformed id as missing', async () => {
		seed();
		const store = newStore();
		render(BudgetEditorPage, { budgetId: 'not-a-uuid', store });
		await expect.element(page.getByRole('heading', { name: 'Budget not found' })).toBeVisible();
		expect(store.activeBudgetId).toBeNull();
	});

	it('shows loading before hydration, then the Budget; selection is cleared on leaving', async () => {
		seed();
		const store = newStore(false);
		const view = render(BudgetEditorPage, { budgetId: A, store });
		await expect.element(page.getByRole('status')).toHaveTextContent('Loading Budget');
		expect(document.body.textContent).not.toContain('Budget not found');

		store.hydrate();
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		expect(store.activeBudgetId).toBe(A);

		view.unmount();
		expect(store.activeBudgetId).toBeNull();
	});

	it('distinguishes a damaged Budget from a missing one', async () => {
		seed();
		localStorage.setItem(budgetKey(MISSING), '{broken');
		const store = newStore();
		render(BudgetEditorPage, { budgetId: MISSING, store });
		await expect.element(page.getByRole('heading', { name: 'This Budget could not be loaded' })).toBeVisible();
		expect(localStorage.getItem(budgetKey(MISSING))).toBe('{broken');
	});

	it('shows hydration from a reload: a new store opens the same Budget', async () => {
		seed();
		const first = render(BudgetEditorPage, { budgetId: B, store: newStore() });
		await expect.element(page.getByRole('heading', { name: 'Renovation' })).toBeVisible();
		first.unmount();

		render(BudgetEditorPage, { budgetId: B, store: newStore() });
		await expect.element(page.getByRole('heading', { name: 'Renovation' })).toBeVisible();
		await expect.poll(outline).toContain('2 Flooring');
	});
});
