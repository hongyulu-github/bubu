import { describe, expect, it } from 'vitest';
import { calculateBudget } from './calculate';
import { deleteItemSubtree, describeDeletion, normalizeParent } from './delete';
import { createItem, type Item } from './model';
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

/**
 * 1 Venue (qty 2, stored price 999 is hidden while it has children)
 *   1.1 Hall        10
 *   1.2 Decoration  (qty 3)
 *     1.2.1 Flowers 5
 *     1.2.2 Lights  4
 * 2 Catering        7
 * 3 Solo            (qty 4, unit "pcs", stored price 50)
 */
const fixture = (): Item[] => [
	make(1, null, 0, '999', '2'),
	make(2, 1, 0, '10'),
	make(3, 1, 1, '0', '3'),
	make(4, 3, 0, '5'),
	make(5, 3, 1, '4'),
	make(6, null, 1, '7'),
	make(7, null, 2, '50', '4', 'pcs')
];

const del = (items: Item[], id: number) => {
	const result = deleteItemSubtree(items, uuid(id));
	if (!result.ok) throw new Error('rejected');
	return result;
};
const codes = (items: readonly Item[]) => buildItemTree(items).ordered.map((n) => `${n.code} ${n.item.description}`);
const grand = (items: readonly Item[]) => toString(calculateBudget(items).grandTotal);

describe('deleting a Line', () => {
	it('removes just that Item and keeps everything else', () => {
		const before = fixture();
		const { items, removedIds } = del(before, 6); // Catering, a top-level Line
		expect(removedIds).toEqual([uuid(6)]);
		expect(items.map((i) => i.id)).toEqual([1, 2, 3, 4, 5, 7].map(uuid));
		items.forEach((item) => expect(item).toBe(before.find((b) => b.id === item.id)));
	});

	it('refreshes Codes and totals', () => {
		const before = fixture();
		expect(grand(before)).toBe('281'); // Venue 2 x (10 + 3 x 9) = 74, Catering 7, Solo 4 x 50 = 200
		const { items } = del(before, 6);
		expect(codes(items)).toContain('2 Item 7'); // Solo moved up from 3
		expect(grand(items)).toBe('274');
	});

	it('deletes a nested Line without normalizing a parent that still has children', () => {
		const before = fixture();
		const { items, normalizedParentId } = del(before, 2); // Hall; Venue still has Decoration
		expect(normalizedParentId).toBeNull();
		expect(items.find((i) => i.id === uuid(1))!.unitPrice).toBe('999');
		expect(codes(items)).toContain('1.1 Item 3');
	});
});

describe('deleting a Group subtree', () => {
	it('removes the Group and every descendant, leaving no orphans', () => {
		const { items, removedIds } = del(fixture(), 3); // Decoration with Flowers and Lights
		expect(removedIds).toEqual([3, 4, 5].map(uuid));
		expect(items.map((i) => i.id)).toEqual([1, 2, 6, 7].map(uuid));
		expect(validateItems(BUDGET, items)).toEqual([]); // no dangling parents
		expect(buildItemTree(items).unreachableIds).toEqual([]);
	});

	it('removes a whole top-level Group with nested Groups', () => {
		const { items, removedIds } = del(fixture(), 1);
		expect(removedIds).toEqual([1, 2, 3, 4, 5].map(uuid));
		expect(items.map((i) => i.id)).toEqual([6, 7].map(uuid));
		expect(codes(items)).toEqual(['1 Item 6', '2 Item 7']);
		expect(validateItems(BUDGET, items)).toEqual([]);
	});

	it('keeps sibling order and refreshes the totals', () => {
		const before = fixture();
		// before: Venue = 2 x (10 + 3 x 9) = 74; + 7 + 200 = 281
		expect(grand(before)).toBe('281');
		const { items } = del(before, 3);
		// after: Venue = 2 x 10 = 20; + 7 + 200 = 227
		expect(grand(items)).toBe('227');
		expect(codes(items)).toEqual(['1 Item 1', '1.1 Item 2', '2 Item 6', '3 Item 7']);
	});

	it('works deep in a long chain', () => {
		const chain = Array.from({ length: 300 }, (_, i) => make(i + 1, i === 0 ? null : i, 0));
		const { items, removedIds } = del(chain, 150);
		expect(removedIds).toHaveLength(151);
		expect(items).toHaveLength(149);
		expect(validateItems(BUDGET, items)).toEqual([]);
	});
});

