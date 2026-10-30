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

describe('editItem', () => {
	function openA() {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		return store;
	}
	const LINE_10 = uuid(3); // 10 x 1 inside the inner Group
	const INNER = uuid(2);

	it('commits a valid edit as exactly one history command and refreshes the roll-ups', () => {
		const store = openA();
		expect(toString(store.grandTotal)).toBe('134');

		expect(store.editItem(A, LINE_10, 'unitPrice', '-20')).toMatchObject({ ok: true, changed: true });
		// inner unit -20 + 10 = -10, total -30; outer (-30 + 7) x 2 = -46
		expect(toString(store.grandTotal)).toBe('-46');
		expect(store.itemsOf(A).find((i) => i.id === LINE_10)?.unitPrice).toBe('-20');

		expect(store.undo(A)).toBe(true);
		expect(store.canUndo(A)).toBe(false); // one edit was one command
		expect(store.itemsOf(A).find((i) => i.id === LINE_10)?.unitPrice).toBe('10');
		expect(toString(store.grandTotal)).toBe('134');
	});

	it('restores every prior value on undo, across several edits in order', () => {
		const store = openA();
		store.editItem(A, LINE_10, 'quantity', '0.5');
		store.editItem(A, INNER, 'quantity', '4');
		store.editItem(A, LINE_10, 'description', 'Renamed');
		expect(store.itemsOf(A).find((i) => i.id === LINE_10)).toMatchObject({ quantity: '0.5', description: 'Renamed' });

		store.undo(A);
		expect(store.itemsOf(A).find((i) => i.id === LINE_10)?.description).toBe('item 3');
		store.undo(A);
		expect(store.itemsOf(A).find((i) => i.id === INNER)?.quantity).toBe('3');
		store.undo(A);
		expect(store.itemsOf(A)).toEqual(nestedA());
		expect(store.canUndo(A)).toBe(false);
		expect(store.canRedo(A)).toBe(true);
	});

	it('a new commit after an undo clears redo', () => {
		const store = openA();
		store.editItem(A, LINE_10, 'quantity', '2');
		store.undo(A);
		expect(store.canRedo(A)).toBe(true);

		store.editItem(A, LINE_10, 'quantity', '3');
		expect(store.canRedo(A)).toBe(false);
		expect(store.redo(A)).toBe(false);
	});

	it('does not touch data or history for invalid values', () => {
		const store = openA();
		const before = store.items;
		for (const [field, text] of [['quantity', 'abc'], ['quantity', ''], ['quantity', '-1'], ['unitPrice', ''], ['unitPrice', '1e3']] as const) {
			expect(store.editItem(A, LINE_10, field, text), `${field}=${text}`).toMatchObject({ ok: false, reason: 'invalid' });
		}
		expect(store.items).toBe(before);
		expect(store.canUndo(A)).toBe(false);
		expect(toString(store.grandTotal)).toBe('134');
	});

	it('rejects a Group Unit price and unknown Items without recording anything', () => {
		const store = openA();
		expect(store.editItem(A, uuid(1), 'unitPrice', '5')).toMatchObject({ ok: false, reason: 'read-only' });
		expect(store.editItem(A, uuid(999), 'description', 'x')).toMatchObject({ ok: false, reason: 'unknown-item' });
		expect(store.editItem(uuid(777), LINE_10, 'description', 'x')).toMatchObject({ ok: false });
		expect(store.canUndo(A)).toBe(false);
	});

	it('records nothing when the committed value is unchanged', () => {
		const store = openA();
		const before = store.items;
		expect(store.editItem(A, LINE_10, 'quantity', '1')).toMatchObject({ ok: true, changed: false });
		expect(store.editItem(A, LINE_10, 'description', 'item 3')).toMatchObject({ ok: true, changed: false });
		expect(store.items).toBe(before);
		expect(store.canUndo(A)).toBe(false);
	});

	it('keeps edits in each Budget separate', () => {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		store.editItem(A, LINE_10, 'quantity', '9');
		expect(store.canUndo(A)).toBe(true);
		expect(store.canUndo(B)).toBe(false);
		expect(store.itemsOf(B)[0].unitPrice).toBe('100');
	});
});

