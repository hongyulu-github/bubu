import { describe, expect, it } from 'vitest';
import { createItem, deriveItemKinds, type Item } from './model';
import {
	buildItemTree,
	canMoveUnder,
	deriveCodes,
	getAncestorIds,
	getDescendantIds,
	getSiblings,
	getSubtreeIds,
	isDescendantOf
} from './tree';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

/** Item with a readable numeric id: uuid(n) so ids sort in the same order as n. */
function item(n: number, parentId: number | null, sortIndex: number): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET_ID,
		parentId: parentId === null ? null : uuid(parentId),
		sortIndex,
		description: `item ${n}`
	});
}

/**
 * 1 Venue (1)
 *   1.1 Hall (2)
 *     1.1.1 Rent (3)
 *     1.1.2 Cleaning (4)
 *   1.2 Garden (5)
 * 2 Catering (6)
 *   2.1 Food (7)
 * 3 Music (8)
 */
function fixture(): Item[] {
	return [
		item(1, null, 0),
		item(2, 1, 0),
		item(3, 2, 0),
		item(4, 2, 1),
		item(5, 1, 1),
		item(6, null, 1),
		item(7, 6, 0),
		item(8, null, 2)
	];
}

const codeOf = (items: Item[]) =>
	Object.fromEntries([...deriveCodes(items)].map(([id, code]) => [Number(id.slice(-12)), code]));

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

describe('buildItemTree', () => {
	it('derives outline Codes for multiple roots and nested Items', () => {
		expect(codeOf(fixture())).toEqual({
			1: '1',
			2: '1.1',
			3: '1.1.1',
			4: '1.1.2',
			5: '1.2',
			6: '2',
			7: '2.1',
			8: '3'
		});
	});

	it('lists nodes depth-first in display order with depth and kind', () => {
		const tree = buildItemTree(fixture());
		expect(tree.ordered.map((node) => node.code)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '2', '2.1', '3']);
		expect(tree.ordered.map((node) => node.depth)).toEqual([0, 1, 2, 2, 1, 0, 1, 0]);
		expect(tree.roots.map((node) => node.item.id)).toEqual([uuid(1), uuid(6), uuid(8)]);
		expect(tree.unreachableIds).toEqual([]);
	});

	it('derives Group and Line from children and agrees with deriveItemKinds', () => {
		const items = fixture();
		const tree = buildItemTree(items);
		const kinds = deriveItemKinds(items);
		for (const node of tree.ordered) expect(node.kind).toBe(kinds.get(node.item.id));
		expect(tree.nodes.get(uuid(1))?.kind).toBe('group');
		expect(tree.nodes.get(uuid(3))?.kind).toBe('line');
		expect(tree.nodes.get(uuid(8))?.kind).toBe('line');
	});

	it('handles an empty array and a single Item', () => {
		expect(buildItemTree([]).ordered).toEqual([]);
		expect(codeOf([item(1, null, 0)])).toEqual({ 1: '1' });
	});

	it('orders siblings by sortIndex, not by array position', () => {
		const items = [item(1, null, 5), item(2, null, 1), item(3, null, 3)];
		expect(buildItemTree(items).roots.map((node) => node.item.id)).toEqual([uuid(2), uuid(3), uuid(1)]);
		expect(codeOf(items)).toEqual({ 2: '1', 3: '2', 1: '3' });
	});

	it('is deterministic: sortIndex ties break by id regardless of input order', () => {
		const tied = [item(3, null, 0), item(1, null, 0), item(2, null, 0)];
		const expected = [uuid(1), uuid(2), uuid(3)];
		expect(buildItemTree(tied).roots.map((node) => node.item.id)).toEqual(expected);
		expect(buildItemTree([...tied].reverse()).roots.map((node) => node.item.id)).toEqual(expected);
	});

	it('gives the same result for any input permutation', () => {
		const items = fixture();
		const reversed = [...items].reverse();
		const shuffled = [items[4], items[0], items[7], items[2], items[6], items[1], items[5], items[3]];
		const expected = buildItemTree(items).ordered.map((node) => [node.item.id, node.code]);
		for (const permutation of [reversed, shuffled]) {
			expect(buildItemTree(permutation).ordered.map((node) => [node.item.id, node.code])).toEqual(expected);
		}
	});
});

