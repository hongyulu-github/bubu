import type { CellValue, Workbook, Worksheet } from 'exceljs';
import type { Budget, Item, Uuid } from '../budget/model';
import { parseQuantity, parseUnitPrice, type ParseResult } from '../budget/numbers';
import { buildItemTree } from '../budget/tree';
import { isUuid, validateBudget } from '../budget/validation';

/**
 * The BuBu workbook contract (LUL-63) and its hidden metadata.
 *
 * Visible sheet "Budget": row 1 is the header (Code, Description, Quantity, Unit, Unit price, Total) and
 * the Items follow in display order. An export puts a Grand total row (no Code, the label "Grand total")
 * right under the header, so its Items start at row 3; a sheet without one starts them at row 2. The
 * metadata records the row of every Item, and the decoder skips the Grand total row. The six columns are
 * all there is to see.
 *
 * Hidden sheet "BuBu metadata" holds what those columns cannot: the format version, the Budget document,
 * and for every Item its UUID, its visible row and Code, its parent and its exact Quantity and Unit
 * price as text. Codes only identify rows here; they are never an Item field. The visible sheet decides
 * every editable value: a number the user left alone keeps its exact stored digits, a changed one wins.
 *
 * Nothing here changes app data. Decoding returns rows or typed issues; the caller builds Items.
 */
export const METADATA_VERSION = 1;
export const BUDGET_SHEET = 'Budget';
export const METADATA_SHEET = 'BuBu metadata';
/** The label of the exporter's Grand total row, which sits under the header and is not an Item. */
export const GRAND_TOTAL_LABEL = 'Grand total';
export const VISIBLE_COLUMNS = ['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total'] as const;

const BUDGET_KEYS = ['budgetId', 'name', 'currency', 'createdAt', 'updatedAt'] as const;
const ITEM_COLUMNS = ['row', 'code', 'itemId', 'parentId', 'quantity', 'unitPrice'] as const;
const FIRST_ITEM_ROW = 9; // after the version, the Budget keys and one blank row, then the column titles
const CODE_PATTERN = /^\d+(\.\d+)*$/;

export type WorkbookIssueCode =
	| 'missing-metadata'
	| 'unsupported-version'
	| 'malformed-metadata'
	| 'missing-budget-sheet'
	| 'inconsistent-association'
	| 'duplicate-code'
	| 'invalid-value';

export interface WorkbookIssue {
	code: WorkbookIssueCode;
	message: string;
	/** The worksheet row concerned, when there is one. */
	row?: number;
}

/** One Item as the metadata saved it. Quantity and Unit price are the exact decimal text. */
export interface MetadataItem {
	id: Uuid;
	parentId: Uuid | null;
	code: string;
	row: number;
	quantity: string;
	unitPrice: string;
}

export interface WorkbookMetadata {
	version: number;
	budget: Budget;
	items: MetadataItem[];
}

export type ReadMetadataResult = { ok: true; metadata: WorkbookMetadata } | { ok: false; issues: WorkbookIssue[] };

/** A visible Item row, with the identity metadata could safely attach to it (null for a row it does not know). */
export interface DecodedRow {
	row: number;
	code: string;
	itemId: Uuid | null;
	parentId: Uuid | null;
	description: string;
	quantity: string;
	unit?: string;
	unitPrice: string;
}

export type DecodeResult = { ok: true; budget: Budget; rows: DecodedRow[] } | { ok: false; issues: WorkbookIssue[] };

const issue = (code: WorkbookIssueCode, message: string, row?: number): WorkbookIssue => ({ code, message, ...(row ? { row } : {}) });

// --- Writing ---------------------------------------------------------------------------------------

/** The visible Budget sheet with its six headers, created when the workbook has none. */
export function ensureBudgetSheet(workbook: Workbook): Worksheet {
	const existing = workbook.getWorksheet(BUDGET_SHEET);
	if (existing) return existing;
	const sheet = workbook.addWorksheet(BUDGET_SHEET);
	sheet.addRow([...VISIBLE_COLUMNS]);
	return sheet;
}