describe('adding Items', () => {
	function openA() {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		return store;
	}
	const idsOf = (store: BudgetStore) => store.itemsOf(A).map((i) => i.id);

	it('adds the first Item to an empty Budget as one command, with defaults and a zero total', () => {
		const store = newStore();
		store.hydrate();
		const created = store.createBudget({ name: 'Blank', currency: 'EUR' });
		if (!created.ok) throw new Error('creation failed');
		const id = created.budget.id;
		store.select(id);

		const added = store.addTopLevelItem(id);
		expect(added.ok).toBe(true);
		expect(store.rows.map((row) => row.code)).toEqual(['1']);
		expect(store.rows[0].item).toMatchObject({ description: '', quantity: '1', unitPrice: '0', parentId: null, budgetId: id });
		expect(toString(store.grandTotal)).toBe('0');

		expect(store.undo(id)).toBe(true);
		expect(store.itemsOf(id)).toEqual([]);
		expect(store.canUndo(id)).toBe(false); // one insertion was one command
	});

	it('adds a top-level Item after the existing roots with immediate Codes and unchanged totals', () => {
		const store = openA();
		const before = toString(store.grandTotal);
		const added = store.addTopLevelItem(A, { description: 'Photography' });
		if (!added.ok) throw new Error('rejected');
		expect(store.rows.map((row) => `${row.code} ${row.item.description}`).at(-1)).toBe('2 Photography');
		expect(toString(store.grandTotal)).toBe(before);
	});

	it('adds a sibling after a nested Item, with the correct parent, order and Codes', () => {
		const store = openA();
		const added = store.addSiblingItem(A, uuid(3), { description: 'Sibling' }); // after Item 3, inside the inner Group
		if (!added.ok) throw new Error('rejected');
		expect(added.item.parentId).toBe(uuid(2));
		expect(store.rows.map((row) => `${row.code} ${row.item.description}`)).toEqual([
			'1 item 1',
			'1.1 item 2',
			'1.1.1 item 3',
			'1.1.2 Sibling',
			'1.1.3 item 4',
			'1.2 item 5'
		]);
		expect(toString(store.grandTotal)).toBe('134'); // a new Line is 0 x 1
	});

	it('undo removes the Item and redo restores the same identity and order', () => {
		const store = openA();
		const before = store.itemsOf(A);
		const added = store.addSiblingItem(A, uuid(2), { description: 'Added' });
		if (!added.ok) throw new Error('rejected');
		const afterAdd = store.itemsOf(A);
		const orderAfterAdd = idsOf(store);

		expect(store.undo(A)).toBe(true);
		expect(store.itemsOf(A)).toEqual(before);

		expect(store.redo(A)).toBe(true);
		expect(store.itemsOf(A)).toEqual(afterAdd);
		expect(idsOf(store)).toEqual(orderAfterAdd);
		expect(store.itemsOf(A).filter((i) => i.id === added.item.id)).toHaveLength(1);
		expect(store.canRedo(A)).toBe(false);
	});

	it('records one command per insertion and clears redo on a new insertion', () => {
		const store = openA();
		store.addTopLevelItem(A);
		store.addTopLevelItem(A);
		store.undo(A);
		expect(store.canRedo(A)).toBe(true);
		store.addTopLevelItem(A);
		expect(store.canRedo(A)).toBe(false);
		expect(store.undo(A)).toBe(true);
		expect(store.undo(A)).toBe(true);
		expect(store.canUndo(A)).toBe(false);
		expect(store.itemsOf(A)).toEqual(nestedA());
	});

	it('leaves existing rows and references intact', () => {
		const store = openA();
		const before = store.itemsOf(A);
		store.addSiblingItem(A, uuid(1));
		for (const original of before) {
			const now = store.itemsOf(A).find((i) => i.id === original.id)!;
			expect(now.parentId).toBe(original.parentId);
			expect(now.description).toBe(original.description);
		}
		expect(store.loadIssues).toEqual([]);
	});

	it('rejects an unknown sibling or Budget without recording anything', () => {
		const store = openA();
		expect(store.addSiblingItem(A, uuid(999))).toEqual({ ok: false, reason: 'unknown-item' });
		expect(store.addTopLevelItem(uuid(777))).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.addSiblingItem(uuid(777), uuid(1))).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.canUndo(A)).toBe(false);
	});

	it('keeps insertions in each Budget separate', () => {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		store.addTopLevelItem(A);
		expect(store.canUndo(A)).toBe(true);
		expect(store.canUndo(B)).toBe(false);
		expect(store.itemsOf(B)).toHaveLength(1);
	});
});

