import { describe, expect, it, vi } from 'vitest';
import { createItem, type Item } from '../budget/model';
import { CommandHistory, sessionHistory } from './commands';

const BUDGET_A = '11111111-1111-4111-8111-111111111111';
const BUDGET_B = '22222222-2222-4222-8222-222222222222';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

function item(n: number, overrides: Partial<Item> = {}): Item {
	return createItem({ id: uuid(n), budgetId: BUDGET_A, sortIndex: n, description: `item ${n}`, ...overrides });
}

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

// Four successive states of one Budget's Items: s0 -> s1 -> s2 -> s3.
const s0: Item[] = [];
const s1: Item[] = [item(1)];
const s2: Item[] = [item(1), item(2, { parentId: uuid(1), unitPrice: '0.1000000000000000055511151231257827' })];
const s3: Item[] = [
	item(1, { quantity: '2.5' }),
	item(2, { parentId: uuid(1), unitPrice: '-12.340', unit: 'hours' }),
	item(3, { sortIndex: 7 })
];

describe('empty stacks', () => {
	it('start empty for any Budget', () => {
		const history = new CommandHistory();
		expect(history.canUndo(BUDGET_A)).toBe(false);
		expect(history.canRedo(BUDGET_A)).toBe(false);
	});

	it('undo and redo do nothing and return null', () => {
		const history = new CommandHistory();
		expect(history.undo(BUDGET_A)).toBeNull();
		expect(history.redo(BUDGET_A)).toBeNull();
		expect(history.canUndo(BUDGET_A)).toBe(false);
		expect(history.canRedo(BUDGET_A)).toBe(false);
	});

	it('become empty again after undoing and redoing everything', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.undo(BUDGET_A);
		expect(history.undo(BUDGET_A)).toBeNull();
		history.redo(BUDGET_A);
		expect(history.redo(BUDGET_A)).toBeNull();
		expect(history.canRedo(BUDGET_A)).toBe(false);
	});
});

describe('execute, undo and redo', () => {
	it('execute returns the new Items and enables undo only', () => {
		const history = new CommandHistory();
		expect(history.execute(BUDGET_A, { before: s0, after: s1 })).toEqual(s1);
		expect(history.canUndo(BUDGET_A)).toBe(true);
		expect(history.canRedo(BUDGET_A)).toBe(false);
	});

	it('walks multiple undo and redo steps, reproducing complete arrays', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.execute(BUDGET_A, { before: s1, after: s2 });
		history.execute(BUDGET_A, { before: s2, after: s3 });

		expect(history.undo(BUDGET_A)).toEqual(s2);
		expect(history.undo(BUDGET_A)).toEqual(s1);
		expect(history.canUndo(BUDGET_A)).toBe(true);
		expect(history.canRedo(BUDGET_A)).toBe(true);
		expect(history.undo(BUDGET_A)).toEqual(s0);
		expect(history.canUndo(BUDGET_A)).toBe(false);

		expect(history.redo(BUDGET_A)).toEqual(s1);
		expect(history.redo(BUDGET_A)).toEqual(s2);
		expect(history.redo(BUDGET_A)).toEqual(s3);
		expect(history.canRedo(BUDGET_A)).toBe(false);
		expect(history.canUndo(BUDGET_A)).toBe(true);
	});

	it('preserves UUIDs, parentId, sortIndex, numeric precision, optional unit and array order', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s2, after: s3 });
		const restored = history.undo(BUDGET_A)!;

		expect(restored.map((i) => i.id)).toEqual(s2.map((i) => i.id));
		expect(restored[1].parentId).toBe(uuid(1));
		expect(restored[1].unitPrice).toBe('0.1000000000000000055511151231257827');
		expect('unit' in restored[0]).toBe(false);

		const redone = history.redo(BUDGET_A)!;
		expect(redone).toEqual(s3);
		expect(redone[1].unitPrice).toBe('-12.340');
		expect(redone[1].unit).toBe('hours');
		expect(redone[2].sortIndex).toBe(7);
		expect(redone[0].parentId).toBeNull();
	});
});

describe('branch invalidation', () => {
	it('executing after undo clears the redo stack', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.execute(BUDGET_A, { before: s1, after: s2 });
		history.undo(BUDGET_A);
		expect(history.canRedo(BUDGET_A)).toBe(true);

		history.execute(BUDGET_A, { before: s1, after: s3 });
		expect(history.canRedo(BUDGET_A)).toBe(false);
		expect(history.redo(BUDGET_A)).toBeNull();

		// The abandoned s2 is gone: undo leads back to s1, then s0.
		expect(history.undo(BUDGET_A)).toEqual(s1);
		expect(history.undo(BUDGET_A)).toEqual(s0);
		expect(history.undo(BUDGET_A)).toBeNull();
	});
});

