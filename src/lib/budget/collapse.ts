import type { Uuid } from './model';

/**
 * Collapse is presentation only: a set of collapsed Group ids held in editor UI state. It decides
 * which rows are shown; it never touches the Items, the Codes, the totals (hidden Items still count)
 * or history, and it is not persisted. These helpers are pure and work on any ordered rows.
 */
interface RowLike {
	readonly id: Uuid;
	readonly depth: number;
	readonly kind: 'group' | 'line';
}

/**
 * The rows that remain visible when the given Groups are collapsed: a collapsed Group stays, its
 * descendants (every deeper row up to the next row at or above its depth) are hidden. Order is kept.
 * Only Groups can be collapsed, so an id that is a Line, or no longer exists, is ignored.
 */
export function visibleRows<T extends RowLike>(rows: readonly T[], collapsed: ReadonlySet<Uuid>): T[] {
	const visible: T[] = [];
	let hiddenBelow = Infinity; // while a collapsed Group is open above, skip rows deeper than this

	for (const row of rows) {
		if (row.depth > hiddenBelow) continue;
		hiddenBelow = Infinity;
		visible.push(row);
		if (row.kind === 'group' && collapsed.has(row.id)) hiddenBelow = row.depth;
	}
	return visible;
}

/** A new set with the Group's collapsed state flipped; the original is left alone. */
export function toggleCollapsed(collapsed: ReadonlySet<Uuid>, groupId: Uuid): Set<Uuid> {
	const next = new Set(collapsed);
	if (!next.delete(groupId)) next.add(groupId);
	return next;
}

/** Every Group collapsed, at every depth. */
export function collapseAll(rows: readonly RowLike[]): Set<Uuid> {
	return new Set(rows.filter((row) => row.kind === 'group').map((row) => row.id));
}

/** Nothing collapsed. */
export function expandAll(): Set<Uuid> {
	return new Set();
}
