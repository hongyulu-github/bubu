import { describe, expect, it } from 'vitest';
import type { SaveFailure } from '../state/persistence.svelte';
import type { StorageErrorKind } from '../storage/bubu';
import { describeImportFailure, describeProblemCount, describeSaveFailure, describeStorageReason, describeUnreadable, EXCEL_FAILURES } from './messages';

const KINDS: StorageErrorKind[] = ['unavailable', 'not-found', 'corrupt', 'unsupported-version', 'invalid-data', 'unreadable-existing', 'quota-exceeded', 'read-failed', 'write-failed'];

describe('storage messages', () => {
	it.each(KINDS)('explain a %s failure in plain words', (kind) => {
		const reason = describeStorageReason({ kind, message: 'raw technical text' });
		expect(reason.length).toBeGreaterThan(10);
		expect(reason).not.toContain('raw technical text');
		expect(reason).not.toMatch(/undefined|\[object/);
	});

	it.each(['save-items', 'save-budget', 'delete-budget'] as const)('name what is not saved when %s fails, and say the work is still there', (operation) => {
		const failure: SaveFailure = { operation, budgetId: 'b', error: { kind: 'quota-exceeded', message: 'x' } };
		const { title, detail } = describeSaveFailure(failure);
		expect(title.length).toBeGreaterThan(10);
		expect(detail).toContain("Your browser's storage is full.");
		expect(detail).toContain('still on this page');
	});
});

describe('Excel messages', () => {
	it('name the operation that failed and say nothing was changed where that is true', () => {
		expect(EXCEL_FAILURES.export.title).toBe('Excel export failed');
		expect(EXCEL_FAILURES.template.title).toBe('Excel template failed');
		expect(EXCEL_FAILURES.read.title).toBe('Excel import failed');
		expect(EXCEL_FAILURES.read.detail).toContain('Nothing was changed');
		expect(EXCEL_FAILURES.build.detail).toContain('Nothing was changed');
	});

	it('explain a failed import save by its reason', () => {
		expect(describeImportFailure({ ok: false, reason: 'storage', error: { kind: 'quota-exceeded', message: 'x' } }).detail).toBe(
			"The Budget could not be saved: your browser's storage is full. Nothing was changed."
		);
		expect(describeImportFailure({ ok: false, reason: 'exists' }).detail).toContain('already saved');
		expect(describeImportFailure({ ok: false, reason: 'invalid', issues: [] })).toEqual(EXCEL_FAILURES.build);
	});

	it('counts problems and unreadable Budgets with the right plural', () => {
		expect(describeProblemCount(1)).toBe('1 problem found in this workbook');
		expect(describeProblemCount(3)).toBe('3 problems found in this workbook');
		expect(describeUnreadable(1)).toBe('1 saved Budget could not be loaded and was left untouched.');
		expect(describeUnreadable(2)).toBe('2 saved Budgets could not be loaded and were left untouched.');
	});
});
