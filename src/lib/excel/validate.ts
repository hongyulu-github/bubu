import type { Workbook } from 'exceljs';
import { parseErrorMessage, parseQuantity, parseUnitPrice, type ParseError, type ParseResult } from '../budget/numbers';
import {
	BUDGET_SHEET,
	GRAND_TOTAL_LABEL,
	METADATA_SHEET,
	VISIBLE_COLUMNS,
	decodeBudgetWorkbook,
	numberText,
	readMetadata,
	textOf,
	type WorkbookMetadata
} from './metadata';
import { readWorkbook } from './workbook';

/**
 * Check a workbook before anything is built from it (LUL-37): every problem is reported with its row and
 * column, together, and nothing is changed or constructed. A workbook with the six named columns and
 * well-formed Codes is valid with or without Bubu metadata; when metadata is present its version and
 * row associations are checked too, so an identity is never silently given to a different row.
 *
 * Editable numbers follow the same exact-decimal rules as the editor: Quantity is zero or more
 * (fractions fine), a Line's Unit price may be negative. A Group's Unit price and every Total are
 * calculated by the app, so they are ignored, whatever they contain.
 */
export type ValidationErrorCode =
	| 'unreadable-workbook'
	| 'missing-budget-sheet'
	| 'missing-column'
	| 'blank-code'
	| 'malformed-code'
	| 'duplicate-code'
	| 'missing-parent'
	| 'invalid-quantity'
	| 'invalid-unit-price'
	| 'unsupported-version'
	| 'malformed-metadata'
	| 'inconsistent-association';

export interface ValidationError {
	code: ValidationErrorCode;
	message: string;
	/** Worksheet row, when the problem is in one. */
	row?: number;
	/** Visible column name, when the problem is in one. */
	column?: (typeof VISIBLE_COLUMNS)[number];
	/** Cell address such as "C5", when the problem is in one cell. */
	cell?: string;
}

/** A visible row that passed, with its editable values as exact decimal text. */
export interface ValidatedRow {
	row: number;
	code: string;
	/** The Code of the row above it in the hierarchy; null at the top level. */
	parentCode: string | null;
	kind: 'group' | 'line';
	description: string;
	quantity: string;
	unit?: string;
	/** A Line's Unit price; "0" for a Group, whose price is calculated. */
	unitPrice: string;
}

export type ValidationResult =
	| { ok: true; rows: ValidatedRow[]; /** The saved Budget document and identities, when the workbook carries Bubu metadata. */ metadata: WorkbookMetadata | null }
	| { ok: false; errors: ValidationError[] };

const CODE_PATTERN = /^\d+(\.\d+)*$/;
const COLUMN_LETTERS = 'ABCDEF';

/** Read a file's bytes as a workbook and validate it. An unreadable file is one clear error, not an exception. */
export async function validateBudgetFile(data: ArrayBuffer): Promise<ValidationResult> {
	let workbook: Workbook;
	try {
		workbook = await readWorkbook(data);
	} catch {
		return { ok: false, errors: [{ code: 'unreadable-workbook', message: 'This file could not be read as an Excel (.xlsx) workbook.' }] };
	}
	return validateBudgetWorkbook(workbook);
}

