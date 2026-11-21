import type { Item, Uuid } from './model';
import { buildItemTree, getSiblings } from './tree';

/**
 * Sibling reorder over the flat Item array (LUL-14): pure, so a command can apply it and undo it by
 * keeping the previous array. Only `sortIndex` changes, and only on the siblings whose position
 * changes; parentId, UUIDs, descendants and every editable field are carried over untouched.
 * Cross-parent moves, cycle checks and conversion belong to later tickets.
 */
export type SiblingIntent = 'before' | 'after';

export type ReorderResult =
	| { ok: true; items: Item[]; changed: boolean }
	| { ok: false; reason: 'unknown-item' | 'different-parents' };

/**
 * Move `dragId` just before or after its sibling `targetId`. `changed` is false, and `items` is the
 * same array, when the Item would stay where it is (including dropping it on itself): nothing to commit.
 */
export function reorderSibling(
	items: readonly Item[],
	dragId: Uuid,
	targetId: Uuid,
	intent: SiblingIntent
): ReorderResult {
	const tree = buildItemTree(items);
	const drag = tree.nodes.get(dragId);
	const target = tree.nodes.get(targetId);
	if (!drag || !target) return { ok: false, reason: 'unknown-item' };
	if (drag.parentId !== target.parentId) return { ok: false, reason: 'different-parents' };

	if (dragId === targetId) return { ok: true, items: items as Item[], changed: false };

	const current = getSiblings(tree, dragId).map((node) => node.item.id);
	const order = current.filter((id) => id !== dragId);
	order.splice(order.indexOf(targetId) + (intent === 'after' ? 1 : 0), 0, dragId);

	if (order.every((id, index) => id === current[index])) return { ok: true, items: items as Item[], changed: false };

	const position = new Map(order.map((id, index) => [id, index]));
	const next = items.map((item) => {
		const index = position.get(item.id);
		return index !== undefined && item.sortIndex !== index ? { ...item, sortIndex: index } : item;
	});
	return { ok: true, items: next, changed: true };
}
