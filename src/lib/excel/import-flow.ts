import type { Budget, Item, Uuid } from '../budget/model';
import { duplicateBudget } from '../budget/duplicate';
import { buildBudgetItems } from './import-budget';
import type { WorkbookMetadata } from './metadata';
import { validateBudgetFile, type ValidatedRow, type ValidationError } from './validate';

/**
 * The steps of an Excel import that need no screen (LUL-65): read and validate a file, decide what the
 * user must still choose, and build the complete Budget to save. Saving is the store's `importBudget`.
 * Nothing here saves, asks or changes anything.
 */
export interface Staged {
	rows: ValidatedRow[];
	/** From the workbook's hidden sheet; null for a plain workbook. */
	metadata: WorkbookMetadata | null;
}

export type StageResult = { ok: true; staged: Staged } | { ok: false; errors: ValidationError[] };

/** Read a file's bytes and validate it; an unreadable or invalid file returns its errors. */
export async function stageWorkbook(data: ArrayBuffer): Promise<StageResult> {
	const result = await validateBudgetFile(data);
	return result.ok ? { ok: true, staged: { rows: result.rows, metadata: result.metadata } } : { ok: false, errors: result.errors };
}

/** What has to be decided before this can be saved. */
export type Needs =
	/** A plain workbook: it has no Budget name or currency, so the user supplies them. */
	| { kind: 'details' }
	/** The workbook is an export of a Budget that is already saved. */
	| { kind: 'conflict'; existing: Budget }
	| { kind: 'none' };

export function needsFor(staged: Staged, saved: readonly Budget[]): Needs {
	if (!staged.metadata) return { kind: 'details' };
	const existing = saved.find((budget) => budget.id === staged.metadata!.budget.id);
	return existing ? { kind: 'conflict', existing } : { kind: 'none' };
}

export interface BuildOptions {
	/** Name and currency for a plain workbook. */
	details?: { name: string; currency: string };
	/** For a conflict: keep the exported identities (replace) or give everything fresh ones (copy). */
	mode?: 'replace' | 'copy';
	newId?: () => Uuid;
	now?: Date;
}

export type BuildResult =
	| { ok: true; budget: Budget; items: Item[] }
	| { ok: false; reason: 'budget-required' | 'invalid' };

/**
 * The complete Budget to save. Exported identities and metadata are kept, except for a copy, where the
 * Budget and every Item get new UUIDs with parent and Budget references remapped to match (the existing
 * Budget is never touched). A plain workbook gets fresh identities and the given name and currency.
 */
export function buildImport(staged: Staged, { details, mode = 'replace', newId, now }: BuildOptions = {}): BuildResult {
	const built = buildBudgetItems({ rows: staged.rows, metadata: staged.metadata, budget: details ? { name: details.name.trim(), currency: details.currency } : undefined, newId, now });
	if (!built.ok) return { ok: false, reason: built.reason };
	if (mode === 'copy' && staged.metadata) {
		const copy = duplicateBudget(built.budget, built.items, { newId, now });
		return copy.ok ? { ok: true, budget: copy.budget, items: copy.items } : { ok: false, reason: 'invalid' };
	}
	return { ok: true, budget: built.budget, items: built.items };
}

/** Where an error is, in words a person can find in Excel: "Row 3 · Quantity (C3)", "Row 1 · Column C", or nothing for the whole file. */
export function describeLocation(error: ValidationError): string {
	if (!error.row) return '';
	return [`Row ${error.row}`, error.column ? `${error.column}${error.cell ? ` (${error.cell})` : ''}` : null].filter(Boolean).join(' · ');
}
