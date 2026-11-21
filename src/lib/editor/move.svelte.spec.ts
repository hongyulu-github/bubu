import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import BudgetEditorPage from '../budgets/BudgetEditorPage.svelte';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { BudgetPersistence } from '../state/persistence.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function item(n: number, parent: number | null, unitPrice: string, quantity = '1', extra: Partial<Item> = {}): Item {
	return createItem({
		id: uuid(n),
		budgetId: A,
		parentId: parent === null ? null : uuid(parent),
		sortIndex: n,
		description: `Item ${n}`,
		unitPrice,
		quantity,
		...extra
	});
}

function openStore(items: Item[]) {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate();
	store.setBudget(createBudget({ id: A, name: 'Wedding', currency: 'EUR' }), items);
	store.select(A);
	return store;
}

const row = (n: number) => document.querySelector<HTMLElement>(`tr[data-item-id="${uuid(n)}"]`)!;
const codes = () => [...document.querySelectorAll('tbody tr')].map((r) => r.getAttribute('data-code'));
const ids = () => [...document.querySelectorAll('tbody tr')].map((r) => Number(r.getAttribute('data-item-id')!.slice(-12)));
const grandTotal = () => page.getByLabelText('Grand total');
const dialog = () => page.getByRole('dialog', { name: /into a group\?/ });
const itemsOf = (store: BudgetStore) => store.itemsOf(A);
const byId = (store: BudgetStore, n: number) => itemsOf(store).find((i) => i.id === uuid(n))!;
const undo = () => userEvent.keyboard('{Control>}z{/Control}');
const redo = () => userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');

async function drop(from: number, onto: number, fraction: number, x = 300) {
	await userEvent.dragAndDrop(page.elementLocator(row(from).querySelector('[data-drag-handle]')!), page.elementLocator(row(onto)), {
		targetPosition: { x, y: row(onto).getBoundingClientRect().height * fraction }
	});
}
const BEFORE = 0.05;
const INSIDE = 0.5;
const AFTER = 0.85;

// 1 Group (2 Line, 3 Line); 4 Line; 5 Group (6 Line, only child); 7 Line "Music" (-250.5 x 3).
const sample = () => [
	item(1, null, '0'),
	item(2, 1, '10'),
	item(3, 1, '20'),
	item(4, null, '5'),
	item(5, null, '0', '2'),
	item(6, 5, '-40'),
	item(7, null, '-250.5', '3', { description: 'Music', unit: 'days' })
];

const stops: (() => void)[] = [];
/** Run the real autosave for this store, as the app layout does. */
function autosave(store: BudgetStore) {
	stops.push(new BudgetPersistence(store).start());
}
const saved = () => JSON.stringify({ ...localStorage });

beforeEach(() => localStorage.clear());
afterEach(() => {
	stops.splice(0).forEach((stop) => stop());
	localStorage.clear();
});