describe('recomputation after changes', () => {
	it('recomputes Codes when siblings are reordered', () => {
		const items = fixture();
		const reordered = items.map((candidate) =>
			candidate.id === uuid(6) ? { ...candidate, sortIndex: -1 } : candidate
		);
		const codes = codeOf(reordered);
		expect(codes[6]).toBe('1');
		expect(codes[7]).toBe('1.1');
		expect(codes[1]).toBe('2');
		expect(codes[3]).toBe('2.1.1');
		expect(codes[8]).toBe('3');
	});

	it('recomputes Codes when an Item moves under another parent', () => {
		const moved = fixture().map((candidate) =>
			candidate.id === uuid(8) ? { ...candidate, parentId: uuid(5), sortIndex: 0 } : candidate
		);
		const codes = codeOf(moved);
		expect(codes[8]).toBe('1.2.1');
		expect(buildItemTree(moved).nodes.get(uuid(5))?.kind).toBe('group');
	});

	it('recomputes Codes and kinds when an Item is inserted', () => {
		const inserted = [...fixture(), item(9, 8, 0)];
		const tree = buildItemTree(inserted);
		expect(tree.nodes.get(uuid(9))?.code).toBe('3.1');
		expect(tree.nodes.get(uuid(8))?.kind).toBe('group');
	});

	it('recomputes Codes and kinds when an Item is removed', () => {
		const withoutFood = fixture().filter((candidate) => candidate.id !== uuid(7));
		const tree = buildItemTree(withoutFood);
		expect(tree.nodes.get(uuid(6))?.kind).toBe('line');
		expect(tree.nodes.has(uuid(7))).toBe(false);

		const withoutCatering = fixture().filter((candidate) => ![6, 7].includes(Number(candidate.id.slice(-12))));
		expect(codeOf(withoutCatering)[8]).toBe('2');
	});

	it('never adds Code or other derived fields to stored Items', () => {
		const items = fixture();
		const before = JSON.stringify(items);
		const tree = buildItemTree(items);
		expect(JSON.stringify(items)).toBe(before);
		for (const stored of items) {
			expect(Object.keys(stored)).not.toContain('code');
			expect(Object.keys(stored)).not.toContain('depth');
		}
		// Nodes reference the very same Item objects.
		expect(tree.nodes.get(uuid(3))?.item).toBe(items[2]);
	});

	it('does not mutate the input array or its Items (frozen input)', () => {
		const items = deepFreeze(fixture().reverse());
		expect(() => {
			const tree = buildItemTree(items);
			deriveCodes(items);
			getDescendantIds(tree, uuid(1));
			getAncestorIds(tree, uuid(3));
		}).not.toThrow();
		expect(items.map((candidate) => candidate.id)).toEqual(fixture().reverse().map((candidate) => candidate.id));
	});
});

