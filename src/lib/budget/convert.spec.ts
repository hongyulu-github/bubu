import { describe, expect, it } from 'vitest';
import { calculateBudget } from './calculate';
import { convertLineToGroup, describeConversion } from './convert';
import { insertChildItem } from './insert';
import { createItem, deriveItemKinds, type Item } from './model';
import { toString } from './numbers';
import { buildItemTree } from './tree';
import { validateItems } from './validation';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function make(n: number, parent: number | null, sortIndex: number, unitPrice = '0', quantity = '1', unit?: string): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description: `Item ${n}`,
		unitPrice,
		quantity,
		unit
	});
}

const grand = (items: readonly Item[]) => toString(calculateBudget(items).grandTotal);
const child = (items: Item[], parent: number, fields = {}) => {
	const result = insertChildItem(items, uuid(parent), fields);
	if (!result.ok) throw new Error('rejected');
	return result;
};

describe('describeConversion', () => {
	it('describes a Line, with its manual price, Quantity and Unit', () => {
		const items = [make(1, null, 0, '-250.50', '3', 'days')];
		expect(describeConversion(items, uuid(1))).toEqual({
			parentId: uuid(1),
			description: 'Item 1',
			unitPrice: '-250.50',
			quantity: '3',
			unit: 'days'
		});
	});

	it('is null for a Group and for an unknown Item (nothing to convert)', () => {
		const items = [make(1, null, 0), make(2, 1, 0)];
		expect(describeConversion(items, uuid(1))).toBeNull();
		expect(describeConversion(items, uuid(404))).toBeNull();
	});
});

describe('convertLineToGroup', () => {
	it('resets only the Line manual price, keeping Description, Quantity and Unit', () => {
		const items = [make(1, null, 0, '4500.50', '3', 'days'), make(2, null, 1, '9')];
		const converted = convertLineToGroup(items, uuid(1));
		expect(converted[0]).toEqual({ ...items[0], unitPrice: '0' });
		expect(converted[1]).toBe(items[1]);
	});

	it('does nothing for a Group, an unknown Item, or a price that is already 0', () => {
		const group = [make(1, null, 0, '5'), make(2, 1, 0)];
		expect(convertLineToGroup(group, uuid(1))).toBe(group);
		expect(convertLineToGroup(group, uuid(404))).toBe(group);
		const zero = [make(1, null, 0, '0')];
		expect(convertLineToGroup(zero, uuid(1))).toBe(zero);
	});

	it('does not mutate its input', () => {
		const frozen = Object.freeze([Object.freeze(make(1, null, 0, '7'))]);
		expect(() => convertLineToGroup(frozen as Item[], uuid(1))).not.toThrow();
		expect(frozen[0].unitPrice).toBe('7');
	});
});