describe('moving rows by pointer', () => {
	it('reorders siblings as one command, refreshing Codes at once, and undoes and redoes with the shortcuts', async () => {
		const store = openStore(sample());
		render(BudgetEditorPage, { budgetId: A, store });
		expect(ids()).toEqual([1, 2, 3, 4, 5, 6, 7]);

		await drop(3, 2, BEFORE);
		expect(ids()).toEqual([1, 3, 2, 4, 5, 6, 7]);
		expect(codes()).toEqual(['1', '1.1', '1.2', '2', '3', '3.1', '4']);
		expect(document.querySelector('[data-drop]')).toBeNull(); // no marker left over after the drop

		await undo();
		expect(ids()).toEqual([1, 2, 3, 4, 5, 6, 7]);
		expect(store.canUndo(A)).toBe(false); // exactly one command
		await redo();
		expect(ids()).toEqual([1, 3, 2, 4, 5, 6, 7]);
		expect(store.canRedo(A)).toBe(false);
	});

	it('moves an Item across parents and to the top level, and undo restores the subtree and identities', async () => {
		const store = openStore(sample());
		const before = itemsOf(store);
		render(BudgetEditorPage, { budgetId: A, store });

		await drop(4, 1, INSIDE); // into the existing Group 1: no warning
		expect(document.querySelector('dialog[open]')).toBeNull();
		expect(byId(store, 4).parentId).toBe(uuid(1));
		await drop(2, 7, AFTER); // 2 up to the top level, after Music
		expect(byId(store, 2).parentId).toBeNull();
		expect(ids().slice(-1)).toEqual([2]);

		await undo();
		await undo();
		expect(itemsOf(store)).toEqual(before);
		expect(store.canUndo(A)).toBe(false);
	});

	it('moves a child out as a sibling after its parent, by dropping left of the parent\'s last row, and undoes it', async () => {
		const store = openStore(sample());
		const before = itemsOf(store);
		render(BudgetEditorPage, { budgetId: A, store });

		await drop(2, 3, AFTER, 8); // 3 is the last child of Group 1: left of it means after Group 1
		expect(byId(store, 2).parentId).toBeNull();
		expect(ids()).toEqual([1, 3, 2, 4, 5, 6, 7]);
		expect(codes()).toEqual(['1', '1.1', '2', '3', '4', '4.1', '5']);

		await undo();
		expect(itemsOf(store)).toEqual(before);
	});

	it('moves a Group with its whole subtree', async () => {
		const store = openStore(sample());
		render(BudgetEditorPage, { budgetId: A, store });
		await drop(5, 1, BEFORE);
		expect(ids()).toEqual([5, 6, 1, 2, 3, 4, 7]);
		expect(byId(store, 6).parentId).toBe(uuid(5));
	});

	it('turns the former parent into a Line at 0 when its last child leaves, refreshing the negative roll-up, and undoes it', async () => {
		const store = openStore(sample());
		render(BudgetEditorPage, { budgetId: A, store });
		await expect.element(grandTotal()).toHaveTextContent('-€796.50'); // 30 + 5 - 80 - 751.5

		await drop(6, 4, AFTER); // 6 is the only child of Group 5 (Quantity 2)
		expect(byId(store, 6).parentId).toBeNull();
		expect(byId(store, 5)).toMatchObject({ unitPrice: '0', quantity: '2', description: 'Item 5' });
		await expect.poll(() => row(5).querySelector('td[data-cell$="unitPrice"] input')).not.toBeNull(); // a Line again
		await expect.element(grandTotal()).toHaveTextContent('-€756.50'); // 30 + 5 - 40 + 0 - 751.5
		expect(document.querySelector('[data-drop]')).toBeNull();

		await undo();
		await expect.poll(() => row(5).querySelector('td[data-cell$="unitPrice"] input')).toBeNull(); // a Group again
		expect(byId(store, 6).parentId).toBe(uuid(5));
		await expect.element(grandTotal()).toHaveTextContent('-€796.50');
	});

	it('warns before dropping into a Line, then converts it keeping Quantity, Description and Unit, in one undoable step', async () => {
		const store = openStore(sample());
		const before = itemsOf(store);
		render(BudgetEditorPage, { budgetId: A, store });

		await drop(4, 7, INSIDE);
		await expect.element(dialog()).toBeVisible();
		await expect.element(page.getByRole('dialog').getByText('-250.5', { exact: true })).toBeVisible();
		expect(itemsOf(store)).toBe(before); // nothing changed while asking

		await page.getByRole('button', { name: 'Convert and move item' }).click();
		await expect.poll(() => byId(store, 4).parentId).toBe(uuid(7));
		expect(byId(store, 7)).toMatchObject({ unitPrice: '0', quantity: '3', unit: 'days', description: 'Music' });
		await expect.element(grandTotal()).toHaveTextContent('-€35.00'); // 30 - 80 + 5 x 3

		await undo();
		expect(itemsOf(store)).toEqual(before);
		expect(byId(store, 7).unitPrice).toBe('-250.5');
		expect(store.canUndo(A)).toBe(false);
	});

	it('changes nothing and records nothing when the warning is cancelled, by button or Escape', async () => {
		const store = openStore(sample());
		const before = itemsOf(store);
		render(BudgetEditorPage, { budgetId: A, store });

		await drop(4, 7, INSIDE);
		await page.getByRole('button', { name: 'Cancel' }).click();
		await expect.element(dialog()).not.toBeInTheDocument();
		await drop(4, 7, INSIDE);
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).not.toBeInTheDocument();

		expect(itemsOf(store)).toBe(before);
		expect(store.canUndo(A)).toBe(false);
		await expect.element(grandTotal()).toHaveTextContent('-€796.50');
	});

	it('ignores a move into its own descendant and a move that changes nothing, saving nothing', async () => {
		const store = openStore(sample());
		const before = itemsOf(store);
		autosave(store);
		render(BudgetEditorPage, { budgetId: A, store });
		const untouched = saved(); // loaded Budgets count as already saved: nothing is written until something changes

		await drop(1, 2, INSIDE); // Group 1 into its own child
		await drop(1, 3, AFTER);
		await drop(5, 7, BEFORE); // 5 is already just before 7
		expect(document.querySelector('dialog[open]')).toBeNull();
		expect(itemsOf(store)).toBe(before);
		expect(store.canUndo(A)).toBe(false);
		expect(saved()).toBe(untouched);
	});

	it('undoes and redoes with Cmd+Z and Cmd+Shift+Z too', async () => {
		const store = openStore(sample());
		render(BudgetEditorPage, { budgetId: A, store });
		await drop(3, 2, BEFORE);
		await userEvent.keyboard('{Meta>}z{/Meta}');
		expect(ids()).toEqual([1, 2, 3, 4, 5, 6, 7]);
		await userEvent.keyboard('{Meta>}{Shift>}z{/Shift}{/Meta}');
		expect(ids()).toEqual([1, 3, 2, 4, 5, 6, 7]);
	});

	it('saves a move and its undo, so a reload shows exactly the same Items', async () => {
		const store = openStore(sample());
		autosave(store);
		render(BudgetEditorPage, { budgetId: A, store });
		await drop(6, 4, AFTER);
		const reload = () => {
			const fresh = new BudgetStore({ history: new CommandHistory() });
			fresh.hydrate();
			return fresh.itemsOf(A);
		};
		await expect.poll(reload).toEqual(itemsOf(store));

		await undo();
		await expect.poll(reload).toEqual(sample());
	});

	it('only touches the open Budget: another Budget keeps its Items and history', async () => {
		const store = openStore(sample());
		const other = createItem({ id: uuid(901), budgetId: B, sortIndex: 0, description: 'B item', unitPrice: '2' });
		store.setBudget(createBudget({ id: B, name: 'Other', currency: 'EUR' }), [other]);
		render(BudgetEditorPage, { budgetId: A, store });

		await drop(3, 2, BEFORE);
		expect(store.canUndo(A)).toBe(true);
		expect(store.canUndo(B)).toBe(false);
		expect(store.itemsOf(B)).toEqual([other]);
	});
});
