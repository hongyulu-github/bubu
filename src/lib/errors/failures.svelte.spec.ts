import { page, userEvent } from 'vitest/browser';
import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/theme.css';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem } from '../budget/model';
import BudgetEditorPage from '../budgets/BudgetEditorPage.svelte';
import SaveStatus from '../budgets/SaveStatus.svelte';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { BudgetPersistence } from '../state/persistence.svelte';
import { createBubuStorage } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';

const A = '11111111-1111-4111-8111-111111111111';
const ITEM = '00000000-0000-4000-8000-000000000001';

const stops: (() => void)[] = [];
let fake: FakeStorage;

/** A page session on a storage that can be made to fail, with the shared save status showing. */
function session() {
	const storage = createBubuStorage(() => fake);
	const store = new BudgetStore({ storage, history: new CommandHistory() });
	store.hydrate();
	store.setBudget(createBudget({ id: A, name: 'Wedding', currency: 'EUR' }), [createItem({ id: ITEM, budgetId: A, description: 'Venue', unitPrice: '100' })]);
	const persistence = new BudgetPersistence(store, storage);
	stops.push(persistence.start());
	flushSync();
	store.select(A);
	return { store, persistence, storage };
}

beforeEach(() => {
	fake = new FakeStorage();
	localStorage.clear();
});
afterEach(() => {
	while (stops.length) stops.pop()!();
	vi.restoreAllMocks();
});

describe('a storage failure', () => {
	it('is reported at once, never as a success, and the work stays on the page', async () => {
		const { store, persistence } = session();
		render(SaveStatus, { persistence });
		expect(page.getByRole('alert').elements()).toHaveLength(0); // saved: nothing to say
		fake.failWrite = new DOMException('full', 'QuotaExceededError');

		store.addTopLevelItem(A);
		flushSync();

		await expect.element(page.getByRole('alert')).toHaveTextContent('Your latest changes are not being saved');
		await expect.element(page.getByRole('alert')).toHaveTextContent("Your browser's storage is full");
		expect(document.body.innerText).not.toMatch(/all changes saved/i);
		expect(store.itemsOf(A)).toHaveLength(2); // still usable: the new Item is there, in memory
	});

	it('saves no partial Budget: a new Budget whose Items cannot be written is not left in storage', async () => {
		const { store, persistence, storage } = session();
		render(SaveStatus, { persistence });
		fake.failWrite = new DOMException('full', 'QuotaExceededError');
		const created = store.createBudget({ name: 'New plan', currency: 'USD' });
		flushSync();
		if (!created.ok) throw new Error('expected a Budget');

		await expect.element(page.getByRole('alert')).toBeVisible();
		const listing = storage.listBudgets();
		expect(listing.ok && listing.value.budgets.map((budget) => budget.id)).not.toContain(created.budget.id);
		expect(store.budgets.map((budget) => budget.id)).toContain(created.budget.id); // and it stays open on the page
	});

	it('goes away after a successful retry, and the data is then really saved', async () => {
		const { store, persistence, storage } = session();
		render(SaveStatus, { persistence });
		fake.failWrite = new DOMException('full', 'QuotaExceededError');
		store.addTopLevelItem(A);
		flushSync();
		await expect.element(page.getByRole('alert')).toBeVisible();

		fake.failWrite = null;
		await page.getByRole('button', { name: 'Try again' }).click();

		await expect.poll(() => page.getByRole('alert').elements().length).toBe(0);
		const items = storage.readItems(A);
		expect(items.ok && items.value).toHaveLength(2);
	});

	it('goes away by itself when the next change saves, with no manual retry', async () => {
		const { store, persistence } = session();
		render(SaveStatus, { persistence });
		fake.failWrite = new Error('blocked');
		store.addTopLevelItem(A);
		flushSync();
		await expect.element(page.getByRole('alert')).toBeVisible();

		fake.failWrite = null;
		store.addTopLevelItem(A);
		flushSync();
		await expect.poll(() => page.getByRole('alert').elements().length).toBe(0);
	});
});

describe('an Excel export failure', () => {
	it('names the operation, keeps the Budget usable, and clears on a later successful export', async () => {
		const { store } = session();
		const create = vi.spyOn(URL, 'createObjectURL').mockImplementationOnce(() => {
			throw new Error('blocked');
		});
		vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
		vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
		create.mockImplementation(() => 'blob:ok'); // the first try fails, the second works
		render(BudgetEditorPage, { budgetId: A, store });

		await page.getByRole('button', { name: 'Download as Excel' }).click();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Excel export failed');
		await expect.element(page.getByRole('alert')).toHaveTextContent('Your Budget is unchanged');

		await userEvent.fill(page.getByLabelText('Description 1', { exact: true }), 'Hall');
		await userEvent.keyboard('{Enter}');
		expect(store.itemsOf(A)[0].description).toBe('Hall'); // still editable

		await page.getByRole('button', { name: 'Download as Excel' }).click();
		await expect.poll(() => page.getByRole('alert').elements().length).toBe(0);
	});
});
