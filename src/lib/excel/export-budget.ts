import type { Fill, Workbook } from 'exceljs';
import { calculateTotals } from '../budget/calculate';
import { currencyFractionDigits, DISPLAY_LOCALE } from '../budget/currency';
import type { Budget, Item } from '../budget/model';
import { toString, type Decimal } from '../budget/numbers';
import { buildItemTree } from '../budget/tree';
import { VISIBLE_COLUMNS, encodeMetadata, ensureBudgetSheet } from './metadata';
import { createWorkbook, writeWorkbook } from './workbook';

/**
 * A Budget as a readable workbook that can also come back to BuBu without loss (LUL-35).
 *
 * The visible sheet follows the shared contract: the six columns, one row per Item in tree order from
 * row 2. Group Unit prices and every Total are the current calculated values written as numbers, not
 * as spreadsheet formulas, so they cannot go stale. Money cells show the Budget currency rounded to its
 * minor units, but the cell keeps the full value, and the hidden metadata keeps each editable value as
 * the exact text, so rounding on screen never reaches the data.
 */

// Group rows are heavier and tinted, deeper Groups lighter (a fixed palette: a file has no light/dark mode).
const GROUP_FILLS = ['FFD9E8DF', 'FFE7F1EB', 'FFF2F8F4'];
const HEADER_FILL = 'FFEDEDED';
const solid = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

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
	const { amounts } = calculateTotals(tree);
	const money = moneyFormat(budget.currency);

	for (const node of tree.ordered) {
		const { item } = node;
		const { quantity, unitPrice, total } = amounts.get(item.id)!;
		const row = sheet.addRow([node.code, item.description, numeric(quantity), item.unit ?? null, numeric(unitPrice), numeric(total)]);
		row.getCell(2).alignment = { indent: node.depth, vertical: 'middle' };
		row.getCell(5).numFmt = money;
		row.getCell(6).numFmt = money;
		if (node.kind === 'group') {
			row.font = { bold: true };
			row.eachCell((cell) => (cell.fill = solid(GROUP_FILLS[Math.min(node.depth, GROUP_FILLS.length - 1)])));
		}
	}

	const header = sheet.getRow(1);
	header.font = { bold: true };
	header.eachCell((cell) => {
		cell.fill = solid(HEADER_FILL);
		cell.border = { bottom: { style: 'thin' } };
	});
	[3, 5, 6].forEach((column) => (header.getCell(column).alignment = { horizontal: 'right' }));
	VISIBLE_COLUMNS.forEach((_, index) => (sheet.getColumn(index + 1).width = [12, 40, 12, 12, 16, 16][index]));
	sheet.views = [{ state: 'frozen', ySplit: 1 }];

	encodeMetadata(workbook, budget, items);
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
