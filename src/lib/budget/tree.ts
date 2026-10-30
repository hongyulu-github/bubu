import type { Item, ItemKind, Uuid } from './model';

/**
 * Pure helpers that turn the flat Item array into an ordered hierarchy. Nothing here mutates the
 * input or writes derived values (Code, depth, Group/Line) onto Item objects: they live on the
 * returned nodes and are recomputed from the current data, so a move, insert or removal is just a
 * new array passed to `buildItemTree`.
 *
 * Assumes the data passed `validateItems`. Items that cannot be reached from a top-level Item
 * (dangling parent, cycle) are left out of the tree and listed in `unreachableIds`.
 * All traversals are iterative, so nesting depth is not limited by the call stack.
 */
export interface ItemNode {
	readonly item: Item;
	readonly parentId: Uuid | null;
	/** 0 for top-level Items. */
	readonly depth: number;
	/** Outline number from current position, e.g. "1", "1.2", "1.2.3". */
	readonly code: string;
	/** Group when it has children, otherwise Line. */
	readonly kind: ItemKind;
	/** Children in sibling order. */
	readonly children: readonly ItemNode[];
}

export interface ItemTree {
	/** Top-level nodes in sibling order. */
	readonly roots: readonly ItemNode[];
	readonly nodes: ReadonlyMap<Uuid, ItemNode>;
	/** Every node depth-first in display order (parent before its children). */
	readonly ordered: readonly ItemNode[];
	readonly unreachableIds: readonly Uuid[];
}

/** Sibling order: sortIndex ascending, ties broken by id so the result never depends on input order. */
function compareSiblings(a: Item, b: Item): number {
	return a.sortIndex - b.sortIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export function buildItemTree(items: readonly Item[]): ItemTree {
	const childrenOfParent = new Map<Uuid | null, Item[]>();
	for (const item of items) {
		const siblings = childrenOfParent.get(item.parentId);
		if (siblings) siblings.push(item);
		else childrenOfParent.set(item.parentId, [item]);
	}
	for (const siblings of childrenOfParent.values()) siblings.sort(compareSiblings);

	type MutableNode = { -readonly [K in keyof ItemNode]: ItemNode[K] } & { children: ItemNode[] };
	const nodes = new Map<Uuid, ItemNode>();
	const ordered: ItemNode[] = [];

	function makeNodes(parent: MutableNode | null, siblings: readonly Item[]): MutableNode[] {
		return siblings.map((item, position) => {
			const node: MutableNode = {
				item,
				parentId: item.parentId,
				depth: parent ? parent.depth + 1 : 0,
				code: parent ? `${parent.code}.${position + 1}` : String(position + 1),
				kind: childrenOfParent.has(item.id) ? 'group' : 'line',
				children: []
			};
			parent?.children.push(node);
			return node;
		});
	}

	const roots = makeNodes(null, childrenOfParent.get(null) ?? []);
	const stack: MutableNode[] = [...roots].reverse();
	while (stack.length > 0) {
		const node = stack.pop()!;
		nodes.set(node.item.id, node);
		ordered.push(node);
		const children = makeNodes(node, childrenOfParent.get(node.item.id) ?? []);
		for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
	}

	const unreachableIds = items.filter((item) => !nodes.has(item.id)).map((item) => item.id);
	return { roots, nodes, ordered, unreachableIds };
}

/** Code for every reachable Item, keyed by id. Convenience over `buildItemTree`. */
export function deriveCodes(items: readonly Item[]): Map<Uuid, string> {
	const codes = new Map<Uuid, string>();
	for (const node of buildItemTree(items).ordered) codes.set(node.item.id, node.code);
	return codes;
}

/** Siblings of an Item (including itself) in order; empty when the Item is not in the tree. */
export function getSiblings(tree: ItemTree, id: Uuid): readonly ItemNode[] {
	const node = tree.nodes.get(id);
	if (!node) return [];
	return node.parentId === null ? tree.roots : (tree.nodes.get(node.parentId)?.children ?? []);
}

/** Ancestor ids from the top-level Item down to the direct parent. Empty for top-level Items. */
export function getAncestorIds(tree: ItemTree, id: Uuid): Uuid[] {
	const ancestors: Uuid[] = [];
	let parentId = tree.nodes.get(id)?.parentId ?? null;
	while (parentId !== null) {
		ancestors.push(parentId);
		parentId = tree.nodes.get(parentId)?.parentId ?? null;
	}
	return ancestors.reverse();
}

/** Descendant ids in display order (children before their next sibling). Excludes the Item itself. */
export function getDescendantIds(tree: ItemTree, id: Uuid): Uuid[] {
	const start = tree.nodes.get(id);
	if (!start) return [];
	const descendants: Uuid[] = [];
	const stack = [...start.children].reverse();
	while (stack.length > 0) {
		const node = stack.pop()!;
		descendants.push(node.item.id);
		for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
	}
	return descendants;
}

/** The Item and all its descendants, in display order. Use for subtree moves and deletes. */
export function getSubtreeIds(tree: ItemTree, id: Uuid): Uuid[] {
	return tree.nodes.has(id) ? [id, ...getDescendantIds(tree, id)] : [];
}

/** True when `id` lies somewhere below `ancestorId` (an Item is not its own descendant). */
export function isDescendantOf(tree: ItemTree, id: Uuid, ancestorId: Uuid): boolean {
	let parentId = tree.nodes.get(id)?.parentId ?? null;
	while (parentId !== null) {
		if (parentId === ancestorId) return true;
		parentId = tree.nodes.get(parentId)?.parentId ?? null;
	}
	return false;
}

/**
 * Safety check for moving an Item (with its subtree) under a new parent, or to the top level with
 * `null`. Rejects unknown Items, itself, and any of its own descendants, which would create a cycle.
 */
export function canMoveUnder(tree: ItemTree, id: Uuid, newParentId: Uuid | null): boolean {
	if (!tree.nodes.has(id)) return false;
	if (newParentId === null) return true;
	return (
		tree.nodes.has(newParentId) && newParentId !== id && !isDescendantOf(tree, newParentId, id)
	);
}
