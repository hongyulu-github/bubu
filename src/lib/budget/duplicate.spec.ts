import { describe, expect, it } from 'vitest';
import { calculateBudget } from './calculate';
import { duplicateBudget } from './duplicate';
import { createBudget, createItem, type Item } from './model';
import { toString } from './numbers';
import { buildItemTree } from './tree';
import { isUuid, validateBudgetData } from './validation';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const NOW = new Date('2026-09-10T11:12:13.000Z');

const budget = () =>
	createBudget({ id: BUDGET_ID, name: 'Wedding', currency: 'DKK', now: new Date('2026-01-02T03:04:05.000Z') });

function make(n: number, parent: number | null, sortIndex: number, unitPrice = '0', quantity = '1', unit?: string): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET_ID,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description: `Item ${n}`,
		unitPrice,
		quantity,
		unit
	});
}

/** 1 Venue(x2) > [2 Hall 4500.50 "day", 3 Decoration(x3) > [4 Flowers 85.50 x12, 5 Lights -240]], 6 Catering 7, 7 Solo (x0.5) */
const fixture = (): Item[] => [
	make(1, null, 0, '999', '2'),
	make(2, 1, 0, '4500.50', '1', 'day'),
	make(3, 1, 1, '0', '3'),
	make(4, 3, 0, '85.50', '12'),
	make(5, 3, 1, '-240'),
	make(6, null, 1, '7'),
	make(7, null, 2, '0.1000000000000000055511151231257827', '0.5')
];

function dup(items: Item[] = fixture(), options = {}) {
	const result = duplicateBudget(budget(), items, { now: NOW, ...options });
	if (!result.ok) throw new Error(`rejected: ${JSON.stringify(result.issues)}`);
	return result;
}

describe('identity remapping', () => {
	it('gives the copy a new Budget UUID and fresh UUIDs for every Item, reusing none', () => {
		const original = fixture();
		const { budget: copy, items } = dup(original);
		expect(isUuid(copy.id)).toBe(true);
		expect(copy.id).not.toBe(BUDGET_ID);

		const oldIds = new Set([BUDGET_ID, ...original.map((i) => i.id)]);
		const newIds = [copy.id, ...items.map((i) => i.id)];
		expect(new Set(newIds).size).toBe(newIds.length); // unique within the copy
		expect(newIds.every(isUuid)).toBe(true);
		expect(newIds.some((id) => oldIds.has(id))).toBe(false); // none reused from the original
	});

	it('remaps budgetId and every parentId to the new ids', () => {
		const original = fixture();
		const { budget: copy, items } = dup(original);
		const idMap = new Map(original.map((item, i) => [item.id, items[i].id]));

		items.forEach((item, i) => {
			expect(item.budgetId).toBe(copy.id);
			expect(item.parentId).toBe(original[i].parentId === null ? null : idMap.get(original[i].parentId!));
		});
		expect(validateBudgetData(copy, items)).toEqual([]); // no dangling or cross-Budget references
	});

	it('keeps the tree shape: same Codes, depths and Group/Line kinds in the same order', () => {
		const original = fixture();
		const { items } = dup(original);
		const shape = (list: Item[]) => buildItemTree(list).ordered.map((n) => [n.code, n.depth, n.kind, n.item.description]);
		expect(shape(items)).toEqual(shape(original));
	});

	it('keeps the array order and every sortIndex', () => {
		const original = fixture();
		const { items } = dup(original);
		expect(items.map((i) => i.description)).toEqual(original.map((i) => i.description));
		expect(items.map((i) => i.sortIndex)).toEqual(original.map((i) => i.sortIndex));
	});

	it('skips ids that were already used, however the id source behaves', () => {
		const original = fixture();
		const reused = [...original.map((i) => i.id), BUDGET_ID];
		let n = 1000;
		let call = 0;
		const newId = () => (call < reused.length ? reused[call++] : uuid(n++)); // first offers only old ids
		const { budget: copy, items } = dup(original, { newId });
		const oldIds = new Set([BUDGET_ID, ...original.map((i) => i.id)]);
		expect([copy.id, ...items.map((i) => i.id)].some((id) => oldIds.has(id))).toBe(false);
	});
});

describe('what is kept', () => {
	it('retains the currency and every Item value exactly, including precision and absent units', () => {
		const original = fixture();
		const { budget: copy, items } = dup(original);
		expect(copy.currency).toBe('DKK');
		items.forEach((item, i) => {
			expect(item.description).toBe(original[i].description);
			expect(item.unitPrice).toBe(original[i].unitPrice);
			expect(item.quantity).toBe(original[i].quantity);
			expect(item.unit).toBe(original[i].unit);
			expect('unit' in item).toBe('unit' in original[i]);
		});
		expect(items[6].unitPrice).toBe('0.1000000000000000055511151231257827');
	});

	it('calculates the same totals', () => {
		const original = fixture();
		const { items } = dup(original);
		expect(toString(calculateBudget(items).grandTotal)).toBe(toString(calculateBudget(original).grandTotal));
	});

	it('names the copy after the original, or as asked', () => {
		expect(dup().budget.name).toBe('Wedding (copy)');
		expect(dup(fixture(), { name: 'Wedding v2' }).budget.name).toBe('Wedding v2');
	});

	it('starts the copy with new timestamps', () => {
		const { budget: copy } = dup();
		expect(copy.createdAt).toBe('2026-09-10T11:12:13.000Z');
		expect(copy.updatedAt).toBe('2026-09-10T11:12:13.000Z');
		expect(copy.createdAt).not.toBe(budget().createdAt);
	});
});

describe('empty Budgets', () => {
	it('preserves an empty Item array', () => {
		const { budget: copy, items } = dup([]);
		expect(items).toEqual([]);
		expect(copy.id).not.toBe(BUDGET_ID);
		expect(copy.currency).toBe('DKK');
		expect(validateBudgetData(copy, items)).toEqual([]);
	});
});

describe('independence', () => {
	it('shares no objects with the original and never mutates it', () => {
		const original = Object.freeze(fixture().map((item) => Object.freeze({ ...item })));
		const frozenBudget = Object.freeze(budget());
		const result = duplicateBudget(frozenBudget, original as Item[], { now: NOW });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.budget).not.toBe(frozenBudget);
		result.items.forEach((item, i) => expect(item).not.toBe(original[i]));
		expect(original).toEqual(fixture());
		expect(frozenBudget).toEqual(budget());
	});

	it('lets the copy be changed without touching the original', () => {
		const original = fixture();
		const { items } = dup(original);
		items[0].description = 'changed';
		items[1].unitPrice = '1';
		expect(original[0].description).toBe('Item 1');
		expect(original[1].unitPrice).toBe('4500.50');
	});
});

describe('invalid input', () => {
	it('refuses to copy data that does not validate', () => {
		const dangling = [...fixture(), make(8, 99, 0)];
		const result = duplicateBudget(budget(), dangling, { now: NOW });
		expect(result.ok).toBe(false);
		expect(!result.ok && result.issues[0].code).toBe('dangling-parent');
		expect(duplicateBudget({ ...budget(), currency: 'x' }, [], { now: NOW }).ok).toBe(false);
	});
});

describe('size', () => {
	it('copies a deep chain', () => {
		const chain = Array.from({ length: 300 }, (_, i) => make(i + 1, i === 0 ? null : i, 0));
		const { items, budget: copy } = dup(chain);
		expect(items).toHaveLength(300);
		expect(validateBudgetData(copy, items)).toEqual([]);
		expect(buildItemTree(items).ordered.at(-1)!.depth).toBe(299);
	});
});
