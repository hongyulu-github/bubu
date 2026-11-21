import { describe, expect, it } from 'vitest';
import { createItem, type Item } from './model';
import { calculateBudget } from './calculate';
import { reorderSibling, reparentSubtree } from './moves';
import { toString } from './numbers';
import { buildItemTree } from './tree';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function make(n: number, parent: number | null, sortIndex: number, extra: Partial<Item> = {}): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description: `Item ${n}`,
		unitPrice: '-19.99',
		quantity: '0.5',
		unit: 'h',
		...extra
	});
}

// Top level: 1 (Group: 2, 3, 4), 5, 6, 7. Item 3 has a child, 8.
const sample = () => [
	make(1, null, 0),
	make(2, 1, 0),
	make(3, 1, 1),
	make(4, 1, 2),
	make(5, null, 1),
	make(6, null, 2),
	make(7, null, 3),
	make(8, 3, 0)
];

const order = (items: readonly Item[], parent: number | null) =>
	(parent === null ? buildItemTree(items).roots : buildItemTree(items).nodes.get(uuid(parent))!.children).map(
		(node) => Number(node.item.id.slice(-12))
	);
const move = (items: Item[], drag: number, target: number, intent: 'before' | 'after') => {
	const result = reorderSibling(items, uuid(drag), uuid(target), intent);
	if (!result.ok) throw new Error(result.reason);
	return result;
};

describe('reorderSibling', () => {
	it('moves an Item before or after a sibling at the top level', () => {
		expect(order(move(sample(), 7, 5, 'before').items, null)).toEqual([1, 7, 5, 6]);
		expect(order(move(sample(), 5, 7, 'after').items, null)).toEqual([1, 6, 7, 5]);
		expect(order(move(sample(), 1, 6, 'after').items, null)).toEqual([5, 6, 1, 7]);
	});

	it('reaches the first and last positions', () => {
		expect(order(move(sample(), 7, 1, 'before').items, null)).toEqual([7, 1, 5, 6]);
		expect(order(move(sample(), 1, 7, 'after').items, null)).toEqual([5, 6, 7, 1]);
	});

	it('reorders within a nested Group without touching the top level', () => {
		const { items } = move(sample(), 4, 2, 'before');
		expect(order(items, 1)).toEqual([4, 2, 3]);
		expect(order(items, null)).toEqual([1, 5, 6, 7]);
		expect(order(move(sample(), 2, 4, 'after').items, 1)).toEqual([3, 4, 2]);
	});

	it('is a no-op for the same slot: the same array and nothing changed', () => {
		const items = sample();
		for (const [drag, target, intent] of [
			[5, 6, 'before'],
			[6, 5, 'after'],
			[5, 5, 'before'],
			[5, 5, 'after'],
			[2, 3, 'before'],
			[4, 3, 'after']
		] as const) {
			const result = move(items, drag, target, intent);
			expect(result.changed).toBe(false);
			expect(result.items).toBe(items);
		}
	});

	it('keeps parent links, descendants, UUIDs and editable values, and renumbers only what moved', () => {
		const items = sample();
		const { items: next } = move(items, 7, 5, 'before');

		expect(next.map((item) => item.id)).toEqual(items.map((item) => item.id));
		for (const [index, item] of next.entries()) {
			const { sortIndex: _after, ...kept } = item;
			const { sortIndex: _before, ...original } = items[index];
			expect(kept).toEqual(original); // parentId, description, -19.99, 0.5, unit
		}
		expect(next[0]).toBe(items[0]); // 1 did not move: same object
		expect(next[7]).toBe(items[7]); // the descendant 8 under 3 is untouched
		expect(order(next, 3)).toEqual([8]);
	});

	it('does not mutate its input', () => {
		const items = sample();
		const snapshot = structuredClone(items);
		Object.freeze(items);
		items.forEach(Object.freeze);
		move(items, 7, 5, 'before');
		expect(items).toEqual(snapshot);
	});

	it('gives the siblings a deterministic 0..n-1 order, even from gaps and ties', () => {
		const items = [make(1, null, 10), make(2, null, 20), make(3, null, 20), make(4, null, 30)];
		const { items: next } = move(items, 4, 1, 'before');
		expect(next.map((item) => [Number(item.id.slice(-12)), item.sortIndex]).sort((a, b) => a[1] - b[1])).toEqual([
			[4, 0],
			[1, 1],
			[2, 2],
			[3, 3]
		]);
	});

	it('rejects unknown Items and Items under different parents', () => {
		const items = sample();
		expect(reorderSibling(items, uuid(99), uuid(5), 'before')).toEqual({ ok: false, reason: 'unknown-item' });
		expect(reorderSibling(items, uuid(5), uuid(99), 'after')).toEqual({ ok: false, reason: 'unknown-item' });
		expect(reorderSibling(items, uuid(5), uuid(2), 'before')).toEqual({ ok: false, reason: 'different-parents' });
	});
});

