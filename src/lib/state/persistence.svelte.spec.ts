import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBudget, type Budget } from '../budget/model';
import { toString } from '../budget/numbers';
import { CommandHistory } from '../history/commands';
import { budgetKey, bubuStorage, createBubuStorage, itemsKey, STORAGE_PREFIX } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';
import { BudgetStore } from './budgets.svelte';
import { BudgetPersistence } from './persistence.svelte';

let tick = 0;
const clock = () => new Date(Date.UTC(2026, 5, 1, 0, 0, tick++));

const stops: (() => void)[] = [];

/** A page session: a store that loads what is saved, with autosave running. */
function session(storage = bubuStorage) {
	const store = new BudgetStore({ storage, history: new CommandHistory(), now: clock });
	store.hydrate();
	const persistence = new BudgetPersistence(store, storage);
	stops.push(persistence.start());
	flushSync();
	return { store, persistence };
}

/** Simulate a reload: a brand new store that only knows what storage holds. */
function reload(storage = bubuStorage) {
	const store = new BudgetStore({ storage, history: new CommandHistory(), now: clock });
	store.hydrate();
	return store;
}

const settle = () => flushSync();

function create(store: BudgetStore, name = 'Wedding', currency = 'EUR'): Budget {
	const created = store.createBudget({ name, currency });
	if (!created.ok) throw new Error('creation failed');
	return created.budget;
}

const itemOf = (store: BudgetStore, budgetId: string, description: string) =>
	store.itemsOf(budgetId).find((i) => i.description === description)!;

