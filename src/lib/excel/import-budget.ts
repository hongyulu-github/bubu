import { calculateTotals, type BudgetTotals } from '../budget/calculate';
import { createBudget, createItem, type Budget, type Item, type Uuid } from '../budget/model';
import { buildItemTree } from '../budget/tree';
import { validateBudgetData, type ValidationIssue } from '../budget/validation';
import { numberText, type WorkbookMetadata } from './metadata';
import type { ValidatedRow } from './validate';

/**
 * Turn validated worksheet rows into a staged Budget and its flat Items (LUL-38). Pure: it reads its
 * input, returns new objects, and neither saves nor asks anything. Identity conflicts, dialogs and
 * storage belong to the importer that calls it.
 *
 * The hierarchy comes from the Codes: a row's parent is the row whose Code is its own minus the last
 * segment, and siblings are ordered by their last segment as a number (so 2 comes before 10). The Code
 * itself is never stored on an Item. Group or Line is left to the Items, which are a Group exactly when
 * something names them as parent; a Group's stored Unit price is 0, since it is calculated, and every
 * calculated amount comes from the shared engine, returned alongside the Items.
 *
 * With metadata, a row keeps the identity saved for it when its row number and Code both match, and the
 * Budget is the saved document. Without it, the Items get fresh UUIDs and the Budget is new, made from the
 * name and currency the caller supplies.
 */
export interface ImportInput {
	rows: readonly ValidatedRow[];
	/** From `validateBudgetWorkbook`; null for a workbook without BuBu metadata. */
	metadata: WorkbookMetadata | null;
	/** Name and currency for a new Budget; required when there is no metadata. */
	budget?: { name: string; currency: string };
	/** Where fresh UUIDs come from (a test seam; defaults to `crypto.randomUUID`). */
	newId?: () => Uuid;
	/** The time a new Budget is stamped with (defaults to now). */
	now?: Date;
}

export type ImportResult =
	| { ok: true; budget: Budget; items: Item[]; totals: BudgetTotals }
	| { ok: false; reason: 'budget-required' }
	| { ok: false; reason: 'invalid'; issues: ValidationIssue[] };

/**
 * A number cell is read as the shortest text a double has (19.99), but the metadata saved the exact digits
 * (19.990, or more digits than a double holds). When the visible value is still just that number, the saved
 * text wins; any other value, an edit, is taken as it is.
 */
function exactly(visible: string, saved: string | undefined): string {
	return saved !== undefined && visible === numberText(Number(saved)) ? saved : visible;
}

/** Compare Codes segment by segment as numbers: 1.2 before 1.10, 2 before 10. */
function compareCodes(a: string, b: string): number {
	const left = a.split('.').map(Number);
	const right = b.split('.').map(Number);
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		if (left[i] !== right[i]) return left[i] - right[i];
	}
	return left.length - right.length;
}

export function buildBudgetItems({ rows, metadata, budget: newBudget, newId = () => crypto.randomUUID(), now = new Date() }: ImportInput): ImportResult {
	if (!metadata && !newBudget) return { ok: false, reason: 'budget-required' };
	const budget: Budget = metadata ? { ...metadata.budget } : createBudget({ name: newBudget!.name, currency: newBudget!.currency, id: newId(), now });

	// Identities saved for exactly these rows; anything else is new.
	const saved = new Map((metadata?.items ?? []).map((item) => [item.row, item]));
	const taken = new Set<Uuid>([budget.id, ...(metadata?.items ?? []).map((item) => item.id)]);
	const fresh = () => {
		let id = newId();
		while (taken.has(id)) id = newId();
		taken.add(id);
		return id;
	};

	const ordered = [...rows].sort((a, b) => compareCodes(a.code, b.code)); // parents before children, siblings in order
	const idOf = new Map<string, Uuid>();
	const identityOf = new Map<string, NonNullable<ReturnType<typeof saved.get>>>(); // the saved Item behind a row, when it has one
	for (const row of ordered) {
		const identity = saved.get(row.row);
		const matched = identity && identity.code === row.code ? identity : undefined;
		if (matched) identityOf.set(row.code, matched);
		idOf.set(row.code, matched ? matched.id : fresh());
	}

	const nextIndex = new Map<string | null, number>(); // sortIndex counter per parent
	const items: Item[] = ordered.map((row) => {
		const sortIndex = nextIndex.get(row.parentCode) ?? 0;
		nextIndex.set(row.parentCode, sortIndex + 1);
		return createItem({
			id: idOf.get(row.code)!,
			budgetId: budget.id,
			parentId: row.parentCode === null ? null : (idOf.get(row.parentCode) ?? null),
			sortIndex,
			description: row.description,
			quantity: exactly(row.quantity, identityOf.get(row.code)?.quantity),
			unitPrice: row.kind === 'group' ? '0' : exactly(row.unitPrice, identityOf.get(row.code)?.unitPrice),
			unit: row.unit
		});
	});

	const issues = validateBudgetData(budget, items);
	if (issues.length > 0) return { ok: false, reason: 'invalid', issues };
	return { ok: true, budget, items, totals: calculateTotals(buildItemTree(items)) };
}
