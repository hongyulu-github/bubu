import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBudget, createItem, type Budget, type Item } from '../budget/model';
import {
	SCHEMA_VERSION,
	STORAGE_PREFIX,
	budgetKey,
	createBubuStorage,
	getBrowserStorage,
	itemsKey,
	type StorageError
} from './bubu';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

class FakeStorage implements Storage {
	data = new Map<string, string>();
	failReads = false;
	failWrite: Error | null = null;
	failRemove = false;

	get length() {
		return this.data.size;
	}
	key(index: number) {
		return [...this.data.keys()][index] ?? null;
	}
	getItem(key: string) {
		if (this.failReads) throw new Error('read blocked');
		return this.data.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		if (this.failWrite) throw this.failWrite;
		this.data.set(key, value);
	}
	removeItem(key: string) {
		if (this.failRemove) throw new Error('remove blocked');
		this.data.delete(key);
	}
	clear() {
		this.data.clear();
	}
}

function setup() {
	const fake = new FakeStorage();
	return { fake, storage: createBubuStorage(() => fake) };
}

function budget(overrides: Partial<Budget> = {}): Budget {
	return {
		...createBudget({ id: BUDGET_ID, name: 'Wedding', currency: 'EUR', now: new Date('2026-01-02T03:04:05.678Z') }),
		...overrides
	};
}

function items(): Item[] {
	return [
		createItem({ id: '00000000-0000-4000-8000-000000000001', budgetId: BUDGET_ID, sortIndex: 0, description: 'Venue', quantity: '2.5' }),
		createItem({
			id: '00000000-0000-4000-8000-000000000002',
			budgetId: BUDGET_ID,
			parentId: '00000000-0000-4000-8000-000000000001',
			sortIndex: 3,
			description: 'Hall',
			unitPrice: '-1200.500',
			unit: 'hours'
		}),
		createItem({
			id: '00000000-0000-4000-8000-000000000003',
			budgetId: BUDGET_ID,
			sortIndex: 1,
			unitPrice: '0.1000000000000000055511151231257827'
		})
	];
}

function expectError<T>(result: { ok: boolean; error?: StorageError } | { ok: true; value: T }, kind: string): StorageError {
	expect(result.ok).toBe(false);
	const error = (result as { error: StorageError }).error;
	expect(error.kind).toBe(kind);
	return error;
}

afterEach(() => vi.unstubAllGlobals());

describe('round trip', () => {
	it('round-trips a Budget document unchanged, including timestamps', () => {
		const { storage } = setup();
		const original = budget();
		expect(storage.writeBudget(original)).toEqual({ ok: true, value: undefined });
		expect(storage.readBudget(BUDGET_ID)).toEqual({ ok: true, value: original });
	});

	it('round-trips flat Items: ids, hierarchy, order, optional unit and decimal precision', () => {
		const { storage } = setup();
		const original = items();
		expect(storage.writeItems(BUDGET_ID, original).ok).toBe(true);

		const result = storage.readItems(BUDGET_ID);
		expect(result).toEqual({ ok: true, value: original });
		const read = (result as { value: Item[] }).value;
		expect(read[1].parentId).toBe(original[0].id);
		expect(read[1].unitPrice).toBe('-1200.500');
		expect(read[2].unitPrice).toBe('0.1000000000000000055511151231257827');
		expect('unit' in read[0]).toBe(false);
		expect(read.map((i) => i.sortIndex)).toEqual([0, 3, 1]);
	});

	it('round-trips an empty Item array', () => {
		const { storage } = setup();
		storage.writeItems(BUDGET_ID, []);
		expect(storage.readItems(BUDGET_ID)).toEqual({ ok: true, value: [] });
	});

	it('replaces earlier valid data (the normal autosave flow)', () => {
		const { storage } = setup();
		storage.writeBudget(budget());
		expect(storage.writeBudget(budget({ name: 'Renamed' })).ok).toBe(true);
		expect((storage.readBudget(BUDGET_ID) as { value: Budget }).value.name).toBe('Renamed');
	});

	it('stores a schema-version envelope under bubu: keys only', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		storage.writeItems(BUDGET_ID, items());
		expect([...fake.data.keys()].sort()).toEqual([budgetKey(BUDGET_ID), itemsKey(BUDGET_ID)].sort());
		for (const key of fake.data.keys()) expect(key.startsWith(STORAGE_PREFIX)).toBe(true);
		expect(JSON.parse(fake.data.get(budgetKey(BUDGET_ID))!)).toMatchObject({ version: SCHEMA_VERSION, data: { id: BUDGET_ID } });
	});

	it('keeps Budgets and their Items separate', () => {
		const { storage } = setup();
		storage.writeBudget(budget());
		storage.writeBudget(budget({ id: OTHER_ID, name: 'Renovation' }));
		storage.writeItems(BUDGET_ID, items());
		expect(storage.readItems(OTHER_ID).ok).toBe(false);
		expect(expectError(storage.readItems(OTHER_ID), 'not-found').key).toBe(itemsKey(OTHER_ID));
	});
});