beforeEach(() => localStorage.clear());
afterEach(() => {
	while (stops.length) stops.pop()!();
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('Budget create, rename, duplicate and delete', () => {
	it('saves a created Budget: id, name, currency and timestamps survive a reload, with no Items', () => {
		const { store } = session();
		const budget = create(store, '  Wedding ', 'DKK');
		settle();

		const loaded = reload();
		expect(loaded.budgets).toEqual([budget]);
		expect(loaded.budgets[0]).toMatchObject({ name: 'Wedding', currency: 'DKK' });
		expect(loaded.itemsOf(budget.id)).toEqual([]);
		expect(Object.keys({ ...localStorage }).sort()).toEqual([budgetKey(budget.id), itemsKey(budget.id)].sort());
	});

	it('saves a rename, updating the name and updatedAt and leaving the Items alone', () => {
		const { store } = session();
		const budget = create(store);
		store.addTopLevelItem(budget.id, { description: 'Venue' });
		settle();
		const itemsBefore = localStorage.getItem(itemsKey(budget.id));

		store.renameBudget(budget.id, 'Summer wedding');
		settle();

		const loaded = reload();
		expect(loaded.budgets[0]).toEqual(store.budgets[0]);
		expect(loaded.budgets[0].name).toBe('Summer wedding');
		expect(loaded.budgets[0].updatedAt).not.toBe(budget.updatedAt);
		expect(localStorage.getItem(itemsKey(budget.id))).toBe(itemsBefore); // not rewritten
	});

	it('saves a duplicate as an independent Budget with its own ids', () => {
		const { store } = session();
		const original = create(store);
		store.addTopLevelItem(original.id, { description: 'Venue' });
		const copy = store.duplicateBudget(original.id);
		if (!copy.ok) throw new Error('duplicate failed');
		settle();

		const loaded = reload();
		expect(loaded.budgets.map((b) => b.id).sort()).toEqual([original.id, copy.budget.id].sort());
		expect(loaded.itemsOf(copy.budget.id)).toEqual(store.itemsOf(copy.budget.id));
		expect(loaded.itemsOf(original.id)[0].id).not.toBe(loaded.itemsOf(copy.budget.id)[0].id);
	});

	it('saves a deletion: the Budget and its Items are gone and do not return after a reload', () => {
		const { store } = session();
		const keep = create(store, 'Keep');
		const doomed = create(store, 'Doomed');
		store.addTopLevelItem(doomed.id);
		settle();
		expect(reload().budgets).toHaveLength(2);

		store.deleteBudget(doomed.id);
		settle();

		const loaded = reload();
		expect(loaded.budgets.map((b) => b.id)).toEqual([keep.id]);
		expect(localStorage.getItem(budgetKey(doomed.id))).toBeNull();
		expect(localStorage.getItem(itemsKey(doomed.id))).toBeNull();
		expect(loaded.itemsOf(doomed.id)).toEqual([]);
	});

	it('saves Budgets that were loaded and later changed, not only new ones', () => {
		bubuStorage.writeBudget(createBudget({ id: '11111111-1111-4111-8111-111111111111', name: 'Old', currency: 'EUR' }));
		const { store } = session();
		store.renameBudget('11111111-1111-4111-8111-111111111111', 'Renamed after load');
		settle();
		expect(reload().budgets[0].name).toBe('Renamed after load');
	});
});

describe('Item commands', () => {
	it('restores IDs, hierarchy, order and precise values after add, edit, convert and delete', () => {
		const { store } = session();
		const budget = create(store);
		const id = budget.id;

		store.addTopLevelItem(id, { description: 'Venue' });
		store.addTopLevelItem(id, { description: 'Catering' });
		const venue = itemOf(store, id, 'Venue');
		const catering = itemOf(store, id, 'Catering');
		store.addSiblingItem(id, venue.id, { description: 'Music' });
		store.editItem(id, venue.id, 'unitPrice', '-250.50'); // negative, precision kept
		store.editItem(id, venue.id, 'quantity', '0.125'); // fractional
		store.editItem(id, catering.id, 'unitPrice', '0.1000000000000000055511151231257827');
		store.editItem(id, catering.id, 'unit', 'guests');
		store.addChildItem(id, venue.id, { description: 'Hall' }); // Line to Group conversion
		store.addChildItem(id, catering.id, { description: 'Food' });
		store.deleteItem(id, itemOf(store, id, 'Food').id); // subtree deletion normalizing its parent
		settle();

		const loaded = reload();
		expect(loaded.itemsOf(id)).toEqual(store.itemsOf(id)); // every field, in the same order
		expect(loaded.budgets[0]).toEqual(store.budgets[0]);
		const venueLoaded = itemOf(loaded, id, 'Venue');
		expect(venueLoaded).toMatchObject({ unitPrice: '0', quantity: '0.125' }); // converted: price replaced
		expect(itemOf(loaded, id, 'Catering')).toMatchObject({
			unitPrice: '0', // normalized when its last child was deleted
			unit: 'guests'
		});
		expect(itemOf(loaded, id, 'Hall').parentId).toBe(venue.id);

		loaded.select(id);
		store.select(id);
		expect(loaded.rows.map((r) => `${r.code} ${r.item.description}`)).toEqual(
			store.rows.map((r) => `${r.code} ${r.item.description}`)
		);
		expect(toString(loaded.grandTotal)).toBe(toString(store.grandTotal));
	});

	it('keeps negative and fractional edit values exactly as typed', () => {
		const { store } = session();
		const { id } = create(store);
		const added = store.addTopLevelItem(id);
		if (!added.ok) throw new Error('add failed');
		store.editItem(id, added.item.id, 'unitPrice', '-0.30');
		store.editItem(id, added.item.id, 'quantity', '12.500');
		settle();
		expect(reload().itemsOf(id)[0]).toMatchObject({ unitPrice: '-0.30', quantity: '12.500' });
	});

	it('saves once per committed change batch, with the Items before the document', () => {
		const storage = new FakeStorage();
		const { store } = session(createBubuStorage(() => storage));
		const { id } = create(store);
		settle();
		storage.writes.length = 0;

		store.addTopLevelItem(id);
		settle();
		expect(storage.writes).toEqual([itemsKey(id), budgetKey(id)]); // data first, then the document that lists it
	});
});

describe('undo and redo', () => {
	it('saves undo and redo results exactly like new commits, without persisting history', () => {
		const { store } = session();
		const { id } = create(store);
		const added = store.addTopLevelItem(id, { description: 'Venue' });
		if (!added.ok) throw new Error('add failed');
		store.editItem(id, added.item.id, 'unitPrice', '100');
		settle();
		expect(reload().itemsOf(id)[0].unitPrice).toBe('100');

		store.undo(id);
		settle();
		expect(reload().itemsOf(id)[0].unitPrice).toBe('0'); // the undone value is what is saved

		store.redo(id);
		settle();
		expect(reload().itemsOf(id)[0].unitPrice).toBe('100');

		store.undo(id);
		store.undo(id); // back past the insertion
		settle();
		expect(reload().itemsOf(id)).toEqual([]);

		// History itself is never stored: only documents and flat arrays are.
		for (const key of Object.keys({ ...localStorage })) {
			expect(key.startsWith(`${STORAGE_PREFIX}budget:`) || key.startsWith(`${STORAGE_PREFIX}items:`), key).toBe(true);
		}
		const afterReload = reload();
		expect(afterReload.canUndo(id)).toBe(false);
		expect(afterReload.canRedo(id)).toBe(false);
	});

	it('saves the Budget updatedAt that an undo bumps', () => {
		const { store } = session();
		const { id } = create(store);
		const added = store.addTopLevelItem(id);
		if (!added.ok) throw new Error('add failed');
		settle();
		const before = reload().budgets[0].updatedAt;
		store.undo(id);
		settle();
		expect(reload().budgets[0].updatedAt).not.toBe(before);
	});
});

describe('what is stored', () => {
	it('is only documents and flat Items: no derived values, edit buffers or history', () => {
		const { store } = session();
		const { id } = create(store);
		const added = store.addTopLevelItem(id, { description: 'Venue' });
		if (!added.ok) throw new Error('add failed');
		store.editItem(id, added.item.id, 'unitPrice', '5');
		settle();

		const items = JSON.parse(localStorage.getItem(itemsKey(id))!);
		expect(Object.keys(items)).toEqual(['version', 'data']);
		expect(Object.keys(items.data[0]).sort()).toEqual(
			['budgetId', 'description', 'id', 'parentId', 'quantity', 'sortIndex', 'unitPrice'].sort()
		);
		const doc = JSON.parse(localStorage.getItem(budgetKey(id))!);
		expect(Object.keys(doc.data).sort()).toEqual(['createdAt', 'currency', 'id', 'name', 'updatedAt']);
		expect(JSON.stringify({ ...localStorage })).not.toMatch(/total|code|depth|undo|redo|history/i);
	});

	it('does not save selection changes or anything else that is not Budget data', () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const { store } = session();
		const { id } = create(store);
		settle();
		setItem.mockClear();

		store.select(id);
		store.select(null);
		settle();
		expect(setItem).not.toHaveBeenCalled();
	});

	it('writes only what changed', () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const { store } = session();
		const { id } = create(store);
		store.addTopLevelItem(id);
		settle();

		setItem.mockClear();
		store.renameBudget(id, 'Only the document');
		settle();
		expect(setItem.mock.calls.map((call) => call[0])).toEqual([budgetKey(id)]); // not the Items
	});
});