describe('deleteBudget', () => {
	function openTwo() {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		return store;
	}

	it('removes only the selected Budget: its document and its Items', () => {
		const store = openTwo();
		const other = store.budgets.find((b) => b.id === B)!;
		const otherItems = store.itemsOf(B);

		expect(store.deleteBudget(A)).toEqual({ ok: true });

		expect(store.budgets.map((b) => b.id)).toEqual([B]);
		expect(store.itemsOf(A)).toEqual([]);
		expect(store.budgets[0]).toBe(other); // the other Budget is the very same object
		expect(store.itemsOf(B)).toBe(otherItems);
	});

	it('discards the Budget history but leaves every other Budget history alone', () => {
		const store = openTwo();
		store.editItem(A, uuid(3), 'quantity', '2');
		store.editItem(B, uuid(1), 'description', 'edited');
		expect(store.canUndo(A)).toBe(true);
		expect(store.canUndo(B)).toBe(true);

		store.deleteBudget(A);

		expect(store.canUndo(A)).toBe(false);
		expect(store.undo(A)).toBe(false);
		expect(store.canUndo(B)).toBe(true);
		expect(store.undo(B)).toBe(true);
		expect(store.itemsOf(B)[0].description).toBe('item 1');
	});

	it('starts with a clean history if a Budget with the same id is ever added again', () => {
		const store = openTwo();
		store.editItem(A, uuid(3), 'quantity', '2');
		const original = store.budgets.find((b) => b.id === A)!;
		store.deleteBudget(A);
		store.setBudget(original, nestedA());
		expect(store.canUndo(A)).toBe(false);
		expect(store.canRedo(A)).toBe(false);
	});

	it('clears the selection and the derived data when the open Budget is deleted', () => {
		const store = openTwo();
		store.select(A);
		expect(store.rows.length).toBeGreaterThan(0);
		store.deleteBudget(A);
		expect(store.activeBudgetId).toBeNull();
		expect(store.activeBudget).toBeNull();
		expect(store.rows).toEqual([]);
		expect(toString(store.grandTotal)).toBe('0');
	});

	it('keeps the selection when a different Budget is deleted', () => {
		const store = openTwo();
		store.select(B);
		store.deleteBudget(A);
		expect(store.activeBudgetId).toBe(B);
		expect(store.rows).toHaveLength(1);
	});

	it('is not an Item command: no history is created and nothing can bring the Budget back', () => {
		const store = openTwo();
		store.deleteBudget(A);
		expect(store.canUndo(B)).toBe(false);
		expect(store.canRedo(B)).toBe(false);
		expect(store.undo(A)).toBe(false);
		expect(store.redo(A)).toBe(false);
		expect(store.budgets.map((b) => b.id)).toEqual([B]);
	});

	it('does nothing for an unknown Budget', () => {
		const store = openTwo();
		const before = store.budgets;
		expect(store.deleteBudget(uuid(777))).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.budgets).toBe(before);
	});

	it('only changes shared state: it writes nothing to storage itself (the autosave path owns persistence)', () => {
		const store = openTwo();
		const snapshot = JSON.stringify({ ...localStorage });
		store.deleteBudget(A);
		expect(JSON.stringify({ ...localStorage })).toBe(snapshot);
	});
});

