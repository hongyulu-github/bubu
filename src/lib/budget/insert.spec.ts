import { describe, expect, it } from 'vitest';
import { calculateBudget } from './calculate';
import { insertSiblingItem, insertTopLevelItem } from './insert';
import { createItem, deriveItemKinds, type Item } from './model';
import { toString } from './numbers';
import { buildItemTree } from './tree';
import { isUuid, validateItems } from './validation';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function make(n: number, parent: number | null, sortIndex: number, unitPrice = '0', quantity = '1'): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description: `Item ${n}`,
		unitPrice,
		quantity
	});
}

/**
 * 1 Venue            (sort 0)
 *   1.1 Hall         (sort 0)
 *   1.2 Decoration   (sort 1)
 *     1.2.1 Flowers  (sort 0)
 * 2 Catering         (sort 1)
 */
const fixture = () => [make(1, null, 0), make(2, 1, 0, '4500'), make(3, 1, 1), make(4, 3, 0, '85.50', '12'), make(5, null, 1, '100')];

const codes = (items: readonly Item[]) =>
	Object.fromEntries(buildItemTree(items).ordered.map((node) => [node.item.description || '(new)', node.code]));

function topLevel(items: Item[], fields = {}) {
	const result = insertTopLevelItem(items, BUDGET, fields);
	if (!result.ok) throw new Error('rejected');
	return result;
}
function sibling(items: Item[], siblingId: string, fields = {}) {
	const result = insertSiblingItem(items, siblingId, fields);
	if (!result.ok) throw new Error('rejected');
	return result;
}

describe('a new Item', () => {
	it('is a Line with an empty Description, Quantity 1, Unit price 0 and no Unit', () => {
		const { item } = topLevel([]);
		expect(item).toMatchObject({ description: '', quantity: '1', unitPrice: '0', parentId: null, budgetId: BUDGET });
		expect('unit' in item).toBe(false);
		expect(isUuid(item.id)).toBe(true);
	});

	it('takes optional fields, including a Unit', () => {
		const { item } = topLevel([], { id: uuid(42), description: 'Cake', unit: 'pcs', quantity: '2.5', unitPrice: '-3' });
		expect(item).toMatchObject({ id: uuid(42), description: 'Cake', unit: 'pcs', quantity: '2.5', unitPrice: '-3' });
	});

	it('gets a fresh UUID each time', () => {
		const ids = new Set<string>();
		let items: Item[] = [];
		for (let i = 0; i < 20; i++) {
			const result = topLevel(items);
			items = result.items;
			ids.add(result.item.id);
		}
		expect(ids.size).toBe(20);
	});
});

describe('top-level insertion', () => {
	it('adds the first Item to an empty Budget', () => {
		const { items, item } = topLevel([]);
		expect(items).toEqual([item]);
		expect(item.sortIndex).toBe(0);
		expect(codes(items)).toEqual({ '(new)': '1' });
		expect(toString(calculateBudget(items).grandTotal)).toBe('0');
	});

	it('appends after the last top-level Item and leaves everything else untouched', () => {
		const before = fixture();
		const { items, item } = topLevel(before, { description: 'Music' });
		expect(items.slice(0, -1)).toEqual(before);
		items.slice(0, -1).forEach((existing, i) => expect(existing).toBe(before[i]));
		expect(item.parentId).toBeNull();
		expect(codes(items)['Music']).toBe('3');
		expect(buildItemTree(items).roots.map((n) => n.item.description)).toEqual(['Item 1', 'Item 5', 'Music']);
	});

	it('goes after the last root even when sortIndex values have gaps', () => {
		const { item } = topLevel([make(1, null, 0), make(2, null, 7)]);
		expect(item.sortIndex).toBe(8);
	});

	it('keeps adding in insertion order', () => {
		let items: Item[] = [];
		for (const description of ['a', 'b', 'c']) items = topLevel(items, { description }).items;
		expect(buildItemTree(items).roots.map((n) => `${n.code} ${n.item.description}`)).toEqual(['1 a', '2 b', '3 c']);
	});

	it('does not change the Budget total (a new Line is 0 x 1)', () => {
		const before = fixture();
		expect(toString(calculateBudget(topLevel(before).items).grandTotal)).toBe(toString(calculateBudget(before).grandTotal));
	});
});