describe('ancestor and descendant helpers', () => {
	const tree = buildItemTree(fixture());

	it('returns ancestors from the top-level Item down to the parent', () => {
		expect(getAncestorIds(tree, uuid(3))).toEqual([uuid(1), uuid(2)]);
		expect(getAncestorIds(tree, uuid(1))).toEqual([]);
		expect(getAncestorIds(tree, uuid(999))).toEqual([]);
	});

	it('returns descendants in display order, excluding the Item itself', () => {
		expect(getDescendantIds(tree, uuid(1))).toEqual([uuid(2), uuid(3), uuid(4), uuid(5)]);
		expect(getDescendantIds(tree, uuid(2))).toEqual([uuid(3), uuid(4)]);
		expect(getDescendantIds(tree, uuid(8))).toEqual([]);
		expect(getDescendantIds(tree, uuid(999))).toEqual([]);
	});

	it('returns the whole subtree including the Item, for subtree moves and deletes', () => {
		expect(getSubtreeIds(tree, uuid(6))).toEqual([uuid(6), uuid(7)]);
		expect(getSubtreeIds(tree, uuid(999))).toEqual([]);
	});

	it('tests descendant relationships', () => {
		expect(isDescendantOf(tree, uuid(3), uuid(1))).toBe(true);
		expect(isDescendantOf(tree, uuid(3), uuid(2))).toBe(true);
		expect(isDescendantOf(tree, uuid(1), uuid(3))).toBe(false);
		expect(isDescendantOf(tree, uuid(1), uuid(1))).toBe(false);
		expect(isDescendantOf(tree, uuid(7), uuid(1))).toBe(false);
	});

	it('returns siblings in order, for roots and children', () => {
		expect(getSiblings(tree, uuid(6)).map((node) => node.item.id)).toEqual([uuid(1), uuid(6), uuid(8)]);
		expect(getSiblings(tree, uuid(4)).map((node) => node.item.id)).toEqual([uuid(3), uuid(4)]);
		expect(getSiblings(tree, uuid(999))).toEqual([]);
	});

	it('rejects moves that would create a cycle', () => {
		expect(canMoveUnder(tree, uuid(1), uuid(1))).toBe(false);
		expect(canMoveUnder(tree, uuid(1), uuid(3))).toBe(false);
		expect(canMoveUnder(tree, uuid(2), uuid(4))).toBe(false);
	});

	it('allows safe moves, including to the top level', () => {
		expect(canMoveUnder(tree, uuid(3), uuid(6))).toBe(true);
		expect(canMoveUnder(tree, uuid(3), uuid(2))).toBe(true);
		expect(canMoveUnder(tree, uuid(3), null)).toBe(true);
		expect(canMoveUnder(tree, uuid(2), uuid(8))).toBe(true);
	});

	it('rejects moves involving unknown Items', () => {
		expect(canMoveUnder(tree, uuid(999), uuid(1))).toBe(false);
		expect(canMoveUnder(tree, uuid(1), uuid(999))).toBe(false);
	});
});

describe('invalid and extreme data', () => {
	it('leaves out dangling and cyclic Items instead of looping', () => {
		const a = item(1, null, 0);
		const b = item(2, 3, 0);
		const c = item(3, 2, 0);
		const orphan = item(4, 99, 0);
		const tree = buildItemTree([a, b, c, orphan]);
		expect(tree.ordered.map((node) => node.item.id)).toEqual([uuid(1)]);
		expect(new Set(tree.unreachableIds)).toEqual(new Set([uuid(2), uuid(3), uuid(4)]));
	});

	it('handles deep nesting without recursion', () => {
		const depth = 20_000;
		const items = Array.from({ length: depth }, (_, i) => item(i + 1, i === 0 ? null : i, 0));
		const tree = buildItemTree(items);
		expect(tree.ordered).toHaveLength(depth);
		expect(tree.ordered.at(-1)?.depth).toBe(depth - 1);
		expect(getDescendantIds(tree, uuid(1))).toHaveLength(depth - 1);
		expect(getAncestorIds(tree, uuid(depth))).toHaveLength(depth - 1);
		expect(canMoveUnder(tree, uuid(1), uuid(depth))).toBe(false);
		expect(tree.ordered[2].code).toBe('1.1.1');
	});

	it('handles many siblings', () => {
		const items = Array.from({ length: 5_000 }, (_, i) => item(i + 1, null, 5_000 - i));
		const tree = buildItemTree(items);
		expect(tree.roots[0].item.id).toBe(uuid(5_000));
		expect(tree.roots.at(-1)?.code).toBe('5000');
	});
});