describe('insertChildItem on a Line (conversion)', () => {
	it('converts a Line with a positive manual price: price replaced, Quantity kept, child defaults', () => {
		const items = [make(1, null, 0, '4500.50', '2', 'day')];
		const result = child(items, 1);
		expect(result.converted).toBe(true);
		expect(result.previousUnitPrice).toBe('4500.50');

		const parent = result.items.find((i) => i.id === uuid(1))!;
		expect(parent).toMatchObject({ unitPrice: '0', quantity: '2', unit: 'day', description: 'Item 1' });
		expect(result.item).toMatchObject({ parentId: uuid(1), quantity: '1', unitPrice: '0', description: '', budgetId: BUDGET });
		expect('unit' in result.item).toBe(false);
		expect(deriveItemKinds(result.items).get(uuid(1))).toBe('group');
	});

	it('converts a Line with a negative manual price', () => {
		const result = child([make(1, null, 0, '-250.5', '4')], 1);
		expect(result.previousUnitPrice).toBe('-250.5');
		expect(result.items.find((i) => i.id === uuid(1))).toMatchObject({ unitPrice: '0', quantity: '4' });
	});

	it('keeps a Quantity greater than 1 rather than resetting it', () => {
		for (const quantity of ['2', '12.5', '0.25', '1000']) {
			const result = child([make(1, null, 0, '10', quantity)], 1);
			expect(result.items.find((i) => i.id === uuid(1))!.quantity).toBe(quantity);
		}
	});

	it('converts a Line whose manual price is already 0 without altering it', () => {
		const result = child([make(1, null, 0, '0', '3')], 1);
		expect(result.converted).toBe(true);
		expect(result.previousUnitPrice).toBe('0');
		expect(result.items.find((i) => i.id === uuid(1))).toMatchObject({ unitPrice: '0', quantity: '3' });
	});

	it('changes the totals as the replacement implies: the Group is now priced from its children', () => {
		const items = [make(1, null, 0, '100', '2')];
		expect(grand(items)).toBe('200');
		expect(grand(child(items, 1).items)).toBe('0'); // 2 x (a new 0-priced child)
	});

	it('places the new child as the first child with sortIndex 0', () => {
		const result = child([make(1, null, 0, '5')], 1);
		expect(result.item.sortIndex).toBe(0);
		expect(buildItemTree(result.items).nodes.get(result.item.id)!.code).toBe('1.1');
	});
});

describe('insertChildItem on a Group (no conversion)', () => {
	const group = () => [make(1, null, 0, '999', '2'), make(2, 1, 0, '10'), make(3, 1, 5, '20')];

	it('appends after the last child and converts nothing', () => {
		const items = group();
		const result = child(items, 1, { description: 'New' });
		expect(result.converted).toBe(false);
		expect(result.previousUnitPrice).toBeUndefined();
		expect(result.item.sortIndex).toBe(6);
		expect(buildItemTree(result.items).nodes.get(result.item.id)!.code).toBe('1.3');
	});

	it('leaves the parent and every existing Item exactly as they were', () => {
		const items = group();
		const result = child(items, 1);
		result.items.slice(0, -1).forEach((item, i) => expect(item).toBe(items[i]));
		expect(result.items.find((i) => i.id === uuid(1))!.unitPrice).toBe('999');
	});

	it('does not change the Budget total (a new child is 0 x 1)', () => {
		const items = group();
		expect(grand(child(items, 1).items)).toBe(grand(items));
	});
});

describe('insertChildItem at any depth', () => {
	it('adds a child to a nested Line, converting it', () => {
		const items = [make(1, null, 0), make(2, 1, 0), make(3, 2, 0, '40', '2')];
		const result = child(items, 3);
		expect(result.converted).toBe(true);
		expect(buildItemTree(result.items).nodes.get(result.item.id)!.code).toBe('1.1.1.1');
		expect(validateItems(BUDGET, result.items)).toEqual([]);
	});

	it('works at a depth of several hundred levels', () => {
		const chain = Array.from({ length: 400 }, (_, i) => make(i + 1, i === 0 ? null : i, 0, i === 399 ? '5' : '0'));
		const result = child(chain, 400);
		expect(result.converted).toBe(true);
		expect(buildItemTree(result.items).nodes.get(result.item.id)!.depth).toBe(400);
		expect(validateItems(BUDGET, result.items)).toEqual([]);
	});
});

describe('safety', () => {
	it('rejects an unknown parent', () => {
		expect(insertChildItem([make(1, null, 0)], uuid(404))).toEqual({ ok: false, reason: 'unknown-item' });
	});

	it('never mutates the input array or its Items', () => {
		const frozen = Object.freeze([make(1, null, 0, '5', '2'), make(2, null, 1)].map((i) => Object.freeze(i)));
		expect(() => {
			insertChildItem(frozen as Item[], uuid(1));
			insertChildItem(frozen as Item[], uuid(2));
		}).not.toThrow();
		expect(frozen[0].unitPrice).toBe('5');
	});
});