describe('sibling insertion', () => {
	it('inserts directly after a top-level sibling and renumbers the Codes below', () => {
		const { items, item } = sibling(fixture(), uuid(1), { description: 'Flowers & co' });
		expect(item.parentId).toBeNull();
		const tree = buildItemTree(items);
		expect(tree.roots.map((n) => `${n.code} ${n.item.description}`)).toEqual(['1 Item 1', '2 Flowers & co', '3 Item 5']);
		expect(tree.nodes.get(uuid(5))!.code).toBe('3'); // Catering moved down
		expect(tree.nodes.get(uuid(4))!.code).toBe('1.2.1'); // unrelated nesting intact
	});

	it('inserts after a nested sibling under the same parent', () => {
		const { items, item } = sibling(fixture(), uuid(2), { description: 'New' });
		expect(item.parentId).toBe(uuid(1));
		const codesNow = codes(items);
		expect(codesNow).toMatchObject({ 'Item 2': '1.1', New: '1.2', 'Item 3': '1.3', 'Item 4': '1.3.1' });
	});

	it('inserts after the last sibling (the end of the list)', () => {
		const { items } = sibling(fixture(), uuid(3), { description: 'Last' });
		expect(codes(items)).toMatchObject({ 'Item 3': '1.2', Last: '1.3' });
	});

	it('puts the new Item beside a Group, not inside it', () => {
		const { items, item } = sibling(fixture(), uuid(3)); // Decoration is a Group (has Flowers)
		expect(item.parentId).toBe(uuid(1));
		expect(deriveItemKinds(items).get(item.id)).toBe('line');
		expect(deriveItemKinds(items).get(uuid(3))).toBe('group');
		expect(buildItemTree(items).nodes.get(uuid(4))!.parentId).toBe(uuid(3)); // children stay with their Group
	});

	it('inserts in the middle without disturbing earlier siblings', () => {
		const before = [make(1, null, 0), make(2, null, 1), make(3, null, 2)];
		const { items } = sibling(before, uuid(1), { description: 'mid' });
		expect(items.find((i) => i.id === uuid(1))).toBe(before[0]); // not even re-created
		expect(buildItemTree(items).roots.map((n) => n.item.description)).toEqual(['Item 1', 'mid', 'Item 2', 'Item 3']);
	});

	it('inserts correctly when sortIndex values are tied or sparse', () => {
		const before = [make(1, null, 0), make(2, null, 0), make(3, null, 10)];
		const { items } = sibling(before, uuid(2), { description: 'new' });
		expect(buildItemTree(items).roots.map((n) => n.item.description)).toEqual(['Item 1', 'Item 2', 'new', 'Item 3']);
		expect(new Set(items.map((i) => i.sortIndex)).size).toBe(4); // no ties left among these siblings
	});

	it('inserting repeatedly after the same sibling keeps newest-first right after it', () => {
		let items = [make(1, null, 0), make(2, null, 1)];
		for (const description of ['x', 'y']) items = sibling(items, uuid(1), { description }).items;
		expect(buildItemTree(items).roots.map((n) => n.item.description)).toEqual(['Item 1', 'y', 'x', 'Item 2']);
	});

	it('rejects an unknown sibling and returns no new array', () => {
		expect(insertSiblingItem(fixture(), uuid(999))).toEqual({ ok: false, reason: 'unknown-item' });
	});
});

describe('integrity', () => {
	it('keeps every existing id and parent reference, and the result validates', () => {
		const before = fixture();
		for (const result of [topLevel(before), sibling(before, uuid(2)), sibling(before, uuid(5)), sibling(before, uuid(4))]) {
			expect(validateItems(BUDGET, result.items)).toEqual([]);
			expect(result.items).toHaveLength(before.length + 1);
			for (const existing of before) {
				const after = result.items.find((i) => i.id === existing.id)!;
				expect(after.parentId).toBe(existing.parentId);
				expect(after.description).toBe(existing.description);
				expect(after.unitPrice).toBe(existing.unitPrice);
				expect(after.quantity).toBe(existing.quantity);
			}
		}
	});

	it('never mutates the input array or its Items', () => {
		const frozen = Object.freeze(fixture().map((item) => Object.freeze({ ...item })));
		expect(() => {
			insertTopLevelItem(frozen as Item[], BUDGET);
			insertSiblingItem(frozen as Item[], uuid(1));
			insertSiblingItem(frozen as Item[], uuid(3));
		}).not.toThrow();
		expect(frozen).toEqual(fixture());
	});

	it('works at depth: a sibling deep in the tree', () => {
		const deep = Array.from({ length: 200 }, (_, i) => make(i + 1, i === 0 ? null : i, 0));
		const { items, item } = sibling(deep, uuid(200), { description: 'deep sibling' });
		expect(item.parentId).toBe(uuid(199));
		expect(validateItems(BUDGET, items)).toEqual([]);
		expect(buildItemTree(items).nodes.get(item.id)!.depth).toBe(199);
	});
});