describe('missing data', () => {
	it('returns not-found for a Budget and Items that were never saved', () => {
		const { storage } = setup();
		expectError(storage.readBudget(BUDGET_ID), 'not-found');
		expectError(storage.readItems(BUDGET_ID), 'not-found');
	});

	it('lists no Budgets in empty storage', () => {
		expect(setup().storage.listBudgets()).toEqual({ ok: true, value: { budgets: [], failures: [] } });
	});

	it('rejects ids that are not UUIDs', () => {
		const { storage } = setup();
		expectError(storage.readBudget('../x'), 'invalid-data');
		expectError(storage.readItems('nope'), 'invalid-data');
		expectError(storage.writeItems('nope', []), 'invalid-data');
	});
});

describe('corrupt and version-mismatched data', () => {
	it('reports invalid JSON as corrupt and leaves it in storage', () => {
		const { fake, storage } = setup();
		fake.data.set(budgetKey(BUDGET_ID), '{not json');
		expectError(storage.readBudget(BUDGET_ID), 'corrupt');
		expect(fake.data.get(budgetKey(BUDGET_ID))).toBe('{not json');
	});

	it('reports a missing envelope as corrupt', () => {
		const { fake, storage } = setup();
		fake.data.set(budgetKey(BUDGET_ID), JSON.stringify(budget()));
		expectError(storage.readBudget(BUDGET_ID), 'corrupt');
		fake.data.set(itemsKey(BUDGET_ID), 'null');
		expectError(storage.readItems(BUDGET_ID), 'corrupt');
	});

	it('reports data that fails validation as corrupt, with the issues', () => {
		const { fake, storage } = setup();
		fake.data.set(budgetKey(BUDGET_ID), JSON.stringify({ version: SCHEMA_VERSION, data: budget({ currency: 'euro' }) }));
		const error = expectError(storage.readBudget(BUDGET_ID), 'corrupt');
		expect(error.issues?.map((issue) => issue.code)).toEqual(['invalid-currency']);

		const dangling = createItem({ budgetId: BUDGET_ID, parentId: OTHER_ID });
		fake.data.set(itemsKey(BUDGET_ID), JSON.stringify({ version: SCHEMA_VERSION, data: [dangling] }));
		expect(expectError(storage.readItems(BUDGET_ID), 'corrupt').issues?.[0].code).toBe('dangling-parent');
	});

	it('reports a Budget stored under another Budget id as corrupt', () => {
		const { fake, storage } = setup();
		fake.data.set(budgetKey(OTHER_ID), JSON.stringify({ version: SCHEMA_VERSION, data: budget() }));
		expectError(storage.readBudget(OTHER_ID), 'corrupt');
	});

	it('reports unknown schema versions without touching the data', () => {
		const { fake, storage } = setup();
		for (const version of [0, 2, 99, '1']) {
			const raw = JSON.stringify({ version, data: budget() });
			fake.data.set(budgetKey(BUDGET_ID), raw);
			const error = expectError(storage.readBudget(BUDGET_ID), 'unsupported-version');
			expect(error.version).toBe(version);
			expect(fake.data.get(budgetKey(BUDGET_ID))).toBe(raw);
		}
	});

	it('refuses to overwrite unreadable data by default, and leaves it intact', () => {
		const { fake, storage } = setup();
		const futureRaw = JSON.stringify({ version: 2, data: { something: 'new' } });
		fake.data.set(budgetKey(BUDGET_ID), futureRaw);
		fake.data.set(itemsKey(BUDGET_ID), '{broken');

		expectError(storage.writeBudget(budget()), 'unreadable-existing');
		expectError(storage.writeItems(BUDGET_ID, items()), 'unreadable-existing');
		expect(fake.data.get(budgetKey(BUDGET_ID))).toBe(futureRaw);
		expect(fake.data.get(itemsKey(BUDGET_ID))).toBe('{broken');
	});

	it('overwrites unreadable data only when explicitly asked', () => {
		const { fake, storage } = setup();
		fake.data.set(budgetKey(BUDGET_ID), '{broken');
		expect(storage.writeBudget(budget(), { overwriteUnreadable: true }).ok).toBe(true);
		expect(storage.readBudget(BUDGET_ID).ok).toBe(true);
	});

	it('does not write invalid data', () => {
		const { fake, storage } = setup();
		expectError(storage.writeBudget(budget({ name: '' })), 'invalid-data');
		const dangling = createItem({ budgetId: BUDGET_ID, parentId: OTHER_ID });
		const error = expectError(storage.writeItems(BUDGET_ID, [dangling]), 'invalid-data');
		expect(error.issues?.[0].code).toBe('dangling-parent');
		expect(fake.data.size).toBe(0);
	});

	it('lists readable Budgets and reports unreadable ones separately', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		fake.data.set(budgetKey(OTHER_ID), '{broken');
		const result = storage.listBudgets();
		expect(result.ok && result.value.budgets.map((b) => b.id)).toEqual([BUDGET_ID]);
		expect(result.ok && result.value.failures).toEqual([
			{ budgetId: OTHER_ID, error: expect.objectContaining({ kind: 'corrupt' }) }
		]);
	});
});