describe('immutability', () => {
	it('does not mutate supplied arrays or Items', () => {
		const before = deepFreeze([item(1), item(2)]);
		const after = deepFreeze([item(1), item(2, { description: 'changed' })]);
		const history = new CommandHistory();
		expect(() => {
			history.execute(BUDGET_A, { before, after });
			history.undo(BUDGET_A);
			history.redo(BUDGET_A);
		}).not.toThrow();
	});

	it('is not affected by later edits to the arrays that were supplied', () => {
		const before: Item[] = [item(1)];
		const after: Item[] = [item(1, { description: 'after' })];
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before, after });

		before[0].description = 'tampered before';
		after[0].description = 'tampered after';
		after.push(item(9));

		expect(history.undo(BUDGET_A)).toEqual([item(1)]);
		expect(history.redo(BUDGET_A)).toEqual([item(1, { description: 'after' })]);
	});

	it('is not affected by edits to arrays it returns', () => {
		const history = new CommandHistory();
		const current = history.execute(BUDGET_A, { before: s0, after: s2 });
		current.length = 0;

		const restored = history.undo(BUDGET_A)!;
		restored.push(item(5));

		history.redo(BUDGET_A);
		const again = history.undo(BUDGET_A)!;
		expect(again).toEqual(s0);
		expect(history.redo(BUDGET_A)).toEqual(s2);
	});

	it('returns new arrays and Item objects, not the stored ones', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s1, after: s2 });
		const first = history.undo(BUDGET_A)!;
		history.redo(BUDGET_A);
		const second = history.undo(BUDGET_A)!;
		expect(first).not.toBe(second);
		expect(first[0]).not.toBe(second[0]);
		expect(first[0]).not.toBe(s1[0]);
	});
});

describe('independent Budgets', () => {
	it('never share command stacks', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });

		expect(history.canUndo(BUDGET_B)).toBe(false);
		expect(history.undo(BUDGET_B)).toBeNull();
		expect(history.canUndo(BUDGET_A)).toBe(true);

		history.execute(BUDGET_B, { before: s1, after: s2 });
		history.execute(BUDGET_B, { before: s2, after: s3 });
		history.undo(BUDGET_B);

		expect(history.canRedo(BUDGET_B)).toBe(true);
		expect(history.canRedo(BUDGET_A)).toBe(false);
		expect(history.undo(BUDGET_A)).toEqual(s0);
		expect(history.undo(BUDGET_B)).toEqual(s1);
		expect(history.canUndo(BUDGET_B)).toBe(false);
	});

	it('executing in one Budget does not clear the other Budget redo stack', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.undo(BUDGET_A);
		history.execute(BUDGET_B, { before: s0, after: s2 });
		expect(history.canRedo(BUDGET_A)).toBe(true);
	});

	it('keeps a Budget stack while another is in use (navigating away does not destroy it)', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.execute(BUDGET_A, { before: s1, after: s2 });
		// "Navigate" to Budget B and back.
		history.execute(BUDGET_B, { before: s0, after: s3 });
		history.undo(BUDGET_B);
		expect(history.undo(BUDGET_A)).toEqual(s1);
		expect(history.undo(BUDGET_A)).toEqual(s0);
	});

	it('is shared by the page-session singleton', () => {
		const id = '33333333-3333-4333-8333-333333333333';
		sessionHistory.execute(id, { before: s0, after: s1 });
		expect(sessionHistory.canUndo(id)).toBe(true);
		expect(sessionHistory.undo(id)).toEqual(s0);
	});
});

describe('clear', () => {
	it('discards one Budget undo and redo stacks and leaves the others', () => {
		const history = new CommandHistory();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.execute(BUDGET_A, { before: s1, after: s2 });
		history.undo(BUDGET_A);
		history.execute(BUDGET_B, { before: s0, after: s3 });

		history.clear(BUDGET_A);

		expect(history.canUndo(BUDGET_A)).toBe(false);
		expect(history.canRedo(BUDGET_A)).toBe(false);
		expect(history.undo(BUDGET_A)).toBeNull();
		expect(history.redo(BUDGET_A)).toBeNull();
		expect(history.canUndo(BUDGET_B)).toBe(true);
		expect(history.undo(BUDGET_B)).toEqual(s0);
	});

	it('does nothing for a Budget with no history, and lets the id start fresh afterwards', () => {
		const history = new CommandHistory();
		expect(() => history.clear(BUDGET_A)).not.toThrow();
		history.execute(BUDGET_A, { before: s0, after: s1 });
		history.clear(BUDGET_A);
		history.execute(BUDGET_A, { before: s1, after: s2 });
		expect(history.undo(BUDGET_A)).toEqual(s1);
		expect(history.canUndo(BUDGET_A)).toBe(false); // only the command after the clear remains
	});
});

describe('session-only memory', () => {
	it('a fresh module (a reload) starts with empty history', async () => {
		const id = '44444444-4444-4444-8444-444444444444';
		sessionHistory.execute(id, { before: s0, after: s1 });
		expect(sessionHistory.canUndo(id)).toBe(true);

		vi.resetModules();
		const reloaded = await import('./commands');
		expect(reloaded.sessionHistory.canUndo(id)).toBe(false);
		expect(reloaded.sessionHistory.canRedo(id)).toBe(false);
	});

	it('never touches localStorage or sessionStorage', async () => {
		let accesses = 0;
		const forbidden = new Proxy(
			{},
			{
				get() {
					accesses++;
					return undefined;
				},
				set() {
					accesses++;
					return true;
				}
			}
		);
		vi.stubGlobal('localStorage', forbidden);
		vi.stubGlobal('sessionStorage', forbidden);
		try {
			vi.resetModules();
			const { CommandHistory: Fresh, sessionHistory: session } = await import('./commands');
			const history = new Fresh();
			history.execute(BUDGET_A, { before: s0, after: s1 });
			history.undo(BUDGET_A);
			history.redo(BUDGET_A);
			session.execute(BUDGET_B, { before: s1, after: s2 });
			session.undo(BUDGET_B);
		} finally {
			vi.unstubAllGlobals();
		}
		expect(accesses).toBe(0);
	});
});
