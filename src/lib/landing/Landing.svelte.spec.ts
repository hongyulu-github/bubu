import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { calculateBudget } from '../budget/calculate';
import { createBudget, createItem } from '../budget/model';
import { toString } from '../budget/numbers';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { createBubuStorage } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';
import { settled } from '../testing/motion';
import { templates } from '../templates/templates';
import Landing from './Landing.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function setup({ saved = true } = {}) {
	const fake = new FakeStorage();
	const storage = createBubuStorage(() => fake);
	if (saved) {
		storage.writeBudget(createBudget({ id: A, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00.000Z') }));
		storage.writeItems(A, [createItem({ id: '00000000-0000-4000-8000-000000000001', budgetId: A, description: 'Venue', unitPrice: '100' })]);
		storage.writeBudget(createBudget({ id: B, name: 'Renovation', currency: 'USD', now: new Date('2026-03-01T00:00:00.000Z') }));
		storage.writeItems(B, []);
	}
	const store = new BudgetStore({ storage, history: new CommandHistory() });
	store.hydrate();
	const navigate = vi.fn();
	const screen = render(Landing, { store, navigate });
	return { fake, store, navigate, landing: screen.component };
}

const mine = () => page.getByRole('button', { name: 'My budgets', exact: true });
const create = () => page.getByRole('button', { name: 'Create a budget', exact: true });
const drawer = (name: string) => page.getByRole('dialog', { name, exact: true });
const newInDrawer = () => page.getByRole('button', { name: 'New budget', exact: true });
const snapshot = (fake: FakeStorage) => JSON.stringify([...fake.data.entries()].sort());
const submit = async (name: string, currency = 'EUR') => {
	await page.getByLabelText('Name').fill(name);
	await page.getByLabelText('Currency').selectOptions(currency);
	await page.getByRole('button', { name: 'Create Budget', exact: true }).click();
};

beforeEach(() => localStorage.clear());
afterEach(() => {
	vi.restoreAllMocks();
	localStorage.clear();
});

describe('the Budgets drawer', () => {
	it('has exactly the labels "Create a budget" and "My budgets" on the page and "Close" in the drawer, and no "New budget" button in the list', async () => {
		setup();
		await expect.element(create()).toBeVisible();
		await expect.element(mine()).toBeVisible();
		await mine().click();
		await settled();
		await expect.element(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
		expect(newInDrawer().elements()).toHaveLength(0); // "Create a budget" on the page is the way to start one
		expect(page.getByRole('button', { name: /new budget/i }).elements()).toHaveLength(0);
	});

	it('is 28rem wide on a desktop, pinned to the right edge', async () => {
		const measure = async (width: number, height = 800) => {
			await page.viewport(width, height);
			const screen = render(Landing, { store: new BudgetStore({ history: new CommandHistory() }), navigate: vi.fn() });
			await mine().click();
		await settled();
			await expect.element(drawer('My budgets')).toBeVisible();
			const rect = page.getByRole('dialog').element().getBoundingClientRect();
			const window = document.documentElement.clientWidth; // the real width of the page: the test frame is not exactly what was asked
			screen.unmount();
			return { rect, window };
		};
		const wide = await measure(1920);
		expect(wide.rect.width).toBe(448);
		expect(Math.abs(wide.rect.right - wide.window)).toBeLessThanOrEqual(2); // pinned to the right edge
		const laptop = await measure(1440);
		expect(laptop.rect.width).toBe(448);
		const narrow = await measure(1024); // a third would be too narrow for the form: the minimum
		expect(narrow.rect.width).toBeCloseTo(28 * 16, 0);
		const phone = await measure(390); // the whole width
		expect(Math.abs(phone.rect.width - phone.window)).toBeLessThanOrEqual(2);
	});

	it('slides in smoothly from the right and ends in place, not jumping in', async () => {
		await page.viewport(1440, 900);
		setup();
		await mine().click();
		await expect.poll(() => document.getAnimations().length).toBeGreaterThan(0); // it is moving
		const drawer = page.getByRole('dialog').element();
		// somewhere between off-screen and in place at the start of the move, then exactly in place
		const clientWidth = document.documentElement.clientWidth;
		await settled();
		expect(Math.abs(drawer.getBoundingClientRect().right - clientWidth)).toBeLessThanOrEqual(2);
		expect(drawer.getBoundingClientRect().left).toBeLessThan(clientWidth - 400); // and it really is on the screen
	});

	it('puts the "⋯" menu in the header, to the right of the title, and nothing else but Close beside it', async () => {
		setup();
		await mine().click();
		await settled();
		const header = page.getByRole('dialog').element().querySelector('header')!;
		expect([...header.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual(['More actions', 'Close']);
	});

	it('can be opened from outside on either view, as the editor\'s back link and the old addresses do', async () => {
		const { landing } = setup();
		landing.show('list');
		await expect.element(drawer('My budgets')).toBeVisible();
		await page.getByRole('button', { name: 'Close', exact: true }).click();

		landing.show('new');
		await expect.element(drawer('New budget')).toBeVisible();
		await expect.element(page.getByLabelText('Name')).toBeVisible();
	});

	it('is closed to start with, and "My budgets" opens it on the saved Budgets without starting creation', async () => {
		setup();
		expect(page.getByRole('dialog').elements()).toHaveLength(0);
		await mine().click();
		await settled();

		await expect.element(drawer('My budgets')).toBeVisible();
		await expect.element(page.getByRole('link', { name: /Wedding/ })).toBeVisible();
		await expect.element(page.getByRole('link', { name: /Renovation/ })).toBeVisible();
		expect(page.getByLabelText('Name').elements()).toHaveLength(0); // no creation form
	});

	it('lists every saved Budget with its name, currency and Total, and links each to its own editor', async () => {
		setup();
		await mine().click();
		await settled();
		const wedding = page.getByRole('link', { name: /Wedding/ });
		await expect.element(wedding).toHaveAttribute('href', `/budgets/${A}`);
		await expect.element(wedding).toHaveTextContent('EUR');
		await expect.element(wedding).toHaveTextContent('€100.00');
		const renovation = page.getByRole('link', { name: /Renovation/ });
		await expect.element(renovation).toHaveAttribute('href', `/budgets/${B}`);
		await expect.element(renovation).toHaveTextContent('USD');
	});

	it('closes with the Close button, Escape or a click outside, and nothing about any Budget changes', async () => {
		const { fake, store } = setup();
		const before = snapshot(fake);
		const budgets = store.budgets;
		for (const close of [
			() => page.getByRole('button', { name: 'Close', exact: true }).click(),
			() => userEvent.keyboard('{Escape}'),
			// a click on the dimmed page reaches the dialog element itself, at a point outside the panel
			async () => void page.getByRole('dialog').element().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 }))
		]) {
			await mine().click();
		await settled();
			await expect.element(drawer('My budgets')).toBeVisible();
			await close();
			await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
			await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible(); // back on the landing page
		}
		expect(snapshot(fake)).toBe(before);
		expect(store.budgets).toBe(budgets);
	});

	it('returns focus to the "My budgets" button when it closes', async () => {
		setup();
		await mine().click();
		await settled();
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect.element(mine()).toHaveFocus();
	});

	it('shows the empty state in the drawer when nothing is saved, with no menu to clear', async () => {
		setup({ saved: false });
		await mine().click();
		await settled();
		await expect.element(page.getByText('No saved Budgets yet.')).toBeVisible();
		expect(page.getByRole('button', { name: 'More actions' }).elements()).toHaveLength(0);
	});
});

describe('creating a Budget from the page button', () => {
	it('"Create a budget" opens the drawer on the new-Budget form, not the list', async () => {
		setup();
		await create().click();
		await settled();
		await expect.element(drawer('New budget')).toBeVisible();
		await expect.element(page.getByLabelText('Name')).toBeVisible();
		await expect.element(page.getByLabelText('Currency')).toBeVisible();
		expect(page.getByRole('link', { name: /Wedding/ }).elements()).toHaveLength(0);
	});

	it('makes an empty Budget from the page button and opens its editor, with no Items and a zero grand total', async () => {
		const { store, navigate } = setup();
		await create().click();
		await settled();
		await submit('From the page', 'GBP');

		await expect.poll(() => navigate.mock.calls.length).toBe(1);
		const created = store.budgets.find((b) => b.name === 'From the page')!;
		expect(created).toMatchObject({ currency: 'GBP' });
		expect(navigate).toHaveBeenCalledWith(`/budgets/${created.id}`);
		expect(store.itemsOf(created.id)).toEqual([]); // an empty Item array, no starter template
		expect(toString(calculateBudget(store.itemsOf(created.id)).grandTotal)).toBe('0');
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('leaves the saved Budgets exactly as they were when one is created', async () => {
		const { store } = setup();
		const wedding = store.budgets.find((b) => b.id === A);
		const items = store.itemsOf(A);
		await create().click();
		await settled();
		await submit('Another');
		await expect.poll(() => store.budgets.length).toBe(3);
		expect(store.budgets.find((b) => b.id === A)).toBe(wedding);
		expect(store.itemsOf(A)).toBe(items);
	});

	it('checks the form as before: a blank name is not saved', async () => {
		const { store, navigate } = setup();
		await create().click();
		await settled();
		await page.getByRole('button', { name: 'Create Budget', exact: true }).click();
		await expect.element(page.getByText('Enter a name')).toBeVisible();
		expect(store.budgets).toHaveLength(2);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('Cancel closes the drawer and creates nothing', async () => {
		const { store, navigate } = setup();
		await create().click();
		await settled();
		await page.getByLabelText('Name').fill('Typed but not created');
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(store.budgets).toHaveLength(2);
		expect(navigate).not.toHaveBeenCalled();
	});

	it('keeps the template download and the Excel import in the form', async () => {
		setup();
		await create().click();
		await settled();
		await expect.element(page.getByRole('button', { name: 'Download an empty template' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Import an Excel workbook' })).toBeVisible();
	});
});

describe('selecting and managing Budgets in the drawer', () => {
	it('selecting a Budget follows its link to the unchanged editor route and changes nothing', async () => {
		const { fake, store } = setup();
		const before = snapshot(fake);
		const budgets = store.budgets;
		const stop = (event: Event) => event.preventDefault(); // stay on the test page: the route itself is covered end to end
		document.addEventListener('click', stop, true);
		try {
			await mine().click();
		await settled();
			for (const name of [/Wedding/, /Renovation/]) await page.getByRole('link', { name }).click();
		} finally {
			document.removeEventListener('click', stop, true);
		}
		expect(snapshot(fake)).toBe(before);
		expect(store.budgets).toBe(budgets);
	});

	it('keeps every list action: rename, duplicate and delete, from each Budget\'s menu', async () => {
		const { store } = setup();
		await mine().click();
		await settled();
		await page.getByRole('button', { name: 'Actions for Wedding' }).click();
		for (const item of ['Rename', 'Duplicate', 'Delete']) await expect.element(page.getByRole('menuitem', { name: item })).toBeVisible();

		await page.getByRole('menuitem', { name: 'Duplicate' }).click();
		await expect.poll(() => store.budgets.length).toBe(3);
		expect(store.budgets.map((b) => b.name)).toContain('Wedding (copy)');
		await expect.element(page.getByRole('link', { name: /Wedding \(copy\)/ })).toBeVisible();
	});

	it('keeps rename and delete working inside the drawer, with their own dialogs', async () => {
		const { store } = setup();
		await mine().click();
		await settled();

		await page.getByRole('button', { name: 'Actions for Renovation' }).click();
		await page.getByRole('menuitem', { name: 'Rename' }).click();
		await expect.element(page.getByRole('dialog', { name: /Rename/ })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();

		await page.getByRole('button', { name: 'Actions for Renovation' }).click();
		await page.getByRole('menuitem', { name: 'Delete' }).click();
		await page.getByRole('dialog', { name: /Delete/ }).getByRole('button', { name: 'Delete Budget' }).click();
		await expect.poll(() => store.budgets.length).toBe(1);
		await expect.element(drawer('My budgets')).toBeVisible(); // still open
	});

	it('keeps the "⋯" menu with Clear all BuBu data, hidden when nothing is saved', async () => {
		setup();
		await mine().click();
		await settled();
		await page.getByRole('button', { name: 'More actions' }).click();
		await expect.element(page.getByRole('menuitem', { name: 'Clear all BuBu data…' })).toBeVisible();
	});
});

describe('the template showcases', () => {
	it('open the new-Budget form for the chosen template, and creating nothing happens until it is submitted', async () => {
		const { fake, navigate } = setup({ saved: false });
		await page.getByRole('button', { name: 'Use template: Wedding' }).click();
		await expect.element(drawer('New budget')).toBeVisible();
		await expect.element(page.getByText('Starting from the Wedding template', { exact: false })).toBeVisible();
		await expect.element(page.getByLabelText('Name')).toHaveValue('Wedding'); // the name is offered, and editable
		expect(fake.data.size).toBe(0);
		expect(navigate).not.toHaveBeenCalled();
	});

	it.each([
		['Wedding', 'wedding', 0],
		['Home renovation', 'home-renovation', 1],
		['Travel', 'travel', 2]
	])('create the %s hierarchy in the chosen currency and open its editor', async (name, id, slide) => {
		const { store, navigate } = setup({ saved: false });
		for (let i = 0; i < slide; i++) await page.getByRole('button', { name: 'Next template' }).click();
		await page.getByRole('button', { name: `Use template: ${name}` }).click();
		await submit(`My ${name}`, 'DKK');
		await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
		const budget = store.budgets[0];
		expect(navigate).toHaveBeenCalledWith(`/budgets/${budget.id}`);
		expect(budget).toMatchObject({ name: `My ${name}`, currency: 'DKK' });
		expect(store.itemsOf(budget.id).length).toBe(templates.find((t) => t.id === id)!.items.length);
	});

	it('cancelling before creating leaves nothing behind, and normal creation afterwards is still empty', async () => {
		const { fake, store } = setup({ saved: false });
		await page.getByRole('button', { name: 'Use template: Wedding' }).click();
		await page.getByRole('button', { name: 'Cancel' }).click();
		await settled();
		expect(fake.data.size).toBe(0);

		await create().click();
		await expect.element(drawer('New budget')).toBeVisible();
		await settled();
		await expect.element(page.getByLabelText('Name')).toHaveValue(''); // not the template's name
		expect(page.getByText('Starting from the', { exact: false }).elements()).toHaveLength(0);
		await submit('Plain', 'EUR');
		await vi.waitFor(() => expect(store.budgets).toHaveLength(1));
		expect(store.itemsOf(store.budgets[0].id)).toHaveLength(0);
	});
});
