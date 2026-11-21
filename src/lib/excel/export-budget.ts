import type { Fill, Workbook } from 'exceljs';
import { calculateTotals } from '../budget/calculate';
import { currencyFractionDigits, DISPLAY_LOCALE } from '../budget/currency';
import type { Budget, Item } from '../budget/model';
import { toString, type Decimal } from '../budget/numbers';
import { buildItemTree } from '../budget/tree';
import { GRAND_TOTAL_LABEL, VISIBLE_COLUMNS, encodeMetadata, ensureBudgetSheet } from './metadata';
import { createWorkbook, writeWorkbook } from './workbook';

/**
 * A Budget as a readable workbook that can also come back to BuBu without loss (LUL-35, with live formulas and the app's look as a follow-up).
 *
 * The visible sheet follows the shared contract: the six columns, a Grand total row under the header, then
 * one row per Item in tree order from row 3. The arithmetic is live, so editing a number in Excel updates everything above it: a row's Total
 * is Quantity times Unit price, and a Group's Unit price is the sum of its direct children's Totals.
 * Each formula also carries the app's calculated value as its cached result, so a viewer that does not
 * recalculate still shows the right numbers. Money cells show the Budget currency rounded to its minor
 * units, but the cell keeps the full value, and the hidden metadata keeps each editable value as exact
 * text, so rounding on screen never reaches the data.
 *
 * The look follows the app in light mode (hairline row separators, the page background, Group tints that
 * fade with depth, the accent bar down a top-level Group's section). The colours are the app's rendered
 * values, as a file has no theme to read them from.
 */
const COLORS = {
	background: 'FFF1F5F3',
	surface: 'FFFDF9F7',
	border: 'FFD8D5D2',
	accent: 'FF00603C',
	text: 'FF080B09',
	muted: 'FF4A4C49',
	groupTints: ['FFD7E5DF', 'FFE0EBE6', 'FFE8EFEB'] // top-level Group first, lighter as they nest
} as const;
const BODY_SIZE = 10.5; // the app's 14px body text
const HEADER_SIZE = 9; // its 12px footnote
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const hairline = { style: 'thin', color: { argb: COLORS.border } } as const;

/** The Grand total is row 2, under the header, so the Items start on row 3. */
const FIRST_ITEM_ROW = 3;

/** Excel allows at most 255 arguments to SUM; stay well under it. */
const SUM_CHUNK = 200;

/** `SUM(F3,F5,F6)`, or several SUMs added together for a Group with a great many children. */
function sumOf(refs: string[]): string {
	const parts: string[] = [];
	for (let i = 0; i < refs.length; i += SUM_CHUNK) parts.push(`SUM(${refs.slice(i, i + SUM_CHUNK).join(',')})`);
	return parts.join('+');
}