describe('loading', () => {
	it('writes nothing when it loads, or loads again', () => {
		bubuStorage.writeBudget(createBudget({ id: '11111111-1111-4111-8111-111111111111', name: 'Saved', currency: 'EUR' }));
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const { store } = session();
		store.hydrate(); // again
		settle();
		expect(setItem).not.toHaveBeenCalled();
	});

	it('writes nothing before the stored Budgets have loaded', () => {
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const store = new BudgetStore({ history: new CommandHistory(), now: clock });
		const persistence = new BudgetPersistence(store);
		stops.push(persistence.start());
		store.setBudget(createBudget({ name: 'Too early', currency: 'EUR' }), []);
		settle();
		expect(setItem).not.toHaveBeenCalled();
	});

	it('never overwrites or deletes a Budget that failed to load', () => {
		const GOOD = '11111111-1111-4111-8111-111111111111';
		const BAD = '22222222-2222-4222-8222-222222222222';
		bubuStorage.writeBudget(createBudget({ id: GOOD, name: 'Good', currency: 'EUR' }));
		localStorage.setItem(budgetKey(BAD), '{corrupt');
		localStorage.setItem(itemsKey(BAD), JSON.stringify({ version: 9, data: [] }));

		const { store } = session();
		store.renameBudget(GOOD, 'Good, renamed');
		store.createBudget({ name: 'New', currency: 'USD' });
		settle();

		expect(localStorage.getItem(budgetKey(BAD))).toBe('{corrupt');
		expect(localStorage.getItem(itemsKey(BAD))).toBe(JSON.stringify({ version: 9, data: [] }));
		expect(reload().budgets.map((b) => b.name).sort()).toEqual(['Good, renamed', 'New']);
	});
});