/**
 * Write the hidden metadata sheet (replacing any earlier one) for a Budget and its Items. Items are
 * recorded at the rows the sheet gives them: depth-first display order from `firstItemRow` (2, or 3 under a Grand total row). Everything is
 * stored as text, so decimals keep every digit through the file. The visible sheet is not touched.
 */
export function encodeMetadata(workbook: Workbook, budget: Budget, items: readonly Item[], firstItemRow = 2): void {
	const existing = workbook.getWorksheet(METADATA_SHEET);
	if (existing) workbook.removeWorksheet(existing.id);
	const sheet = workbook.addWorksheet(METADATA_SHEET, { state: 'hidden' });

	sheet.addRow(['version', String(METADATA_VERSION)]);
	for (const key of BUDGET_KEYS) sheet.addRow([key, key === 'budgetId' ? budget.id : budget[key as 'name' | 'currency' | 'createdAt' | 'updatedAt']]);
	sheet.addRow([]);
	sheet.addRow([...ITEM_COLUMNS]);
	buildItemTree(items).ordered.forEach((node, index) => {
		const { item } = node;
		sheet.addRow([String(index + firstItemRow), node.code, item.id, item.parentId ?? '', item.quantity, item.unitPrice]);
	});
}

// --- Reading ---------------------------------------------------------------------------------------

/** The text of a cell however it is stored; null for an empty cell. Numbers become plain text. */
function textOf(value: CellValue | undefined): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') return String(value);
	if (value instanceof Date) return value.toISOString();
	if ('richText' in value) return value.richText.map((part) => part.text).join('');
	if ('result' in value) return textOf(value.result as CellValue);
	if ('text' in value) return textOf(value.text as CellValue);
	return null;
}

const cellText = (sheet: Worksheet, row: number, column: number) => textOf(sheet.getCell(row, column).value)?.trim() ?? '';

/**
 * Read and check the hidden metadata: that it exists, that its version is supported, and that it is
 * well formed and agrees with itself (UUIDs, decimals, unique rows, Codes and ids, parents that match
 * the Codes). It does not look at the visible sheet.
 */