describe('reparentSubtree', () => {
	const parentsOf = (items: readonly Item[]) => Object.fromEntries(items.map((item) => [Number(item.id.slice(-12)), item.parentId && Number(item.parentId.slice(-12))]));
	const reparent = (items: Item[], id: number, destination: number | null, position: number) => {
		const result = reparentSubtree(items, uuid(id), destination === null ? null : uuid(destination), position);
		if (!result.ok) throw new Error(result.reason);
		return result;
	};
	const byId = (items: readonly Item[], n: number) => items.find((item) => item.id === uuid(n))!;
	const grand = (items: readonly Item[]) => Number(toString(calculateBudget(items).grandTotal));

	it('moves a nested subtree to another parent with every descendant, id and link intact', () => {
		const items = sample(); // 3 (with child 8) goes from Group 1 to the top level, between 5 and 6
		const { items: next, changed } = reparent(items, 3, null, 2);

		expect(changed).toBe(true);
		expect(order(next, null)).toEqual([1, 5, 3, 6, 7]);
		expect(order(next, 1)).toEqual([2, 4]); // former siblings closed up
		expect(order(next, 3)).toEqual([8]);
		expect(byId(next, 8)).toBe(byId(items, 8)); // the descendant is the very same object
		expect(parentsOf(next)).toEqual({ ...parentsOf(items), 3: null });
	});

	it('moves an Item into a Group at a chosen position, and to the top level from a Group', () => {
		expect(order(reparent(sample(), 5, 1, 0).items, 1)).toEqual([5, 2, 3, 4]);
		expect(order(reparent(sample(), 5, 1, 3).items, 1)).toEqual([2, 3, 4, 5]);
		const up = reparent(sample(), 2, null, 0).items;
		expect(order(up, null)).toEqual([2, 1, 5, 6, 7]);
		expect(order(up, 1)).toEqual([3, 4]);
	});

	it('changes only the parent and order fields it must', () => {
		const items = sample();
		const { items: next } = reparent(items, 5, 1, 1); // 5 is a Line; Group 1 stays a Group at 0
		const changed = next.filter((item, index) => item !== items[index]).map((item) => Number(item.id.slice(-12)));
		expect(changed.sort()).toEqual([3, 4, 5, 6, 7].sort()); // 5 moved; 3, 4 shifted; 6, 7 closed the gap
		for (const [index, item] of next.entries()) {
			const { sortIndex: _a, parentId: _b, ...kept } = item;
			const { sortIndex: _c, parentId: _d, ...original } = items[index];
			expect(kept).toEqual(original);
		}
	});

	it('turns a former parent that loses its last child into a Line at 0, keeping Description, Quantity and Unit', () => {
		const items = [
			make(1, null, 0, { description: 'Venue', quantity: '3', unit: 'days', unitPrice: '0' }),
			make(2, 1, 0, { unitPrice: '-40', quantity: '2' }),
			make(3, null, 1, { unitPrice: '10', quantity: '1' })
		];
		expect(grand(items)).toBe(-230); // -80 x 3 + 10
		const { items: next } = reparent(items, 2, null, 1);

		expect(buildItemTree(next).nodes.get(uuid(1))!.kind).toBe('line');
		expect(byId(next, 1)).toMatchObject({ description: 'Venue', quantity: '3', unit: 'days', unitPrice: '0' });
		expect(grand(next)).toBe(-70); // Venue 0 x 3, then -40 x 2 and 10
	});

	it('resets a stored non-zero price on a former parent, whose old total was negative', () => {
		const items = [make(1, null, 0, { unitPrice: '999', quantity: '2' }), make(2, 1, 0, { unitPrice: '-50', quantity: '1' })];
		const { items: next } = reparent(items, 2, null, 0);
		expect(byId(next, 1).unitPrice).toBe('0');
		expect(byId(next, 1).quantity).toBe('2');
		expect(grand(items)).toBe(-100);
		expect(grand(next)).toBe(-50);
	});

	it('converts a destination Line to a Group at 0 and keeps its Quantity', () => {
		const items = [make(1, null, 0, { unitPrice: '100', quantity: '4' }), make(2, null, 1, { unitPrice: '5', quantity: '1' })];
		const { items: next } = reparent(items, 2, 1, 0);

		expect(buildItemTree(next).nodes.get(uuid(1))!.kind).toBe('group');
		expect(byId(next, 1)).toMatchObject({ unitPrice: '0', quantity: '4' });
		expect(grand(next)).toBe(20); // 5 x 4
	});

	it('keeps a moved Group non-default Quantity and its children', () => {
		const items = [make(1, null, 0, { unitPrice: '0', quantity: '3' }), make(2, 1, 0, { unitPrice: '7', quantity: '1' }), make(3, null, 1, { unitPrice: '1', quantity: '1' })];
		const { items: next } = reparent(items, 1, 3, 0);
		expect(byId(next, 1)).toMatchObject({ quantity: '3', parentId: uuid(3) });
		expect(byId(next, 2)).toBe(byId(items, 2));
		expect(grand(next)).toBe(21); // 7 x 3, inside Item 3 at quantity 1
	});

	it('reorders within the same parent with no normalization, and treats the same slot as unchanged', () => {
		const items = sample();
		expect(order(reparent(items, 4, 1, 0).items, 1)).toEqual([4, 2, 3]);
		const same = reparent(items, 6, null, 2);
		expect(same.changed).toBe(false);
		expect(same.items).toBe(items);
	});

	it('does not mutate its input and keeps Group and Line derived, never stored', () => {
		const items = sample();
		const snapshot = structuredClone(items);
		items.forEach(Object.freeze);
		Object.freeze(items);
		const { items: next } = reparent(items, 3, 5, 0);
		expect(items).toEqual(snapshot);
		expect(next.every((item) => !('kind' in item) && !('isGroup' in item))).toBe(true);
	});

	it('rejects unknown Items and destinations, bad positions, and moves into its own subtree', () => {
		const items = sample();
		expect(reparentSubtree(items, uuid(99), null, 0)).toEqual({ ok: false, reason: 'unknown-item' });
		expect(reparentSubtree(items, uuid(5), uuid(99), 0)).toEqual({ ok: false, reason: 'unknown-destination' });
		expect(reparentSubtree(items, uuid(5), null, 9)).toEqual({ ok: false, reason: 'invalid-position' });
		expect(reparentSubtree(items, uuid(5), null, -1)).toEqual({ ok: false, reason: 'invalid-position' });
		expect(reparentSubtree(items, uuid(1), uuid(8), 0)).toEqual({ ok: false, reason: 'into-own-subtree' });
		expect(reparentSubtree(items, uuid(1), uuid(1), 0)).toEqual({ ok: false, reason: 'into-own-subtree' });
	});
});
