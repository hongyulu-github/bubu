import { describeConversion, type ConversionImpact } from './convert';
import type { Item, Uuid } from './model';
import { reparentSubtree } from './moves';
import { buildItemTree, isDescendantOf } from './tree';
import { validateItems } from './validation';

/**
 * The one safety path for a tree move, whatever started it (pointer drop or keyboard): refuse moves
 * that would create a cycle, ask before a Line's manual Unit price is replaced, and only then call the
 * pure move. Nothing here touches history or storage; the caller commits an accepted result.
 */
export type MoveIntent = {
	/** The Item being moved, with its whole subtree. */
	itemId: Uuid;
	/** The Item it is moved next to or into. */
	targetId: Uuid;
	intent: 'before' | 'after' | 'inside';
};

export type MoveRejection = 'unknown-item' | 'onto-itself' | 'onto-own-descendant';

export type GuardResult =
	| { ok: false; reason: MoveRejection }
	/** `conversion` is set when the destination is a Line that would become a Group: ask first. */
	| { ok: true; parentId: Uuid | null; position: number; conversion: ConversionImpact | null };

/** Check a move and resolve where it lands. Pure; changes nothing. */
export function guardMove(items: readonly Item[], { itemId, targetId, intent }: MoveIntent): GuardResult {
	const tree = buildItemTree(items);
	const target = tree.nodes.get(targetId);
	if (!tree.nodes.has(itemId) || !target) return { ok: false, reason: 'unknown-item' };
	if (itemId === targetId) return { ok: false, reason: 'onto-itself' };
	// Next to a descendant is inside the moved subtree too, so every intent is checked, not just "inside".
	if (isDescendantOf(tree, targetId, itemId)) return { ok: false, reason: 'onto-own-descendant' };

	if (intent === 'inside') {
		const children = target.children.filter((child) => child.item.id !== itemId);
		return { ok: true, parentId: targetId, position: children.length, conversion: describeConversion(items, targetId) };
	}
	const siblings = (target.parentId === null ? tree.roots : tree.nodes.get(target.parentId)!.children).filter(
		(node) => node.item.id !== itemId
	);
	const position = siblings.findIndex((node) => node.item.id === targetId) + (intent === 'after' ? 1 : 0);
	return { ok: true, parentId: target.parentId, position, conversion: null };
}

export type MoveOutcome =
	| { ok: true; items: Item[]; changed: boolean }
	| { ok: false; reason: MoveRejection | 'cancelled' | 'invalid' };

/**
 * Guard, confirm if needed, then move. `confirm` shows the Line-to-Group warning and resolves true to
 * go ahead. A rejection, a cancellation or an invalid result returns no Items, so the caller keeps
 * its originals; an accepted move returns Items that passed validation.
 */
export async function applyMove(
	items: readonly Item[],
	move: MoveIntent,
	confirm: (conversion: ConversionImpact) => Promise<boolean>
): Promise<MoveOutcome> {
	const guard = guardMove(items, move);
	if (!guard.ok) return guard;
	if (guard.conversion && !(await confirm(guard.conversion))) return { ok: false, reason: 'cancelled' };

	const moved = reparentSubtree(items, move.itemId, guard.parentId, guard.position);
	if (!moved.ok) return { ok: false, reason: 'invalid' };
	if (moved.changed && validateItems(moved.items[0]?.budgetId ?? null, moved.items).length > 0) return { ok: false, reason: 'invalid' };
	return { ok: true, items: moved.items, changed: moved.changed };
}