export function readMetadata(workbook: Workbook): ReadMetadataResult {
	const sheet = workbook.getWorksheet(METADATA_SHEET);
	if (!sheet) return { ok: false, issues: [issue('missing-metadata', 'This workbook has no BuBu metadata, so it is not a BuBu export.')] };

	const rawVersion = cellText(sheet, 1, 2);
	const version = /^\d+$/.test(rawVersion) ? Number(rawVersion) : NaN;
	if (cellText(sheet, 1, 1) !== 'version' || Number.isNaN(version)) {
		return { ok: false, issues: [issue('malformed-metadata', 'The metadata has no readable version.')] };
	}
	if (version !== METADATA_VERSION) {
		return { ok: false, issues: [issue('unsupported-version', `This workbook uses metadata version ${version}; only version ${METADATA_VERSION} is supported.`)] };
	}

	const issues: WorkbookIssue[] = [];
	const malformed = (message: string, row?: number) => issues.push(issue('malformed-metadata', message, row));

	const fields: Record<string, string> = {};
	BUDGET_KEYS.forEach((key, index) => {
		if (cellText(sheet, index + 2, 1) !== key) malformed(`Expected "${key}" in the metadata.`, index + 2);
		fields[key] = cellText(sheet, index + 2, 2);
	});
	const budget: Budget = { id: fields.budgetId, name: textOf(sheet.getCell(3, 2).value) ?? '', currency: fields.currency, createdAt: fields.createdAt, updatedAt: fields.updatedAt };
	for (const problem of validateBudget(budget)) malformed(`${problem.path}: ${problem.message}`);

	ITEM_COLUMNS.forEach((title, index) => {
		if (cellText(sheet, FIRST_ITEM_ROW - 1, index + 1) !== title) malformed(`Expected the column "${title}" in the metadata.`, FIRST_ITEM_ROW - 1);
	});

	const items: MetadataItem[] = [];
	const rows = new Set<number>();
	const codes = new Set<string>();
	const ids = new Set<string>();
	for (let r = FIRST_ITEM_ROW; r <= sheet.rowCount; r++) {
		const [rowText, code, id, parent, quantity, unitPrice] = ITEM_COLUMNS.map((_, i) => cellText(sheet, r, i + 1));
		if ([rowText, code, id, parent, quantity, unitPrice].every((text) => text === '')) continue;

		const row = /^\d+$/.test(rowText) ? Number(rowText) : NaN;
		if (!(row >= 2)) malformed('An Item has no valid worksheet row.', r);
		else if (rows.has(row)) malformed(`Two Items claim worksheet row ${row}.`, r);
		if (!CODE_PATTERN.test(code)) malformed(`"${code}" is not a Code.`, r);
		else if (codes.has(code)) malformed(`Code ${code} appears twice.`, r);
		if (!isUuid(id)) malformed('An Item id is not a UUID.', r);
		else if (ids.has(id)) malformed(`Item id ${id} appears twice.`, r);
		if (parent !== '' && !isUuid(parent)) malformed('A parent id is not a UUID.', r);
		if (!parseQuantity(quantity).ok) malformed(`"${quantity}" is not a valid Quantity.`, r);
		if (!parseUnitPrice(unitPrice).ok) malformed(`"${unitPrice}" is not a valid Unit price.`, r);

		rows.add(row);
		codes.add(code);
		ids.add(id);
		items.push({ id, parentId: parent === '' ? null : parent, code, row, quantity, unitPrice });
	}
	if (issues.length > 0) return { ok: false, issues };

	// The saved parents must agree with the saved Codes: "1.2.3" lives under whoever has Code "1.2".
	const byCode = new Map(items.map((item) => [item.code, item]));
	for (const item of items) {
		const parent = parentCode(item.code);
		const expected = parent === null ? null : (byCode.get(parent)?.id ?? undefined);
		if (expected === undefined || item.parentId !== expected) {
			issues.push(issue('inconsistent-association', `The saved parent of ${item.code} does not match its Code.`, item.row));
		}
	}
	return issues.length > 0 ? { ok: false, issues } : { ok: true, metadata: { version, budget, items } };
}

/** "1.2.3" lives under "1.2"; a top-level Code has no parent. */
const parentCode = (code: string): string | null => (code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : null);

/** Plain decimal text for a number read from a cell, never in exponent form. */
function numberText(value: number): string | null {
	if (!Number.isFinite(value)) return null;
	const text = String(value);
	if (!/e/i.test(text)) return text;
	if (Math.abs(value) >= 1) return BigInt(value).toString();
	// shortcut: a double this small is written to 30 places; digits beyond that are noise. Upgrade if such values ever matter.
	return value.toFixed(30).replace(/0+$/, '').replace(/\.$/, '');
}

/**
 * The decimal text a visible cell stands for. The visible value is authoritative; a number that still
 * equals the saved text keeps the saved digits (so 19.990 does not become 19.99, nor 0.1 a longer
 * binary expansion). Returns null when the cell holds no usable number.
 */
function decimalFrom(value: CellValue | undefined, saved: string | undefined, parse: (text: string) => ParseResult): string | null {
	const text = typeof value === 'number' ? (saved !== undefined && Number(saved) === value ? saved : numberText(value)) : textOf(value)?.trim();
	if (text === null || text === undefined || text === '') return null;
	return parse(text).ok ? text : null;
}

