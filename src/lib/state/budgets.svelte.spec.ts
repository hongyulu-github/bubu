import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBudget, createItem, type Item } from '../budget/model';
import { toString } from '../budget/numbers';
import { CommandHistory } from '../history/commands';
import { budgetKey, createBubuStorage, itemsKey, bubuStorage } from '../storage/bubu';
import { BudgetStore } from './budgets.svelte';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

function item(budgetId: string, n: number, parent: number | null, unitPrice: string, quantity = '1', sortIndex = n): Item {
	return createItem({
		id: uuid(n),
		budgetId,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		unitPrice,
		quantity,
		description: `item ${n}`
	});
}

const clock = () => new Date('2026-05-06T07:08:09.000Z');
const budget = (id: string, name: string) => createBudget({ id, name, currency: 'EUR', now: new Date('2026-01-01T00:00:00.000Z') });

// Outer (x2) = Inner (x3) of [10 x1, 5 x2] + Line 7: inner 60, outer 134.
const nestedA = (): Item[] => [
	item(A, 1, null, '0', '2'),
	item(A, 2, 1, '0', '3'),
	item(A, 3, 2, '10'),
	item(A, 4, 2, '5', '2'),
	item(A, 5, 1, '7')
];

function newStore(options: ConstructorParameters<typeof BudgetStore>[0] = {}) {
	return new BudgetStore({ now: clock, history: new CommandHistory(), ...options });
}

function seedStorage() {
	bubuStorage.writeBudget(budget(A, 'Wedding'));
	bubuStorage.writeItems(A, nestedA());
	bubuStorage.writeBudget(budget(B, 'Renovation'));
}

/** Observe `read` the way a component would (through $derived) and collect each distinct value. */
function watch<T>(read: () => T) {
	const values: T[] = [];
	const stop = $effect.root(() => {
		const value = $derived.by(read);
		$effect(() => {
			values.push(value);
		});
	});
	flushSync();
	return { values, stop };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('hydration', () => {
	it('starts empty and does not touch storage until hydrate() is called', () => {
		seedStorage();
		const getItem = vi.spyOn(Storage.prototype, 'getItem');
		const key = vi.spyOn(Storage.prototype, 'key');

		const store = new BudgetStore();
		expect(store.hydrationStatus).toBe('idle');
		expect(store.budgets).toEqual([]);
		expect(getItem).not.toHaveBeenCalled();
		expect(key).not.toHaveBeenCalled();

		store.hydrate();
		expect(getItem).toHaveBeenCalled();
	});

	it('loads shared Budget documents and flat Item arrays', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();

		expect(store.hydrationStatus).toBe('ready');
		expect(store.budgets.map((b) => b.name).sort()).toEqual(['Renovation', 'Wedding']);
		expect(store.itemsOf(A)).toEqual(nestedA());
		expect(store.itemsOf(B)).toEqual([]);
		expect(store.loadIssues).toEqual([]);
	});

	it('leaves out unreadable Budgets, reports them and leaves their data untouched', () => {
		seedStorage();
		localStorage.setItem(budgetKey(B), '{broken');
		localStorage.setItem(itemsKey(A), JSON.stringify({ version: 99, data: [] }));
		const store = newStore();
		store.hydrate();

		expect(store.budgets).toEqual([]);
		expect(store.loadIssues.map((i) => [i.budgetId, i.error.kind]).sort()).toEqual([
			[A, 'unsupported-version'],
			[B, 'corrupt']
		]);
		expect(localStorage.getItem(budgetKey(B))).toBe('{broken');
	});

	it('reports unavailable storage without throwing', () => {
		const store = newStore({ storage: createBubuStorage(() => null) });
		store.hydrate();
		expect(store.hydrationStatus).toBe('unavailable');
		expect(store.loadIssues[0].error.kind).toBe('unavailable');
		expect(store.budgets).toEqual([]);
	});
});