describe('addChildItem', () => {
	function openLine() {
		bubuStorage.writeBudget(budget(A, 'Child test'));
		bubuStorage.writeItems(A, [item(A, 1, null, '-250.50', '3'), item(A, 2, null, '7')]);
		const store = newStore();
		store.hydrate();
		store.select(A);
		return store;
	}
	const LINE = uuid(1);

	it('converts a Line in one command: child added, manual price replaced, Quantity kept', () => {
		const store = openLine();
		const before = store.itemsOf(A);
		expect(toString(store.grandTotal)).toBe('-744.50'); // 3 x -250.50 + 7

		const result = store.addChildItem(A, LINE);
		expect(result).toMatchObject({ ok: true, converted: true, previousUnitPrice: '-250.50' });
		const parent = store.itemsOf(A).find((i) => i.id === LINE)!;
		expect(parent).toMatchObject({ unitPrice: '0', quantity: '3' });
		expect(store.rows.map((row) => `${row.code} ${row.kind}`)).toEqual(['1 group', '1.1 line', '2 line']);
		expect(store.canUndo(A)).toBe(true);

		expect(store.undo(A)).toBe(true);
		expect(store.canUndo(A)).toBe(false); // the whole conversion was one command
		expect(store.itemsOf(A)).toEqual(before);
		expect(store.itemsOf(A).find((i) => i.id === LINE)!.unitPrice).toBe('-250.50'); // manual price restored
	});

	it('undo restores and redo reapplies the entire conversion with the same identities', () => {
		const store = openLine();
		const added = store.addChildItem(A, LINE);
		if (!added.ok) throw new Error('rejected');
		const after = store.itemsOf(A);

		store.undo(A);
		expect(store.itemsOf(A).some((i) => i.id === added.item.id)).toBe(false);

		expect(store.redo(A)).toBe(true);
		expect(store.itemsOf(A)).toEqual(after);
		expect(store.itemsOf(A).find((i) => i.id === added.item.id)?.parentId).toBe(LINE);
		expect(store.itemsOf(A).find((i) => i.id === LINE)!.unitPrice).toBe('0');
		expect(store.canRedo(A)).toBe(false);
	});

	it('adds to an existing Group without converting anything', () => {
		const store = openLine();
		store.addChildItem(A, LINE);
		const second = store.addChildItem(A, LINE);
		expect(second).toMatchObject({ ok: true, converted: false });
		expect(store.rows.map((row) => row.code)).toEqual(['1', '1.1', '1.2', '2']);
		store.undo(A);
		expect(store.rows.map((row) => row.code)).toEqual(['1', '1.1', '2']);
	});

	it('does nothing for unknown Items and Budgets', () => {
		const store = openLine();
		expect(store.addChildItem(A, uuid(999))).toEqual({ ok: false, reason: 'unknown-item' });
		expect(store.addChildItem(uuid(777), LINE)).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.canUndo(A)).toBe(false);
	});
});