/**
 * Decode a BuBu workbook: the metadata, then each visible row matched to its saved identity.
 *
 * An identity attaches to a row only when the row number and the Code both match what was saved, and
 * its parent is the row above it in the hierarchy. A Code that moved to another row, or a row whose
 * saved parent is not its visible parent, is reported as inconsistent instead of being given to a
 * different Item. Rows the metadata does not know are new (no identity). Group Unit prices are not read:
 * a Group's is calculated, so it is stored as 0.
 */
export function decodeBudgetWorkbook(workbook: Workbook): DecodeResult {
	const read = readMetadata(workbook);
	if (!read.ok) return read;
	const { metadata } = read;

	const sheet = workbook.getWorksheet(BUDGET_SHEET);
	if (!sheet) return { ok: false, issues: [issue('missing-budget-sheet', `This workbook has no "${BUDGET_SHEET}" sheet.`)] };

	const issues: WorkbookIssue[] = [];
	const visible: { row: number; code: string }[] = [];
	for (let r = 2; r <= sheet.rowCount; r++) {
		const code = cellText(sheet, r, 1);
		if (VISIBLE_COLUMNS.every((_, c) => cellText(sheet, r, c + 1) === '')) continue;
		if (code === '' && cellText(sheet, r, 2) === GRAND_TOTAL_LABEL) continue; // the exporter's total, not an Item
		if (code === '') issues.push(issue('invalid-value', 'This row has no Code.', r));
		else visible.push({ row: r, code });
	}

	const seen = new Set<string>();
	for (const { row, code } of visible) {
		if (seen.has(code)) issues.push(issue('duplicate-code', `Code ${code} appears more than once.`, row));
		seen.add(code);
	}

	const savedByRow = new Map(metadata.items.map((item) => [item.row, item]));
	const savedByCode = new Map(metadata.items.map((item) => [item.code, item]));
	const matched = new Map<string, MetadataItem>(); // visible Code -> saved Item
	for (const { row, code } of visible) {
		const saved = savedByRow.get(row);
		if (saved?.code === code) matched.set(code, saved);
		else if (savedByCode.has(code)) {
			issues.push(issue('inconsistent-association', `Code ${code} is on row ${row}, but its saved identity belongs to row ${savedByCode.get(code)!.row}. Rows were moved or sorted.`, row));
		}
	}
	for (const [code, saved] of matched) {
		const parent = parentCode(code);
		const visibleParent = parent === null ? null : (matched.get(parent)?.id ?? undefined);
		if (visibleParent === undefined || saved.parentId !== visibleParent) {
			issues.push(issue('inconsistent-association', `Row ${saved.row} (${code}) is not under the Item it was saved under.`, saved.row));
		}
	}

	const codes = new Set(visible.map(({ code }) => code));
	const isGroup = (code: string) => [...codes].some((other) => other.startsWith(`${code}.`));
	const rows: DecodedRow[] = [];
	for (const { row, code } of visible) {
		const saved = matched.get(code);
		const quantity = decimalFrom(sheet.getCell(row, 3).value, saved?.quantity, parseQuantity);
		const unitPrice = isGroup(code) ? '0' : decimalFrom(sheet.getCell(row, 5).value, saved?.unitPrice, parseUnitPrice);
		if (quantity === null) issues.push(issue('invalid-value', 'Quantity must be a number of zero or more.', row));
		if (unitPrice === null) issues.push(issue('invalid-value', 'Unit price must be a number.', row));
		if (quantity === null || unitPrice === null) continue;

		const unit = cellText(sheet, row, 4);
		rows.push({
			row,
			code,
			itemId: saved?.id ?? null,
			parentId: saved?.parentId ?? null,
			description: textOf(sheet.getCell(row, 2).value) ?? '',
			quantity,
			...(unit === '' ? {} : { unit }),
			unitPrice
		});
	}
	return issues.length > 0 ? { ok: false, issues } : { ok: true, budget: metadata.budget, rows };
}