describe('reactive derived data', () => {
	it('derives the ordered model, Codes, Group values and grand total from the active Items', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);

		expect(store.rows.map((row) => [row.code, row.kind, row.depth])).toEqual([
			['1', 'group', 0],
			['1.1', 'group', 1],
			['1.1.1', 'line', 2],
			['1.1.2', 'line', 2],
			['1.2', 'line', 1]
		]);
		expect(toString(store.rows[1].amounts.unitPrice)).toBe('20');
		expect(toString(store.rows[1].amounts.total)).toBe('60');
		expect(toString(store.rows[0].amounts.total)).toBe('134');
		expect(toString(store.grandTotal)).toBe('134');
	});

	it('instantly recomputes everything when a nested Item is edited', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		const grand = watch(() => toString(store.grandTotal));
		const codes = watch(() => store.rows.map((row) => row.code).join(','));

		// Inner Group quantity 3 -> 4: inner 80, outer (80 + 7) x 2 = 174.
		const edited = store.itemsOf(A).map((i) => (i.id === uuid(2) ? { ...i, quantity: '4' } : i));
		expect(store.execute(A, edited)).toEqual({ ok: true });
		flushSync();
		expect(grand.values).toEqual(['134', '174']);
		expect(codes.values).toEqual(['1,1.1,1.1.1,1.1.2,1.2']); // outline unchanged by a quantity edit

		// Move the 5 x2 Line out to top level: Codes and totals recompute together.
		const moved = store.itemsOf(A).map((i) => (i.id === uuid(4) ? { ...i, parentId: null, sortIndex: 9 } : i));
		store.execute(A, moved);
		flushSync();
		expect(codes.values).toEqual(['1,1.1,1.1.1,1.1.2,1.2', '1,1.1,1.1.1,1.2,2']);
		expect(toString(store.grandTotal)).toBe('104'); // outer (4 x 10 + 7) x 2 = 94, plus the moved 5 x 2 = 10

		grand.stop();
		codes.stop();
	});

	it('shows an empty model before a Budget is selected', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		expect(store.rows).toEqual([]);
		expect(toString(store.grandTotal)).toBe('0');
		expect(store.activeBudget).toBeNull();
	});

	it('replacing an Item array with setItems recomputes without recording history', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(B);
		const grand = watch(() => toString(store.grandTotal));

		store.setItems(B, [item(B, 1, null, '-12.50', '2')]);
		flushSync();
		expect(grand.values).toEqual(['0', '-25.00']);
		expect(store.canUndo(B)).toBe(false);
		grand.stop();
	});

	it('holds no duplicate copies: derived rows point at the Items held in state', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);

		expect(store.items).toBe(store.itemsOf(A));
		for (const row of store.rows) expect(store.items).toContain(row.item);
		expect(store.tree).toBe(store.tree); // cached until something changes
		expect(Object.keys(store.items[0])).not.toContain('code');
	});

	it('rejects invalid arrays without changing state or history', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		const before = store.items;

		const dangling = [...before, item(A, 9, 99, '1')];
		const result = store.execute(A, dangling);
		expect(result).toMatchObject({ ok: false, reason: 'invalid' });
		expect(result.ok === false && result.issues[0].code).toBe('dangling-parent');
		expect(store.items).toBe(before);
		expect(store.canUndo(A)).toBe(false);

		expect(store.execute(uuid(777), [])).toMatchObject({ ok: false, reason: 'unknown-budget' });
		expect(store.setItems(A, [{ ...before[0], quantity: '-1' }])).toMatchObject({ ok: false });
	});

	it('does not write anything to storage (persistence is wired elsewhere)', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		const snapshot = JSON.stringify({ ...localStorage });
		store.execute(A, store.itemsOf(A).map((i) => ({ ...i, description: 'changed' })));
		store.undo(A);
		expect(JSON.stringify({ ...localStorage })).toBe(snapshot);
	});
});