describe('storage failures', () => {
	it('reports a full storage, keeps the change in memory, and saves it once storage recovers', () => {
		const storage = new FakeStorage();
		const real = createBubuStorage(() => storage);
		const { store, persistence } = session(real);
		const { id } = create(store);
		settle();
		expect(persistence.failures).toEqual([]);

		storage.failWrite = new DOMException('full', 'QuotaExceededError');
		const added = store.addTopLevelItem(id, { description: 'Venue' });
		settle();

		expect(added.ok).toBe(true);
		expect(store.itemsOf(id)).toHaveLength(1); // the user's work is still on screen
		expect(persistence.failures).toHaveLength(1);
		expect(persistence.failures[0]).toMatchObject({ operation: 'save-items', budgetId: id });
		expect(persistence.failures[0].error.kind).toBe('quota-exceeded');
		expect(reload(real).itemsOf(id)).toEqual([]); // nothing was saved

		storage.failWrite = null;
		persistence.flush(); // retry
		expect(persistence.failures).toEqual([]);
		expect(reload(real).itemsOf(id)).toEqual(store.itemsOf(id));
	});

	it('retries the pending changes together with the next change', () => {
		const storage = new FakeStorage();
		const real = createBubuStorage(() => storage);
		const { store, persistence } = session(real);
		const { id } = create(store);
		settle();

		storage.failWrite = new DOMException('full', 'QuotaExceededError');
		store.addTopLevelItem(id, { description: 'First' });
		settle();
		expect(persistence.failures.length).toBeGreaterThan(0);

		storage.failWrite = null;
		store.addTopLevelItem(id, { description: 'Second' });
		settle();
		expect(persistence.failures).toEqual([]);
		expect(reload(real).itemsOf(id).map((i) => i.description)).toEqual(['First', 'Second']);
	});

	it('does not save a document whose Items could not be saved', () => {
		const storage = new FakeStorage();
		const real = createBubuStorage(() => storage);
		const { store, persistence } = session(real);
		storage.failWrite = new DOMException('full', 'QuotaExceededError');
		create(store);
		settle();

		expect(persistence.failures.map((f) => f.operation)).toEqual(['save-items']);
		expect(storage.data.size).toBe(0); // no Budget without its data
	});

	it('reports unavailable storage', () => {
		const real = createBubuStorage(() => null);
		const { store, persistence } = session(real);
		expect(store.hydrationStatus).toBe('unavailable');
		create(store);
		settle();
		expect(persistence.failures[0].error.kind).toBe('unavailable');
		expect(store.budgets).toHaveLength(1); // still usable in memory
	});

	it('refuses to overwrite data it cannot read, and says so', () => {
		const { store, persistence } = session();
		const { id } = create(store);
		settle();
		localStorage.setItem(itemsKey(id), '{overwritten by something else');

		store.addTopLevelItem(id);
		settle();

		expect(persistence.failures[0].error.kind).toBe('unreadable-existing');
		expect(localStorage.getItem(itemsKey(id))).toBe('{overwritten by something else');
	});

	it('retries a failed deletion', () => {
		const storage = new FakeStorage();
		const real = createBubuStorage(() => storage);
		const { store, persistence } = session(real);
		const { id } = create(store);
		settle();

		const original = storage.removeItem.bind(storage);
		storage.removeItem = () => {
			throw new Error('blocked');
		};
		store.deleteBudget(id);
		settle();
		expect(persistence.failures[0]).toMatchObject({ operation: 'delete-budget', budgetId: id });

		storage.removeItem = original;
		persistence.flush();
		expect(persistence.failures).toEqual([]);
		expect(storage.data.has(budgetKey(id))).toBe(false);
	});

	it('clears the failure list once everything is saved', () => {
		const storage = new FakeStorage();
		const { store, persistence } = session(createBubuStorage(() => storage));
		storage.failWrite = new DOMException('full', 'QuotaExceededError');
		create(store);
		settle();
		expect(persistence.failures).not.toEqual([]);
		storage.failWrite = null;
		persistence.flush();
		expect(persistence.failures).toEqual([]);
	});
});

describe('starting and stopping', () => {
	it('stops saving when stopped', () => {
		const store = new BudgetStore({ history: new CommandHistory(), now: clock });
		store.hydrate();
		const persistence = new BudgetPersistence(store);
		const stop = persistence.start();
		flushSync();
		stop();

		create(store);
		settle();
		expect(reload().budgets).toEqual([]);
	});
});

describe('edits that are not committed', () => {
	it('stay transient: only committed changes are saved', () => {
		const { store } = session();
		const { id } = create(store);
		const added = store.addTopLevelItem(id, { description: 'Venue' });
		if (!added.ok) throw new Error('add failed');
		settle();
		// An invalid or no-op commit changes nothing, so nothing is saved either.
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		store.editItem(id, added.item.id, 'quantity', 'abc');
		store.editItem(id, added.item.id, 'quantity', '1');
		settle();
		expect(setItem).not.toHaveBeenCalled();
		expect(toString(store.grandTotal)).toBe('0');
	});
});

