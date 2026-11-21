import { describe, expect, it } from 'vitest';
import { createItem, type Item } from './model';
import { reorderSibling } from './moves';
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