describe('duplicateBudget', () => {
	function open() {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		return store;
	}

	it('adds an independent copy with new ids, the same values and tree, and new timestamps', () => {
		const store = open();
		const result = store.duplicateBudget(A);
		if (!result.ok) throw new Error('rejected');
		const copy = result.budget;

		expect(store.budgets).toHaveLength(3);
		expect(copy).toMatchObject({ name: 'Wedding (copy)', currency: 'EUR', createdAt: '2026-05-06T07:08:09.000Z' });
		expect(copy.id).not.toBe(A);

		const original = store.itemsOf(A);
		const duplicated = store.itemsOf(copy.id);
		expect(duplicated).toHaveLength(original.length);
		expect(duplicated.some((i) => original.some((o) => o.id === i.id))).toBe(false);
		expect(duplicated.map((i) => i.description)).toEqual(original.map((i) => i.description));
		expect(duplicated.map((i) => i.unitPrice)).toEqual(original.map((i) => i.unitPrice));

		store.select(copy.id);
		expect(toString(store.grandTotal)).toBe('134');
		expect(store.rows.map((row) => row.code)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2']);
	});

	it('duplicates an empty Budget as an empty Budget', () => {
		const store = open();
		const result = store.duplicateBudget(B);
		store.createBudget({ name: 'Blank', currency: 'USD' });
		const blank = store.budgets.find((b) => b.name === 'Blank')!;
		const blankCopy = store.duplicateBudget(blank.id);
		if (!result.ok || !blankCopy.ok) throw new Error('rejected');
		expect(store.itemsOf(blankCopy.budget.id)).toEqual([]);
		expect(blankCopy.budget.id).not.toBe(blank.id);
	});

	it('changes to the copy cannot change the original or its command stack, and vice versa', () => {
		const store = open();
		store.editItem(A, uuid(3), 'quantity', '2'); // the original has history
		const originalItems = store.itemsOf(A);

		const result = store.duplicateBudget(A);
		if (!result.ok) throw new Error('rejected');
		const copyId = result.budget.id;
		expect(store.canUndo(copyId)).toBe(false); // the copy starts with empty history
		expect(store.canUndo(A)).toBe(true); // the original keeps its own

		const copyLine = store.itemsOf(copyId).find((i) => i.description === 'item 3')!;
		store.editItem(copyId, copyLine.id, 'quantity', '9');
		store.addTopLevelItem(copyId);
		store.deleteItem(copyId, store.itemsOf(copyId)[0].id);

		expect(store.itemsOf(A)).toBe(originalItems); // untouched, same array
		expect(store.undo(A)).toBe(true); // only the original's single command is on its stack
		expect(store.canUndo(A)).toBe(false);

		store.editItem(A, uuid(5), 'description', 'only the original');
		expect(store.itemsOf(copyId).some((i) => i.description === 'only the original')).toBe(false);
		expect(store.canUndo(copyId)).toBe(true);
	});

	it('does not select the copy, add history for it or write to storage', () => {
		const store = open();
		store.select(A);
		const snapshot = JSON.stringify({ ...localStorage });
		const result = store.duplicateBudget(A);
		if (!result.ok) throw new Error('rejected');
		expect(store.activeBudgetId).toBe(A);
		expect(store.canUndo(result.budget.id)).toBe(false);
		expect(JSON.stringify({ ...localStorage })).toBe(snapshot);
	});

	it('can be repeated, each copy getting its own ids', () => {
		const store = open();
		const first = store.duplicateBudget(A);
		const second = store.duplicateBudget(A);
		if (!first.ok || !second.ok) throw new Error('rejected');
		expect(first.budget.id).not.toBe(second.budget.id);
		const ids = new Set([A, B, first.budget.id, second.budget.id]);
		expect(ids.size).toBe(4);
		const allItemIds = [A, first.budget.id, second.budget.id].flatMap((id) => store.itemsOf(id).map((i) => i.id));
		expect(new Set(allItemIds).size).toBe(allItemIds.length);
	});

	it('rejects an unknown Budget', () => {
		const store = open();
		expect(store.duplicateBudget(uuid(777))).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.budgets).toHaveLength(2);
	});
});

