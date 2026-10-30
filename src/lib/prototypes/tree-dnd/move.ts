import type { Item, Uuid } from '../../budget/model';
import { buildItemTree, canMoveUnder, getSiblings, getSubtreeIds, isDescendantOf } from '../../budget/tree';

/**
 * PROTOTYPE ONLY (LUL-6). A tiny pure move over a flat Item array, just enough to drive the demo.
 * Production moves (history commands, parent normalization, persistence) belong to LUL-13/62/64.
 */
export type DropOperation = 'before' | 'after' | 'inside';

export type MoveRejection = 'unknown-item' | 'onto-itself' | 'onto-own-descendant';

export type MoveResult =
	| { ok: true; items: Item[]; movedIds: Uuid[]; newParentId: Uuid | null }
	| { ok: false; reason: MoveRejection };

/** Why dropping `dragId` on `targetId` can never be allowed, or null when it is not forbidden. */
export function rejectionFor(items: readonly Item[], dragId: Uuid, targetId: Uuid): MoveRejection | null {
	const tree = buildItemTree(items);
	if (!tree.nodes.has(dragId) || !tree.nodes.has(targetId)) return 'unknown-item';
	if (dragId === targetId) return 'onto-itself';
	if (isDescendantOf(tree, targetId, dragId)) return 'onto-own-descendant';
	return null;
}

/**
 * Move `dragId` (with all its descendants, which follow through their unchanged parentId) next to
 * or inside `targetId`. Returns a new array; the input is never mutated.
 */
export function moveItem(
	items: readonly Item[],
	dragId: Uuid,
	targetId: Uuid,
	operation: DropOperation
): MoveResult {
	const rejection = rejectionFor(items, dragId, targetId);
	if (rejection) return { ok: false, reason: rejection };

	const tree = buildItemTree(items);
	const target = tree.nodes.get(targetId)!;
	const newParentId = operation === 'inside' ? targetId : target.parentId;
	// Defensive: the checks above already imply this.
	if (!canMoveUnder(tree, dragId, newParentId)) return { ok: false, reason: 'onto-own-descendant' };

	const siblingIds =
		operation === 'inside'
			? target.children.map((child) => child.item.id)
			: getSiblings(tree, targetId).map((node) => node.item.id);
	const remaining = siblingIds.filter((id) => id !== dragId);
	const insertAt =
		operation === 'inside'
			? remaining.length
			: remaining.indexOf(targetId) + (operation === 'after' ? 1 : 0);
	remaining.splice(insertAt, 0, dragId);

	const position = new Map(remaining.map((id, index) => [id, index]));
	const next = items.map((item) => {
		if (item.id === dragId) {
			return { ...item, parentId: newParentId, sortIndex: position.get(item.id)! };
		}
		const index = position.get(item.id);
		return index !== undefined && item.sortIndex !== index ? { ...item, sortIndex: index } : item;
	});

	return { ok: true, items: next, movedIds: getSubtreeIds(tree, dragId), newParentId };
}
