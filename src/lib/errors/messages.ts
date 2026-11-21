/**
 * The words for failures. Storage and Excel modules own detecting a failure and describing it as data (an error kind, a
 * reason, row and cell details); this file only turns those into sentences a person can act on, in one place, so the same
 * failure reads the same everywhere. Every message names the operation that failed and says what happened to the data.
 */
import type { SaveFailure } from '../state/persistence.svelte';
import type { StorageError, StorageErrorKind } from '../storage/bubu';
import type { ImportBudgetResult } from '../state/budgets.svelte';

/** Why storage failed, as a sentence fragment with no full stop: "your browser's storage is full". */
const STORAGE_REASONS: Record<StorageErrorKind, string> = {
	unavailable: "browser storage is not available, so nothing can be saved on this device",
	'quota-exceeded': "your browser's storage is full",
	'write-failed': 'your browser refused to save the data',
	'read-failed': 'your browser could not read the saved data',
	corrupt: 'the saved data is damaged',
	'unsupported-version': 'the saved data was written by a newer version of Bubu',
	'invalid-data': 'the data is not a valid Budget',
	'unreadable-existing': 'unreadable saved data is already there, so it was left untouched',
	'not-found': 'the saved data could not be found'
};

export function describeStorageReason(error: StorageError): string {
	return STORAGE_REASONS[error.kind] ?? 'the browser storage reported a problem';
}

const SAVE_OPERATIONS: Record<SaveFailure['operation'], string> = {
	'save-items': 'Your latest changes are not being saved',
	'save-budget': 'Your Budget is not being saved',
	'delete-budget': 'A deleted Budget could not be removed from this device'
};

/** A save that failed: what is not saved, why, and that the page still holds the work. */
export function describeSaveFailure(failure: SaveFailure): { title: string; detail: string } {
	const reason = describeStorageReason(failure.error);
	const detail = `${reason[0].toUpperCase()}${reason.slice(1)}. Your work is still on this page; try again, or download it as Excel to keep a copy.`;
	return { title: SAVE_OPERATIONS[failure.operation], detail };
}

/** The Excel operations that can fail, named so the message says which one did. */
export const EXCEL_FAILURES = {
	export: { title: 'Excel export failed', detail: 'The Excel file could not be created. Your Budget is unchanged. Please try again.' },
	template: { title: 'Excel template failed', detail: 'The empty template could not be created. Please try again.' },
	read: { title: 'Excel import failed', detail: 'The file could not be read. Nothing was changed.' },
	build: { title: 'Excel import failed', detail: 'This workbook could not be turned into a valid Budget. Nothing was changed.' }
} as const;

/** Why `importBudget` refused, for the import dialog. Always says nothing was changed, because that is true. */
export function describeImportFailure(result: Extract<ImportBudgetResult, { ok: false }>): { title: string; detail: string } {
	if (result.reason === 'storage') {
		const reason = describeStorageReason(result.error);
		return { title: 'Excel import failed', detail: `The Budget could not be saved: ${reason}. Nothing was changed.` };
	}
	if (result.reason === 'exists') {
		return { title: 'Excel import failed', detail: 'A Budget with the same identity is already saved. Nothing was changed.' };
	}
	return EXCEL_FAILURES.build;
}

/** A count line for the import problems list, e.g. "3 problems found in this workbook". */
export function describeProblemCount(count: number): string {
	return `${count} ${count === 1 ? 'problem' : 'problems'} found in this workbook`;
}

/** Budgets that exist in storage but could not be loaded, for the list. */
export function describeUnreadable(count: number): string {
	return `${count === 1 ? '1 saved Budget' : `${count} saved Budgets`} could not be loaded and ${count === 1 ? 'was' : 'were'} left untouched.`;
}