describe('deleteItem', () => {
	function openA() {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		return store;
	}
	const OUTER = uuid(1);
	const INNER = uuid(2);
	const LINE_10 = uuid(3);
	const LINE_7 = uuid(5);

	it('deletes a Line as one command, refreshing Codes and totals', () => {
		const store = openA();
		expect(store.deleteItem(A, LINE_7)).toMatchObject({ ok: true, removedIds: [LINE_7] });
		expect(store.rows.map((row) => row.code)).toEqual(['1', '1.1', '1.1.1', '1.1.2']);
		expect(toString(store.grandTotal)).toBe('120'); // 2 x (3 x (10 + 10))
		expect(store.canUndo(A)).toBe(true);
		store.undo(A);
		expect(store.canUndo(A)).toBe(false); // one deletion, one command
	});

	it('deletes a nested Group with all its descendants and leaves no orphans', () => {
		const store = openA();
		const result = store.deleteItem(A, INNER);
		expect(result).toMatchObject({ ok: true, removedIds: [INNER, LINE_10, uuid(4)] });
		expect(store.itemsOf(A).map((i) => i.id)).toEqual([OUTER, LINE_7]);
		expect(store.rows.map((row) => row.code)).toEqual(['1', '1.1']);
		expect(toString(store.grandTotal)).toBe('14'); // 2 x 7
		expect(store.tree.unreachableIds).toEqual([]);
	});

	it('normalizes a parent that loses its last child, and undo restores its original pricing', () => {
		seedStorage();
		const store = newStore();
		store.hydrate();
		store.select(A);
		// Give the outer Group a hidden manual price, which only matters once it has no children.
		store.setItems(A, store.itemsOf(A).map((i) => (i.id === OUTER ? { ...i, unitPrice: '999' } : i)));
		const original = store.itemsOf(A);

		store.deleteItem(A, LINE_7);
		const second = store.deleteItem(A, INNER); // the last child of Outer
		expect(second).toMatchObject({ ok: true, normalizedParentId: OUTER });

		const outer = store.itemsOf(A).find((i) => i.id === OUTER)!;
		expect(outer).toMatchObject({ unitPrice: '0', quantity: '2', description: 'item 1' });
		expect(store.rows[0].kind).toBe('line');
		expect(toString(store.grandTotal)).toBe('0'); // not 2 x 999

		store.undo(A);
		expect(store.itemsOf(A).find((i) => i.id === OUTER)!.unitPrice).toBe('999');
		store.undo(A);
		expect(store.itemsOf(A)).toEqual(original);
	});

	it('undo restores every UUID, the hierarchy and the order; redo removes the same subtree as one command', () => {
		const store = openA();
		const before = store.itemsOf(A);
		const orderBefore = store.rows.map((row) => `${row.code}:${row.id}`);

		store.deleteItem(A, INNER);
		const after = store.itemsOf(A);

		expect(store.undo(A)).toBe(true);
		expect(store.itemsOf(A)).toEqual(before);
		expect(store.rows.map((row) => `${row.code}:${row.id}`)).toEqual(orderBefore);
		expect(toString(store.grandTotal)).toBe('134');

		expect(store.redo(A)).toBe(true);
		expect(store.itemsOf(A)).toEqual(after);
		expect(store.canRedo(A)).toBe(false);
		expect(store.undo(A)).toBe(true);
		expect(store.canUndo(A)).toBe(false); // the whole subtree was one command
	});

	it('a new commit after an undo clears redo', () => {
		const store = openA();
		store.deleteItem(A, LINE_7);
		store.undo(A);
		expect(store.canRedo(A)).toBe(true);
		store.deleteItem(A, INNER);
		expect(store.canRedo(A)).toBe(false);
	});

	it('does nothing for unknown Items and Budgets', () => {
		const store = openA();
		expect(store.deleteItem(A, uuid(999))).toEqual({ ok: false, reason: 'unknown-item' });
		expect(store.deleteItem(uuid(777), LINE_7)).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.canUndo(A)).toBe(false);
	});

	it('keeps deletions in each Budget separate', () => {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		store.deleteItem(A, LINE_7);
		expect(store.itemsOf(B)).toHaveLength(1);
		expect(store.canUndo(B)).toBe(false);
	});
});

