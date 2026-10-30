import type { Item, ItemKind, Uuid } from './model';
import { buildItemTree, getDescendantIds, getSubtreeIds } from './tree';

/**
 * Pure deletion of an Item subtree from the flat Item array, with parent normalization.
 *
 * A Group's Unit price is calculated from its children, so its stored `unitPrice` is hidden while
 * it has any. When its last child goes the Item turns back into a Line and that stored price would
 * suddenly count. Normalization therefore resets a newly childless parent's manual Unit price to 0
 * and keeps its Description, Quantity and Unit. `normalizeParent` is exported so moving an Item out
 * of a parent (drag reparenting) can apply exactly the same rule.
 */
export type DeleteResult =
	| { ok: true; items: Item[]; removedIds: Uuid[]; normalizedParentId: Uuid | null }
	| { ok: false; reason: 'unknown-item' };

/**
 * If `parentId` names an Item that no longer has any children, reset its Unit price to 0. Returns
 * the same array when there is nothing to do.
 */
export function normalizeParent(items: readonly Item[], parentId: Uuid | null): Item[] {
	if (parentId === null) return items as Item[];
	const parent = items.find((candidate) => candidate.id === parentId);
	if (!parent || parent.unitPrice === '0') return items as Item[];
	if (items.some((candidate) => candidate.parentId === parentId)) return items as Item[];
	return items.map((candidate) => (candidate.id === parentId ? { ...candidate, unitPrice: '0' } : candidate));
}

/** Remove an Item and all its descendants; normalize its former parent if it lost its last child. */
export function deleteItemSubtree(items: readonly Item[], itemId: Uuid): DeleteResult {
	const tree = buildItemTree(items);
	const node = tree.nodes.get(itemId);
	if (!node) return { ok: false, reason: 'unknown-item' };

	const removedIds = getSubtreeIds(tree, itemId);
	const removed = new Set(removedIds);
	const remaining = items.filter((candidate) => !removed.has(candidate.id));
	const normalized = normalizeParent(remaining, node.parentId);
	const normalizedParentId = normalized !== remaining ? node.parentId : null;
	return { ok: true, items: normalized, removedIds, normalizedParentId };
}

export interface DeletionImpact {
	itemId: Uuid;
	description: string;
	kind: ItemKind;
	/** Items that go with it, in display order (not counting the Item itself). */
	descendantDescriptions: string[];
	/** Its parent, and whether deleting leaves that parent with no children (so it becomes a Line). */
	parent: { id: Uuid; description: string; becomesLine: boolean } | null;
}

/** What deleting an Item would remove, so the UI can name the impact before asking to confirm. */
export function describeDeletion(items: readonly Item[], itemId: Uuid): DeletionImpact | null {
	const tree = buildItemTree(items);
	const node = tree.nodes.get(itemId);
	if (!node) return null;

	const parentNode = node.parentId === null ? null : tree.nodes.get(node.parentId);
	return {
		itemId,
		description: node.item.description,
		kind: node.kind,
		descendantDescriptions: getDescendantIds(tree, itemId).map((id) => tree.nodes.get(id)!.item.description),
		parent: parentNode
			? { id: parentNode.item.id, description: parentNode.item.description, becomesLine: parentNode.children.length === 1 }
			: null
	};
}
