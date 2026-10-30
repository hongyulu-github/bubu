import { createItem, type Item, type NewItemInput, type Uuid } from './model';
import { buildItemTree, getSiblings } from './tree';

/**
 * Pure constructors for "insert an Item" commands over the flat Item array. Each returns the new
 * array (the "after" snapshot) plus the Item it created; nothing is mutated and nothing is stored,
 * so a caller records the pair as one history command.
 *
 * A new Item is a Line with an empty Description, Quantity 1, Unit price 0 and no Unit. It becomes
 * a Group later, only when something is added beneath it.
 */
export type NewItemFields = Pick<NewItemInput, 'id' | 'description' | 'quantity' | 'unitPrice' | 'unit'>;

export type InsertResult = { ok: true; items: Item[]; item: Item } | { ok: false; reason: 'unknown-item' };

/** Add a top-level Item after the last existing top-level Item. Existing Items are untouched. */
export function insertTopLevelItem(items: readonly Item[], budgetId: Uuid, fields: NewItemFields = {}): InsertResult {
	const roots = items.filter((candidate) => candidate.parentId === null);
	const sortIndex = roots.length === 0 ? 0 : Math.max(...roots.map((root) => root.sortIndex)) + 1;
	const item = createItem({ ...fields, budgetId, parentId: null, sortIndex });
	return { ok: true, items: [...items, item], item };
}

/**
 * Add an Item directly after `siblingId` under the same parent (or at top level). Siblings after
 * the new Item shift down one position; everything else, including the sibling's own children,
 * keeps its identity and parent.
 */
export function insertSiblingItem(items: readonly Item[], siblingId: Uuid, fields: NewItemFields = {}): InsertResult {
	const sibling = items.find((candidate) => candidate.id === siblingId);
	const siblingNodes = getSiblings(buildItemTree(items), siblingId);
	if (!sibling || siblingNodes.length === 0) return { ok: false, reason: 'unknown-item' };

	const orderedIds = siblingNodes.map((node) => node.item.id);
	const insertAt = orderedIds.indexOf(siblingId) + 1;
	const item = createItem({ ...fields, budgetId: sibling.budgetId, parentId: sibling.parentId, sortIndex: insertAt });

	// Positions of the sibling list after the insertion; only Items whose position changed are replaced.
	const position = new Map<Uuid, number>();
	orderedIds.forEach((id, index) => position.set(id, index < insertAt ? index : index + 1));

	const next = items.map((candidate) => {
		const index = position.get(candidate.id);
		return index !== undefined && candidate.sortIndex !== index ? { ...candidate, sortIndex: index } : candidate;
	});
	return { ok: true, items: [...next, item], item };
}