describe('renameBudget', () => {
	function openBoth() {
		seedStorage();
		bubuStorage.writeItems(B, [item(B, 1, null, '100')]);
		const store = newStore();
		store.hydrate();
		store.select(A);
		return store;
	}

	it('updates only the name and updatedAt of the intended Budget', () => {
		const store = openBoth();
		const before = store.budgets.find((b) => b.id === A)!;
		const other = store.budgets.find((b) => b.id === B)!;

		const result = store.renameBudget(A, '  Summer wedding ');
		expect(result.ok && result.changed).toBe(true);

		const after = store.budgets.find((b) => b.id === A)!;
		expect(after).toEqual({ ...before, name: 'Summer wedding', updatedAt: '2026-05-06T07:08:09.000Z' });
		expect(after.id).toBe(before.id);
		expect(after.currency).toBe(before.currency);
		expect(after.createdAt).toBe(before.createdAt);
		expect(store.budgets.find((b) => b.id === B)).toBe(other); // the other Budget is untouched
		expect(store.activeBudget?.name).toBe('Summer wedding');
	});

	it('leaves every Item, their order and the derived data exactly as they were', () => {
		const store = openBoth();
		const items = store.itemsOf(A);
		const rows = store.rows.map((row) => `${row.code} ${row.item.description}`);

		store.renameBudget(A, 'Renamed');

		expect(store.itemsOf(A)).toBe(items); // the very same array
		expect(store.itemsOf(B)).toEqual([item(B, 1, null, '100')]);
		expect(store.rows.map((row) => `${row.code} ${row.item.description}`)).toEqual(rows);
		expect(toString(store.grandTotal)).toBe('134');
	});

	it('is not an Item command: no history is added and existing history is untouched', () => {
		const store = openBoth();
		store.renameBudget(A, 'Renamed');
		expect(store.canUndo(A)).toBe(false); // renaming did not create an undo step

		store.editItem(A, uuid(3), 'quantity', '2');
		store.renameBudget(A, 'Renamed again');
		store.renameBudget(B, 'Other renamed');
		expect(store.canUndo(A)).toBe(true);
		expect(store.undo(A)).toBe(true); // undo reverts the Item edit, not the rename
		expect(store.itemsOf(A).find((i) => i.id === uuid(3))?.quantity).toBe('1');
		expect(store.budgets.find((b) => b.id === A)?.name).toBe('Renamed again');
		expect(store.canUndo(A)).toBe(false);
		expect(store.canRedo(A)).toBe(true); // redo stack intact too
	});

	it('rejects an empty name and changes nothing', () => {
		const store = openBoth();
		const before = store.budgets;
		for (const name of ['', '   ']) {
			expect(store.renameBudget(A, name)).toEqual({
				ok: false,
				reason: 'invalid',
				errors: { name: 'Enter a name for the Budget.' }
			});
		}
		expect(store.budgets).toBe(before);
	});

	it('does nothing for an unknown Budget', () => {
		const store = openBoth();
		const before = store.budgets;
		expect(store.renameBudget(uuid(777), 'x')).toEqual({ ok: false, reason: 'unknown-budget' });
		expect(store.budgets).toBe(before);
	});

	it('leaves updatedAt alone when the name is unchanged', () => {
		const store = openBoth();
		const before = store.budgets;
		expect(store.renameBudget(A, 'Wedding')).toMatchObject({ ok: true, changed: false });
		expect(store.budgets).toBe(before);
		expect(store.budgets.find((b) => b.id === A)?.updatedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('does not write to storage (persistence is wired elsewhere)', () => {
		const store = openBoth();
		const snapshot = JSON.stringify({ ...localStorage });
		store.renameBudget(A, 'Renamed');
		expect(JSON.stringify({ ...localStorage })).toBe(snapshot);
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

		expect(store.deleteBudget(A)).toEqual({ ok: true });
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
