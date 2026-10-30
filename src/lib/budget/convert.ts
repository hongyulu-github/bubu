import type { Item, Uuid } from './model';

/**
 * Line-to-Group conversion, shared by adding a child here and by drag reparenting later.
 *
 * An Item is a Line while it has no children and a Group once it has any (never stored). A Line's
 * Unit price is entered by hand; a Group's is the total of its children. So giving a Line its first
 * child replaces the manual price with computed pricing: the stored price is reset to 0 (undo brings
 * it back), while Description, Quantity and Unit are kept.
 */
export interface ConversionImpact {
	parentId: Uuid;
	description: string;
	/** The manual Unit price that will be replaced, as stored. */
	unitPrice: string;
	/** Kept as it is; shown so the user sees it is not reset. */
	quantity: string;
	unit: string | undefined;
}

/** What converting `parentId` would change, or null when it is already a Group or does not exist. */
export function describeConversion(items: readonly Item[], parentId: Uuid): ConversionImpact | null {
	const parent = items.find((candidate) => candidate.id === parentId);
	if (!parent || items.some((candidate) => candidate.parentId === parentId)) return null;
	return {
		parentId,
		description: parent.description,
		unitPrice: parent.unitPrice,
		quantity: parent.quantity,
		unit: parent.unit
	};
}

/**
 * Prepare `parentId` to receive its first child: if it is a Line, reset its manual Unit price to 0.
 * Returns the same array when it is already a Group, already at 0, or unknown. Call this before
 * (or together with) attaching the child.
 */
export function convertLineToGroup(items: readonly Item[], parentId: Uuid): Item[] {
	const impact = describeConversion(items, parentId);
	if (!impact || impact.unitPrice === '0') return items as Item[];
	return items.map((candidate) => (candidate.id === parentId ? { ...candidate, unitPrice: '0' } : candidate));
}