/** Excel number format for money in a currency: its symbol and minor units, with a leading minus. */
export function moneyFormat(currency: string): string {
	const digits = currencyFractionDigits(currency);
	let symbol = currency;
	try {
		symbol = new Intl.NumberFormat(DISPLAY_LOCALE, { style: 'currency', currency }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? currency;
	} catch {
		// an unknown code is shown as it is
	}
	const number = digits > 0 ? `#,##0.${'0'.repeat(digits)}` : '#,##0';
	const quoted = `"${symbol.replace(/"/g, '')}"`;
	return `${quoted}${number};-${quoted}${number}`;
}

/** The value in a cell: the exact decimal as a number (Excel holds doubles; the metadata keeps the exact text). */
const numeric = (value: Decimal) => Number(toString(value));

export async function buildBudgetWorkbook(budget: Budget, items: readonly Item[]): Promise<Workbook> {
	const workbook = await createWorkbook();
	const sheet = ensureBudgetSheet(workbook);
	const tree = buildItemTree(items);
	const { amounts, grandTotal } = calculateTotals(tree);
	const money = moneyFormat(budget.currency);

	const rowOf = new Map(tree.ordered.map((node, index) => [node.item.id, index + FIRST_ITEM_ROW]));

	// The Grand total comes first, as in the app: the sum of the top-level Totals (their children are already inside them).
	const topLevel = tree.roots.map((root) => `F${rowOf.get(root.item.id)}`);
	const totalRow = sheet.addRow([
		null,
		GRAND_TOTAL_LABEL,
		null,
		null,
		null,
		topLevel.length > 0 ? { formula: sumOf(topLevel), result: numeric(grandTotal) } : numeric(grandTotal)
	]);
	for (let column = 1; column <= VISIBLE_COLUMNS.length; column++) {
		const cell = totalRow.getCell(column);
		cell.fill = solid(COLORS.surface);
		cell.font = { size: BODY_SIZE, bold: true, color: { argb: COLORS.text } };
		cell.border = { bottom: hairline };
	}
	totalRow.getCell(6).numFmt = money;

	for (const node of tree.ordered) {
		const { item } = node;
		const { quantity, unitPrice, total } = amounts.get(item.id)!;
		const r = rowOf.get(item.id)!;
		const group = node.kind === 'group';
		const tint = group ? COLORS.groupTints[Math.min(node.depth, COLORS.groupTints.length - 1)] : COLORS.background;

		const row = sheet.addRow([
			node.code,
			item.description,
			numeric(quantity),
			item.unit ?? null,
			// A Group's Unit price is the sum of its children's Totals; a Line's is the editable number.
			group ? { formula: sumOf(node.children.map((child) => `F${rowOf.get(child.item.id)}`)), result: numeric(unitPrice) } : numeric(unitPrice),
			{ formula: `C${r}*E${r}`, result: numeric(total) }
		]);

		// Every one of the six cells, empty Units included (eachCell would skip those).
		for (let column = 1; column <= VISIBLE_COLUMNS.length; column++) {
			const cell = row.getCell(column);
			cell.fill = solid(tint);
			cell.font = {
				size: BODY_SIZE,
				color: { argb: column === 1 || (column === 5 && group) ? COLORS.muted : COLORS.text }, // Code and calculated prices are muted
				bold: column === 6 || (column === 2 && group) // Total always, Description of a Group
			};
			cell.border = { bottom: hairline };
		}
		row.getCell(2).alignment = { indent: node.depth, vertical: 'middle' };
		row.getCell(5).numFmt = money;
		row.getCell(6).numFmt = money;
		// The accent bar marks every row inside a top-level Group's section, the Group included.
		if (group || node.depth > 0) row.getCell(1).border = { bottom: hairline, left: { style: 'thick', color: { argb: COLORS.accent } } };
	}

	const header = sheet.getRow(1);
	header.eachCell((cell, column) => {
		cell.fill = solid(COLORS.background);
		cell.font = { size: HEADER_SIZE, bold: true, color: { argb: COLORS.muted } };
		cell.border = { bottom: hairline };
		cell.alignment = [3, 5, 6].includes(column) ? { horizontal: 'right' } : {};
	});
	VISIBLE_COLUMNS.forEach((_, index) => (sheet.getColumn(index + 1).width = [12, 40, 12, 12, 16, 16][index]));
	sheet.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }]; // the header and the Grand total stay in view

	encodeMetadata(workbook, budget, items, FIRST_ITEM_ROW);
	return workbook;
}

/** The .xlsx file for a Budget, built entirely in the browser. */
export async function exportBudget(budget: Budget, items: readonly Item[]): Promise<Blob> {
	return writeWorkbook(await buildBudgetWorkbook(budget, items));
}

/** A safe file name from the Budget name: no path or reserved characters, never empty. */
export function exportFilename(budget: Budget): string {
	const name = budget.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().replace(/^\.+/, '');
	return `${name === '' ? 'Budget' : name.slice(0, 80)}.xlsx`;
}
