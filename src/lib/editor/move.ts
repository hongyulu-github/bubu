import type { ConversionImpact } from '../budget/convert';
import { applyMove, type MoveIntent, type MoveOutcome } from '../budget/guard';
import type { Uuid } from '../budget/model';
import type { BudgetStore } from '../state/budgets.svelte';

export type CommitMoveResult = { ok: true } | { ok: false; reason: Extract<MoveOutcome, { ok: false }>['reason'] | 'unchanged' };

/**
 * The one entry point for committing a tree move, for a pointer drop now and keyboard controls later.
 * The intent goes through the shared guard (and the Line-to-Group `confirm`), then the result is
 * submitted as exactly one command: the store's history records it, derived Codes and Totals
 * recompute, and autosave persists it. Rejected, cancelled and no-op moves record and save nothing.
 */
export async function commitMove(
	store: Pick<BudgetStore, 'itemsOf' | 'execute'>,
	budgetId: Uuid,
	intent: MoveIntent,
	confirm: (conversion: ConversionImpact) => Promise<boolean>
): Promise<CommitMoveResult> {
	const moved = await applyMove(store.itemsOf(budgetId), intent, confirm);
	if (!moved.ok) return moved;
	if (!moved.changed) return { ok: false, reason: 'unchanged' };
	return store.execute(budgetId, moved.items).ok ? { ok: true } : { ok: false, reason: 'invalid' };
}
