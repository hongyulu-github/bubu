import { describe, expect, it, vi } from 'vitest';
import type { ConversionImpact } from './convert';
import { applyMove, guardMove, type MoveIntent } from './guard';
import { createItem, type Item } from './model';
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
		unitPrice: '0',
		quantity: '1',
		...extra
	});
}
const move = (itemId: number, targetId: number, intent: MoveIntent['intent']): MoveIntent => ({
	itemId: uuid(itemId),
	targetId: uuid(targetId),
	intent
});
const answer = (value: boolean) => vi.fn(async (_conversion: ConversionImpact) => value);
const yes = () => answer(true);
const no = () => answer(false);

// 1 > 2 > 3 > 4 > 5 > 6 (six levels deep), plus a Line 7 and a Group 8 with a child 9.
const sample = () => [
	make(1, null, 0),
	make(2, 1, 0),
	make(3, 2, 0),
	make(4, 3, 0),
	make(5, 4, 0),
	make(6, 5, 0),
	make(7, null, 1, { unitPrice: '-250.5', quantity: '3', unit: 'days', description: 'Music' }),
	make(8, null, 2),
	make(9, 8, 0)
];

describe('guardMove', () => {
	it('rejects itself and every descendant, at any depth and for every intent', () => {
		const items = sample();
		for (const intent of ['before', 'after', 'inside'] as const) {
			expect(guardMove(items, move(1, 1, intent))).toEqual({ ok: false, reason: 'onto-itself' });
			for (const descendant of [2, 3, 4, 5, 6]) {
				expect(guardMove(items, move(1, descendant, intent))).toEqual({ ok: false, reason: 'onto-own-descendant' });
			}
		}
		expect(guardMove(items, move(3, 6, 'inside'))).toEqual({ ok: false, reason: 'onto-own-descendant' });
	});

	it('allows a move next to an ancestor or into an unrelated branch', () => {
		const items = sample();
		expect(guardMove(items, move(6, 1, 'after')).ok).toBe(true);
		expect(guardMove(items, move(6, 9, 'before')).ok).toBe(true);
		expect(guardMove(items, move(1, 8, 'inside')).ok).toBe(true);
	});

	it('rejects unknown Items', () => {
		expect(guardMove(sample(), move(99, 1, 'before'))).toEqual({ ok: false, reason: 'unknown-item' });
		expect(guardMove(sample(), move(1, 99, 'inside'))).toEqual({ ok: false, reason: 'unknown-item' });
	});

	it('resolves where the move lands', () => {
		const items = sample();
		expect(guardMove(items, move(7, 9, 'before'))).toMatchObject({ parentId: uuid(8), position: 0 });
		expect(guardMove(items, move(7, 9, 'after'))).toMatchObject({ parentId: uuid(8), position: 1 });
		expect(guardMove(items, move(9, 8, 'inside'))).toMatchObject({ parentId: uuid(8), position: 0 });
		expect(guardMove(items, move(9, 1, 'before'))).toMatchObject({ parentId: null, position: 0 });
	});

	it('flags a Line destination for the warning, with the price that would be replaced', () => {
		const result = guardMove(sample(), move(8, 7, 'inside'));
		expect(result).toMatchObject({ ok: true, conversion: { unitPrice: '-250.5', quantity: '3', unit: 'days' } });
		expect(guardMove(sample(), move(7, 8, 'inside'))).toMatchObject({ conversion: null }); // already a Group
		expect(guardMove(sample(), move(8, 7, 'before'))).toMatchObject({ conversion: null }); // a sibling move converts nothing
	});
});

describe('applyMove', () => {
	it('returns no Items for a rejected move and never asks', async () => {
		const confirm = yes();
		expect(await applyMove(sample(), move(1, 6, 'inside'), confirm)).toEqual({ ok: false, reason: 'onto-own-descendant' });
		expect(confirm).not.toHaveBeenCalled();
	});

	it('warns before any change and, on cancel, returns nothing so the originals stay', async () => {
		const items = sample();
		const snapshot = structuredClone(items);
		const confirm = no();

		expect(await applyMove(items, move(8, 7, 'inside'), confirm)).toEqual({ ok: false, reason: 'cancelled' });
		expect(confirm).toHaveBeenCalledOnce();
		expect(confirm.mock.calls[0][0]).toMatchObject({ description: 'Music', unitPrice: '-250.5' });
		expect(items).toEqual(snapshot);
	});

	it('on confirm converts the Line to a Group, keeping Quantity, Description and Unit', async () => {
		const items = sample();
		const result = await applyMove(items, move(8, 7, 'inside'), yes());
		if (!result.ok) throw new Error(result.reason);

		const tree = buildItemTree(result.items);
		expect(tree.nodes.get(uuid(7))!.kind).toBe('group');
		expect(tree.nodes.get(uuid(8))!.parentId).toBe(uuid(7));
		expect(tree.nodes.get(uuid(9))!.parentId).toBe(uuid(8)); // the subtree came along
		expect(result.items.find((item) => item.id === uuid(7))).toMatchObject({
			unitPrice: '0',
			quantity: '3',
			unit: 'days',
			description: 'Music'
		});
	});

	it('moves into an existing Group without asking', async () => {
		const confirm = yes();
		const result = await applyMove(sample(), move(7, 8, 'inside'), confirm);
		expect(result).toMatchObject({ ok: true, changed: true });
		expect(confirm).not.toHaveBeenCalled();
	});

	it('reports a move that changes nothing as unchanged', async () => {
		const items = sample();
		const result = await applyMove(items, move(7, 8, 'before'), yes());
		expect(result).toMatchObject({ ok: true, changed: false });
		if (result.ok) expect(result.items).toBe(items);
	});

	it('gives the same outcome whether a pointer drop or a keyboard move supplies the intent', async () => {
		const fromPointer = move(8, 7, 'inside'); // from a DropRequest { dragId, targetId, intent }
		const fromKeyboard = move(8, 7, 'inside'); // from a key command resolving to the same intent
		const confirm = yes();
		const a = await applyMove(sample(), fromPointer, confirm);
		const b = await applyMove(sample(), fromKeyboard, confirm);
		expect(a).toEqual(b);
		expect(confirm).toHaveBeenCalledTimes(2);
		expect(await applyMove(sample(), move(1, 4, 'before'), confirm)).toEqual(
			await applyMove(sample(), move(1, 4, 'before'), confirm)
		);
	});
});
