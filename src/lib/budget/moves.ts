import type { Item, Uuid } from './model';
import { buildItemTree, canMoveUnder, getSiblings } from './tree';

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

export type ReparentResult =
	| { ok: true; items: Item[]; changed: boolean }
	| { ok: false; reason: 'unknown-item' | 'unknown-destination' | 'into-own-subtree' | 'invalid-position' };

/**
 * Move `itemId`, with its whole subtree, under `destinationParentId` (null: the top level) so that it
 * ends up at index `position` among that parent's children (counted without the moved Item).
 *
 * Only the moved root's parentId and the sortIndex of the two affected sibling sets change; descendants
 * keep their identity and parent links. Group/Line stays derived from children, so two Unit price
 * resets keep the rule that a Group's stored price is 0: a former parent left with no children
 * becomes a Line at 0, and a destination Line becomes a Group at 0. Description, Quantity and Unit are
 * never touched. Moving into the Item's own subtree is refused only because it would orphan it; the
 * user-facing guard and confirmation are LUL-15.
 */
export function reparentSubtree(
	items: readonly Item[],
	itemId: Uuid,
	destinationParentId: Uuid | null,
	position: number
): ReparentResult {
	const tree = buildItemTree(items);
	const moved = tree.nodes.get(itemId);
	if (!moved) return { ok: false, reason: 'unknown-item' };
	if (destinationParentId !== null && !tree.nodes.has(destinationParentId)) return { ok: false, reason: 'unknown-destination' };
	if (!canMoveUnder(tree, itemId, destinationParentId)) return { ok: false, reason: 'into-own-subtree' };

	const childrenOf = (parentId: Uuid | null) =>
		(parentId === null ? tree.roots : tree.nodes.get(parentId)!.children).map((node) => node.item.id);
	const before = childrenOf(moved.parentId);
	const without = (ids: Uuid[]) => ids.filter((id) => id !== itemId);
	const destination = without(childrenOf(destinationParentId));
	if (!Number.isInteger(position) || position < 0 || position > destination.length) return { ok: false, reason: 'invalid-position' };
	destination.splice(position, 0, itemId);

	const sameParent = moved.parentId === destinationParentId;
	if (sameParent && destination.every((id, index) => id === before[index])) return { ok: true, items: items as Item[], changed: false };

	const sortIndex = new Map(destination.map((id, index) => [id, index]));
	const left = sameParent ? [] : without(before);
	left.forEach((id, index) => sortIndex.set(id, index));
	const leftEmpty = !sameParent && moved.parentId !== null && left.length === 0;
	const becomesGroup = !sameParent && destinationParentId !== null && tree.nodes.get(destinationParentId)!.kind === 'line';

	const next = items.map((item) => {
		const changes: Partial<Item> = {};
		if (item.id === itemId) changes.parentId = destinationParentId;
		if (sortIndex.has(item.id) && item.sortIndex !== sortIndex.get(item.id)) changes.sortIndex = sortIndex.get(item.id);
		if (((leftEmpty && item.id === moved.parentId) || (becomesGroup && item.id === destinationParentId)) && item.unitPrice !== '0') {
			changes.unitPrice = '0';
		}
		return Object.keys(changes).length > 0 ? { ...item, ...changes } : item;
	});
	return { ok: true, items: next, changed: true };
}
