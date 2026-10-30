import type { Budget } from './model';
import { validateBudgetName } from './create';

export type RenameResult =
	| { ok: true; changed: boolean; budget: Budget }
	| { ok: false; errors: { name: string } };

/**
 * Rename a Budget document: only `name` and `updatedAt` change. The id, currency, createdAt and,
 * since Items are not part of the document, every Item stay as they were. Renaming to the same
 * name (after trimming) is a no-op and leaves `updatedAt` alone.
 */
export function renameBudgetDocument(budget: Budget, name: string, now: Date = new Date()): RenameResult {
	const error = validateBudgetName(name);
	if (error) return { ok: false, errors: { name: error } };

	const trimmed = name.trim();
	if (trimmed === budget.name) return { ok: true, changed: false, budget };
	return { ok: true, changed: true, budget: { ...budget, name: trimmed, updatedAt: now.toISOString() } };
}
