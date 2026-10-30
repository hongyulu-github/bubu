import type { Budget, Item, Uuid } from './model';
import { validateBudgetData, type ValidationIssue } from './validation';

export type DuplicateResult =
	| { ok: true; budget: Budget; items: Item[] }
	| { ok: false; issues: ValidationIssue[] };

export interface DuplicateOptions {
	/** Name for the copy; defaults to the original name followed by " (copy)". */
	name?: string;
	now?: Date;
	/** Id source, for deterministic tests. Ids already used by the original or the copy are skipped. */
	newId?: () => Uuid;
}

/**
 * Clone a Budget and its Items as an independent document. The copy gets its own Budget UUID, its
 * own UUID for every Item, new timestamps, and parent/budget references remapped to the new ids;
 * currency, every value, the hierarchy and the order are kept exactly. No object is shared with the
 * original, and the original is never touched. The copy starts with no history (history is per id).
 *
 * Takes valid data: an invalid Budget or Item array is rejected with its issues rather than copied.
 */
export function duplicateBudget(
	budget: Budget,
	items: readonly Item[],
	{ name = `${budget.name} (copy)`, now = new Date(), newId = () => crypto.randomUUID() }: DuplicateOptions = {}
): DuplicateResult {
	const issues = validateBudgetData(budget, items);
	if (issues.length > 0) return { ok: false, issues };

	const taken = new Set<Uuid>([budget.id, ...items.map((item) => item.id)]);
	const freshId = (): Uuid => {
		let id = newId();
		while (taken.has(id)) id = newId();
		taken.add(id);
		return id;
	};

	const timestamp = now.toISOString();
	const copy: Budget = { ...budget, id: freshId(), name, createdAt: timestamp, updatedAt: timestamp };

	const idMap = new Map<Uuid, Uuid>(items.map((item) => [item.id, freshId()]));
	const copiedItems = items.map((item) => ({
		...item,
		id: idMap.get(item.id)!,
		budgetId: copy.id,
		parentId: item.parentId === null ? null : idMap.get(item.parentId)!
	}));

	return { ok: true, budget: copy, items: copiedItems };
}