export function validateBudgetWorkbook(workbook: Workbook): ValidationResult {
	const sheet = workbook.getWorksheet(BUDGET_SHEET);
	if (!sheet) return { ok: false, errors: [{ code: 'missing-budget-sheet', message: `This workbook has no "${BUDGET_SHEET}" sheet.` }] };

	const errors: ValidationError[] = [];
	const at = (row: number, column: number) => `${COLUMN_LETTERS[column - 1]}${row}`;
	const text = (row: number, column: number) => textOf(sheet.getCell(row, column).value)?.trim() ?? '';

	// The six named columns, in the shared order (the importer reads them by position).
	VISIBLE_COLUMNS.forEach((name, index) => {
		const found = text(1, index + 1);
		if (found.toLowerCase() !== name.toLowerCase()) {
			errors.push({
				code: 'missing-column',
				column: name,
				row: 1,
				cell: at(1, index + 1),
				message: found === '' ? `Column ${COLUMN_LETTERS[index]} should be titled "${name}".` : `Column ${COLUMN_LETTERS[index]} should be titled "${name}", but is "${found}".`
			});
		}
	});
	if (errors.length > 0) return { ok: false, errors };

	// Item rows: everything but blank rows and the exporter's Grand total row.
	interface Raw {
		row: number;
		code: string;
	}
	const items: Raw[] = [];
	for (let r = 2; r <= sheet.rowCount; r++) {
		if (VISIBLE_COLUMNS.every((_, c) => text(r, c + 1) === '')) continue;
		const code = text(r, 1);
		if (code === '' && text(r, 2) === GRAND_TOTAL_LABEL) continue;
		items.push({ row: r, code });
	}

	// Codes: present, well formed (and not mangled into a number by Excel), unique, and with an existing parent.
	const seen = new Map<string, number>();
	const valid = new Set<string>();
	for (const { row, code } of items) {
		const cell = sheet.getCell(row, 1);
		if (code === '') {
			errors.push({ code: 'blank-code', row, column: 'Code', cell: at(row, 1), message: 'This row has no Code.' });
		} else if (typeof cell.value === 'number' && !Number.isInteger(cell.value)) {
			errors.push({ code: 'malformed-code', row, column: 'Code', cell: at(row, 1), message: `"${code}" is a number, not text. Excel may have shortened a Code such as 1.10 to 1.1; format the Code column as Text.` });
		} else if (!CODE_PATTERN.test(code)) {
			errors.push({ code: 'malformed-code', row, column: 'Code', cell: at(row, 1), message: `"${code}" is not a Code. Use numbers separated by dots, like 1 or 1.2.3.` });
		} else if (seen.has(code)) {
			errors.push({ code: 'duplicate-code', row, column: 'Code', cell: at(row, 1), message: `Code ${code} is already used on row ${seen.get(code)}.` });
		} else {
			seen.set(code, row);
			valid.add(code);
		}
	}
	for (const { row, code } of items) {
		const parent = parentOf(code);
		if (valid.has(code) && seen.get(code) === row && parent !== null && !valid.has(parent)) {
			errors.push({ code: 'missing-parent', row, column: 'Code', cell: at(row, 1), message: `Code ${code} has no parent: there is no row with Code ${parent}.` });
		}
	}

	// Numbers: Quantity on every row, Unit price on Lines only (a Group's is calculated, and every Total is ignored).
	const isGroup = (code: string) => [...valid].some((other) => other.startsWith(`${code}.`));
	const rows: ValidatedRow[] = [];
	for (const { row, code } of items) {
		const quantity = readNumber(sheet.getCell(row, 3).value, parseQuantity);
		if (!quantity.ok) errors.push({ code: 'invalid-quantity', row, column: 'Quantity', cell: at(row, 3), message: `Quantity: ${quantity.message}` });

		const group = valid.has(code) && isGroup(code);
		const unitPrice = group ? ({ ok: true, text: '0' } as const) : readNumber(sheet.getCell(row, 5).value, parseUnitPrice);
		if (!unitPrice.ok) errors.push({ code: 'invalid-unit-price', row, column: 'Unit price', cell: at(row, 5), message: `Unit price: ${unitPrice.message}` });

		if (quantity.ok && unitPrice.ok && valid.has(code)) {
			const unit = text(row, 4);
			rows.push({
				row,
				code,
				parentCode: parentOf(code),
				kind: group ? 'group' : 'line',
				description: textOf(sheet.getCell(row, 2).value) ?? '',
				quantity: quantity.text,
				...(unit === '' ? {} : { unit }),
				unitPrice: unitPrice.text
			});
		}
	}

	// Bubu metadata is optional, but when it is there it must be supported and agree with the visible rows.
	let metadata: WorkbookMetadata | null = null;
	if (workbook.getWorksheet(METADATA_SHEET)) {
		const read = readMetadata(workbook);
		if (!read.ok) {
			for (const issue of read.issues) {
				errors.push({
					code: issue.code === 'unsupported-version' ? 'unsupported-version' : issue.code === 'inconsistent-association' ? 'inconsistent-association' : 'malformed-metadata',
					message: issue.message,
					...(issue.row ? { row: issue.row } : {})
				});
			}
		} else {
			metadata = read.metadata;
			const decoded = decodeBudgetWorkbook(workbook);
			if (!decoded.ok) {
				// Value and Code problems were already reported cell by cell above; only the identity checks are new.
				for (const issue of decoded.issues.filter((i) => i.code === 'inconsistent-association')) {
					errors.push({ code: 'inconsistent-association', message: issue.message, ...(issue.row ? { row: issue.row } : {}) });
				}
			}
		}
	}

	if (errors.length > 0) {
		errors.sort((a, b) => (a.row ?? 0) - (b.row ?? 0) || VISIBLE_COLUMNS.indexOf(a.column ?? 'Code') - VISIBLE_COLUMNS.indexOf(b.column ?? 'Code'));
		return { ok: false, errors };
	}
	return { ok: true, rows, metadata };
}

/** "1.2.3" lives under "1.2"; a top-level Code has no parent. */
const parentOf = (code: string): string | null => (code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : null);

type NumberRead = { ok: true; text: string } | { ok: false; message: string };

/** A number cell as exact decimal text, by the same rules as the editor. */
function readNumber(value: unknown, parse: (text: string) => ParseResult): NumberRead {
	const fail = (error: ParseError): NumberRead => ({ ok: false, message: parseErrorMessage(error) });
	if (value === null || value === undefined) return fail('blank');
	const cellValue = value as Parameters<typeof textOf>[0];
	const text = (typeof cellValue === 'number' ? numberText(cellValue) : textOf(cellValue))?.trim() ?? null;
	if (text === null) return fail('not-a-number');
	if (text === '') return fail('blank');
	const parsed = parse(text);
	return parsed.ok ? { ok: true, text } : fail(parsed.error);
}