describe('failed reads and writes', () => {
	it('surfaces a failing read', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		fake.failReads = true;
		const error = expectError(storage.readBudget(BUDGET_ID), 'read-failed');
		expect(error.cause).toBeInstanceOf(Error);
	});

	it('surfaces quota-exceeded writes and keeps the previous data', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		fake.failWrite = new DOMException('full', 'QuotaExceededError');
		const error = expectError(storage.writeBudget(budget({ name: 'Too big' })), 'quota-exceeded');
		expect(error.key).toBe(budgetKey(BUDGET_ID));
		fake.failWrite = null;
		expect((storage.readBudget(BUDGET_ID) as { value: Budget }).value.name).toBe('Wedding');
	});

	it('surfaces other write failures (e.g. blocked storage)', () => {
		const { fake, storage } = setup();
		fake.failWrite = new DOMException('denied', 'SecurityError');
		expectError(storage.writeItems(BUDGET_ID, items()), 'write-failed');
	});

	it('reports storage as unavailable for every operation, without throwing', () => {
		const storage = createBubuStorage(() => null);
		expectError(storage.readBudget(BUDGET_ID), 'unavailable');
		expectError(storage.readItems(BUDGET_ID), 'unavailable');
		expectError(storage.writeBudget(budget()), 'unavailable');
		expectError(storage.writeItems(BUDGET_ID, items()), 'unavailable');
		expectError(storage.listBudgets(), 'unavailable');
		expectError(storage.deleteBudget(BUDGET_ID), 'unavailable');
		expectError(storage.clearAll(), 'unavailable');
	});

	it('surfaces a failing delete', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		fake.failRemove = true;
		expectError(storage.deleteBudget(BUDGET_ID), 'write-failed');
	});
});

describe('browser access', () => {
	it('does not read browser globals when imported or created, only when used', () => {
		let reads = 0;
		const watched = new Proxy({}, { get: () => (reads++, undefined), set: () => (reads++, true) });
		vi.stubGlobal('localStorage', watched);

		const storage = createBubuStorage();
		expect(reads).toBe(0);

		// Prerender has no `window`: operations report unavailable without touching localStorage.
		expect(storage.readBudget(BUDGET_ID).ok).toBe(false);
		expect(reads).toBe(0);
		expect(getBrowserStorage()).toBeNull();
	});

	it('uses window.localStorage in the browser', () => {
		const fake = new FakeStorage();
		vi.stubGlobal('window', { localStorage: fake });
		expect(getBrowserStorage()).toBe(fake);
		const storage = createBubuStorage();
		expect(storage.writeBudget(budget()).ok).toBe(true);
		expect(fake.data.has(budgetKey(BUDGET_ID))).toBe(true);
	});

	it('treats a throwing localStorage getter (blocked cookies) as unavailable', () => {
		vi.stubGlobal('window', {
			get localStorage(): Storage {
				throw new DOMException('blocked', 'SecurityError');
			}
		});
		expect(getBrowserStorage()).toBeNull();
		expectError(createBubuStorage().readBudget(BUDGET_ID), 'unavailable');
	});
});

describe('delete and clear-data', () => {
	it('deletes one Budget and its Items only', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		storage.writeItems(BUDGET_ID, items());
		storage.writeBudget(budget({ id: OTHER_ID, name: 'Other' }));
		expect(storage.deleteBudget(BUDGET_ID).ok).toBe(true);
		expect([...fake.data.keys()]).toEqual([budgetKey(OTHER_ID)]);
	});

	it('clears only bubu: keys', () => {
		const { fake, storage } = setup();
		storage.writeBudget(budget());
		storage.writeItems(BUDGET_ID, items());
		fake.data.set('other-app:key', 'keep me');
		fake.data.set('bubu', 'not prefixed with a colon');

		expect(storage.clearAll()).toEqual({ ok: true, value: 2 });
		expect([...fake.data.keys()].sort()).toEqual(['bubu', 'other-app:key']);
	});
});