describe('history and Budget switching', () => {
	function twoBudgets() {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		return store;
	}

	it('undoes and redoes through state, restoring full arrays', () => {
		const store = twoBudgets();
		store.select(A);
		const original = store.items;
		store.execute(A, [...original, item(A, 6, null, '1')]);
		expect(store.items).toHaveLength(6);

		expect(store.undo(A)).toBe(true);
		expect(store.items).toEqual(original);
		expect(toString(store.grandTotal)).toBe('134');

		expect(store.redo(A)).toBe(true);
		expect(store.items).toHaveLength(6);
		expect(toString(store.grandTotal)).toBe('135');
		expect(store.redo(A)).toBe(false);
	});

	it('keeps isolated history per Budget and retains it when switching', () => {
		const store = twoBudgets();
		store.select(A);
		store.execute(A, store.itemsOf(A).map((i) => ({ ...i, description: 'A edit' })));
		store.select(B);
		store.execute(B, store.itemsOf(B).map((i) => ({ ...i, unitPrice: '250' })));
		store.execute(B, store.itemsOf(B).map((i) => ({ ...i, unitPrice: '300' })));

		store.select(A);
		expect(store.canUndo(A)).toBe(true);
		expect(store.canUndo(B)).toBe(true);

		expect(store.undo(A)).toBe(true);
		expect(store.canUndo(A)).toBe(false);
		expect(store.itemsOf(B)[0].unitPrice).toBe('300'); // B untouched by A's undo

		store.select(B);
		expect(store.undo(B)).toBe(true);
		expect(store.itemsOf(B)[0].unitPrice).toBe('250');
		expect(store.canRedo(B)).toBe(true);
		expect(store.canRedo(A)).toBe(true); // A's own undone command is still redoable
		expect(toString(store.grandTotal)).toBe('250');
	});

	it('keeps canUndo/canRedo reactive', () => {
		const store = twoBudgets();
		store.select(A);
		const undoable = watch(() => store.canUndo(A));
		const redoable = watch(() => store.canRedo(A));

		store.execute(A, store.itemsOf(A).map((i) => ({ ...i, description: 'x' })));
		flushSync();
		store.undo(A);
		flushSync();
		expect(undoable.values).toEqual([false, true, false]);
		expect(redoable.values).toEqual([false, true]);
		undoable.stop();
		redoable.stop();
	});

	it('starts a fresh page session with empty stacks', () => {
		const first = twoBudgets();
		first.select(A);
		first.execute(A, first.itemsOf(A).map((i) => ({ ...i, description: 'x' })));
		expect(first.canUndo(A)).toBe(true);

		const reloaded = new BudgetStore({ history: new CommandHistory() });
		reloaded.hydrate();
		expect(reloaded.canUndo(A)).toBe(false);
		expect(reloaded.canRedo(A)).toBe(false);
		expect(reloaded.undo(A)).toBe(false);
	});

	it('bumps updatedAt on edits and undo/redo, but not on hydration', () => {
		const store = twoBudgets();
		const created = '2026-01-01T00:00:00.000Z';
		expect(store.budgets.find((b) => b.id === A)?.updatedAt).toBe(created);

		store.execute(A, store.itemsOf(A).map((i) => ({ ...i, description: 'x' })));
		expect(store.budgets.find((b) => b.id === A)?.updatedAt).toBe('2026-05-06T07:08:09.000Z');
		expect(store.budgets.find((b) => b.id === B)?.updatedAt).toBe(created);
	});
});

describe('createBudget', () => {
	it('adds one root Budget with no Items and a zero grand total, without selecting it', () => {
		const store = newStore();
		const result = store.createBudget({ name: '  Wedding ', currency: 'EUR' });

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(store.budgets).toEqual([result.budget]);
		expect(result.budget).toMatchObject({ name: 'Wedding', currency: 'EUR' });
		expect(result.budget.createdAt).toBe('2026-05-06T07:08:09.000Z'); // the store's clock
		expect(store.itemsOf(result.budget.id)).toEqual([]);
		expect(store.activeBudgetId).toBeNull();

		store.select(result.budget.id);
		expect(store.rows).toEqual([]);
		expect(toString(store.grandTotal)).toBe('0');
		expect(store.canUndo(result.budget.id)).toBe(false);
	});

	it('rejects invalid input and changes nothing', () => {
		const store = newStore();
		expect(store.createBudget({ name: '   ', currency: 'EUR' })).toEqual({
			ok: false,
			errors: { name: 'Enter a name for the Budget.' }
		});
		expect(store.createBudget({ name: 'x', currency: '' })).toMatchObject({ ok: false });
		expect(store.budgets).toEqual([]);
	});

	it('creates independent Budgets that do not share Items or history', () => {
		const store = newStore();
		const first = store.createBudget({ name: 'One', currency: 'EUR' });
		const second = store.createBudget({ name: 'Two', currency: 'USD' });
		if (!first.ok || !second.ok) throw new Error('creation failed');
		expect(first.budget.id).not.toBe(second.budget.id);

		store.execute(first.budget.id, [item(first.budget.id, 1, null, '5')]);
		expect(store.itemsOf(second.budget.id)).toEqual([]);
		expect(store.canUndo(first.budget.id)).toBe(true);
		expect(store.canUndo(second.budget.id)).toBe(false);
	});
});

describe('Budget documents', () => {
	it('adds, replaces and removes Budgets in shared state', () => {
		const store = newStore();
		expect(store.setBudget(budget(A, 'One'), [item(A, 1, null, '5')])).toEqual({ ok: true });
		store.select(A);
		expect(toString(store.grandTotal)).toBe('5');

		store.setBudget({ ...budget(A, 'One renamed') });
		expect(store.activeBudget?.name).toBe('One renamed');
		expect(toString(store.grandTotal)).toBe('5'); // Items kept when only the document is replaced

		store.removeBudget(A);
		expect(store.budgets).toEqual([]);
		expect(store.activeBudget).toBeNull();
		expect(store.rows).toEqual([]);
	});

	it('rejects invalid documents', () => {
		const store = newStore();
		expect(store.setBudget({ ...budget(A, 'x'), currency: 'euro' })).toMatchObject({ ok: false, reason: 'invalid' });
		expect(store.budgets).toEqual([]);
	});
});