describe('parent normalization', () => {
	it('resets the Unit price of a parent that loses its last child, keeping Description, Quantity and Unit', () => {
		const withUnit = fixture().map((i) => (i.id === uuid(3) ? { ...i, unit: 'sets', unitPrice: '77' } : i));

		const first = del(withUnit, 5); // Lights goes; Flowers is still there
		expect(first.normalizedParentId).toBeNull();
		expect(first.items.find((i) => i.id === uuid(3))!.unitPrice).toBe('77');

		const second = del(first.items, 4); // Flowers was the last child
		expect(second.normalizedParentId).toBe(uuid(3));
		expect(second.items.find((i) => i.id === uuid(3))).toMatchObject({
			unitPrice: '0',
			quantity: '3',
			unit: 'sets',
			description: 'Item 3'
		});
	});

	it('normalizes the former parent when the deleted Item was its only child', () => {
		const items = [make(1, null, 0, '999', '2', 'lot'), make(2, 1, 0, '10')];
		const result = del(items, 2);
		expect(result.normalizedParentId).toBe(uuid(1));
		expect(result.items).toEqual([{ ...items[0], unitPrice: '0' }]);
		expect(grand(result.items)).toBe('0'); // not 2 x 999
	});

	it('does not touch a top-level Item that has no parent', () => {
		expect(del(fixture(), 7).normalizedParentId).toBeNull();
	});

	it('can be reused on its own (for reparenting): only a childless parent changes', () => {
		const items = [make(1, null, 0, '999'), make(2, 1, 0, '10'), make(3, null, 1, '8')];
		expect(normalizeParent(items, uuid(1))).toBe(items); // still has a child
		expect(normalizeParent(items, null)).toBe(items);
		expect(normalizeParent(items, uuid(404))).toBe(items);

		const childless = items.filter((i) => i.id !== uuid(2));
		const normalized = normalizeParent(childless, uuid(1));
		expect(normalized.find((i) => i.id === uuid(1))!.unitPrice).toBe('0');
		expect(normalized.find((i) => i.id === uuid(3))).toBe(childless.find((i) => i.id === uuid(3)));
	});

	it('leaves a parent that is already at 0 untouched', () => {
		const items = [make(1, null, 0, '0')];
		expect(normalizeParent(items, uuid(1))).toBe(items);
	});
});

describe('describeDeletion', () => {
	it('names a Group subtree in display order', () => {
		const impact = describeDeletion(fixture(), uuid(1))!;
		expect(impact.kind).toBe('group');
		expect(impact.description).toBe('Item 1');
		expect(impact.descendantDescriptions).toEqual(['Item 2', 'Item 3', 'Item 4', 'Item 5']);
		expect(impact.parent).toBeNull();
	});

	it('reports a Line with nothing beneath it', () => {
		const impact = describeDeletion(fixture(), uuid(6))!;
		expect(impact).toMatchObject({ kind: 'line', descendantDescriptions: [] });
	});

	it('says when the parent would become a Line', () => {
		const items = [make(1, null, 0, '5'), make(2, 1, 0), make(3, 1, 1)];
		expect(describeDeletion(items, uuid(2))!.parent).toEqual({ id: uuid(1), description: 'Item 1', becomesLine: false });
		expect(describeDeletion(items.slice(0, 2), uuid(2))!.parent).toEqual({ id: uuid(1), description: 'Item 1', becomesLine: true });
	});

	it('is null for an unknown Item', () => {
		expect(describeDeletion(fixture(), uuid(999))).toBeNull();
	});
});

describe('safety', () => {
	it('rejects an unknown Item', () => {
		expect(deleteItemSubtree(fixture(), uuid(999))).toEqual({ ok: false, reason: 'unknown-item' });
	});

	it('never mutates the input array or its Items', () => {
		const frozen = Object.freeze(fixture().map((item) => Object.freeze({ ...item })));
		expect(() => {
			deleteItemSubtree(frozen as Item[], uuid(1));
			deleteItemSubtree(frozen as Item[], uuid(3));
			deleteItemSubtree(frozen as Item[], uuid(7));
		}).not.toThrow();
		expect(frozen).toEqual(fixture());
	});
});
