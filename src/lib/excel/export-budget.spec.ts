import { describe, expect, it } from 'vitest';
import { calculateBudget } from '../budget/calculate';
import { createBudget, createItem, type Budget, type Item } from '../budget/model';
import { toString } from '../budget/numbers';
import { BUDGET_SHEET, METADATA_SHEET, VISIBLE_COLUMNS, decodeBudgetWorkbook } from './metadata';
import { buildBudgetWorkbook, exportBudget, exportFilename, moneyFormat } from './export-budget';
import { XLSX_MIME, readWorkbook } from './workbook';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const budget = (currency = 'EUR'): Budget => createBudget({ id: BUDGET_ID, name: 'Wedding', currency, now: new Date('2026-02-01T10:20:30.456Z') });
const make = (n: number, parent: number | null, sortIndex: number, extra: Partial<Item> = {}) =>
	createItem({ id: uuid(n), budgetId: BUDGET_ID, parentId: parent === null ? null : uuid(parent), sortIndex, description: `Item ${n}`, ...extra });

// Display order is by sortIndex, not array order: 1 Venue (Group x2.5) > 1.1 Hall, 1.2 Deposit; 2 Music; 3 Discounts (Group x3, negative).
const sample = (): Item[] => [
	make(5, 3, 0, { description: 'Coupon', unitPrice: '-10' }),
	make(4, null, 1, { description: 'Music', unitPrice: '1200.5' }),
	make(2, 1, 0, { description: 'Hall', unitPrice: '19.990', quantity: '3', unit: 'days' }),
	make(1, null, 0, { description: 'Venue', quantity: '2.5' }),
	make(3, null, 2, { description: 'Discounts', quantity: '3' }),
	make(6, 3, 1, { description: 'Voucher', unitPrice: '-5.5', quantity: '2' }),
	make(7, 1, 1, { description: 'Deposit', unitPrice: '-0.1000000000000000055511151231257827' })
];

const built = (items = sample(), b = budget()) => buildBudgetWorkbook(b, items);
const rowsOf = (sheet: Awaited<ReturnType<typeof built>>['worksheets'][number]) =>
	Array.from({ length: sheet.actualRowCount - 1 }, (_, i) => sheet.getRow(i + 2));

describe('exported rows', () => {
	it('have exactly the six visible columns, with the metadata on a separate hidden sheet', async () => {
		const workbook = await built();
		const sheet = workbook.getWorksheet(BUDGET_SHEET)!;

		expect(sheet.getRow(1).values).toEqual([undefined, ...VISIBLE_COLUMNS]);
		expect(sheet.columnCount).toBe(6);
		expect(workbook.worksheets.map((s) => [s.name, s.state])).toEqual([[BUDGET_SHEET, 'visible'], [METADATA_SHEET, 'hidden']]);
	});

	it('follow the hierarchy and the sibling order, not the order of the array', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		const rows = rowsOf(sheet).map((row) => [row.getCell(1).value, row.getCell(2).value]);
		expect(rows).toEqual([
			['1', 'Venue'],
			['1.1', 'Hall'],
			['1.2', 'Deposit'],
			['2', 'Music'],
			['3', 'Discounts'],
			['3.1', 'Coupon'],
			['3.2', 'Voucher']
		]);
		expect(sheet.getCell('A2').type).toBe(3); // text, so Excel does not turn "1.1" into a number
	});

	it('show the current calculated Group Unit prices and Totals, including negative roll-ups and a non-default Group Quantity', async () => {
		const items = sample();
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const rows = rowsOf(sheet);
		const { amounts } = calculateBudget(items);
		const cell = (row: number, column: number) => rows[row].getCell(column).value as number;

		// Venue (Group, Quantity 2.5): Unit price = 19.990 x 3 + (-0.1...) , Total = that x 2.5
		expect(cell(0, 3)).toBe(2.5);
		expect(cell(0, 5)).toBe(Number(toString(amounts.get(uuid(1))!.unitPrice)));
		expect(cell(0, 6)).toBe(Number(toString(amounts.get(uuid(1))!.total)));
		expect(cell(0, 5)).toBeCloseTo(59.87, 10);
		expect(cell(0, 6)).toBeCloseTo(149.675, 10);
		// Discounts (Group, Quantity 3): -10 + (-5.5 x 2) = -21 per, so -63
		expect([cell(4, 3), cell(4, 5), cell(4, 6)]).toEqual([3, -21, -63]);
		expect([cell(5, 5), cell(5, 6)]).toEqual([-10, -10]);
		expect([cell(6, 5), cell(6, 6)]).toEqual([-5.5, -11]);
	});

	it('are values, not formulas, so nothing can go stale', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		for (const row of rowsOf(sheet)) {
			for (const column of [3, 5, 6]) expect(typeof row.getCell(column).value).toBe('number');
		}
	});

	it('leave the Unit empty when an Item has none', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		expect(rowsOf(sheet).map((row) => row.getCell(4).value)).toEqual([null, 'days', null, null, null, null, null]);
	});
});

describe('styling and formatting', () => {
	it('styles Group rows apart from Lines, lighter the deeper they go', async () => {
		const items = [...sample(), make(8, 2, 0, { description: 'Sub', unitPrice: '1' }), make(9, 8, 0, { description: 'Subsub', unitPrice: '1' })];
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const rows = new Map(rowsOf(sheet).map((row) => [row.getCell(1).value as string, row]));
		const fill = (code: string) => (rows.get(code)!.getCell(2).fill as { fgColor: { argb: string } } | undefined)?.fgColor.argb;
		const bold = (code: string) => rows.get(code)!.getCell(2).font?.bold;

		for (const group of ['1', '1.1', '3']) expect(bold(group)).toBe(true);
		for (const line of ['1.2', '2', '3.1', '1.1.1.1']) {
			expect(bold(line)).toBeFalsy();
			expect(fill(line)).toBeUndefined();
		}
		expect(fill('1')).not.toBe(fill('1.1')); // depth 0 vs depth 1
		expect(fill('1.1')).not.toBe(fill('1.1.1'));
		expect(fill('1')).toBe(fill('3')); // same depth, same tint
	});

	it('indents Descriptions by depth and freezes the header row', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		const indents = rowsOf(sheet).map((row) => row.getCell(2).alignment?.indent);
		expect(indents).toEqual([0, 1, 1, 0, 0, 1, 1]);
		expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
		expect(sheet.getRow(1).font?.bold).toBe(true);
	});

	it('formats Unit price and Total in the Budget currency, and nothing else', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		const row = rowsOf(sheet)[1];
		expect(row.getCell(5).numFmt).toBe('"€"#,##0.00;-"€"#,##0.00');
		expect(row.getCell(6).numFmt).toBe(row.getCell(5).numFmt);
		expect(row.getCell(3).numFmt).toBeUndefined(); // Quantity is a plain number
	});

	it('uses the currency\'s own minor units and symbol', () => {
		expect(moneyFormat('USD')).toBe('"$"#,##0.00;-"$"#,##0.00');
		expect(moneyFormat('JPY')).toBe('"¥"#,##0;-"¥"#,##0'); // no decimals
		expect(moneyFormat('KWD')).toContain('0.000'); // three
		expect(moneyFormat('ZZZ')).toContain('ZZZ'); // an unknown code is shown as it is
	});
});

describe('decimal fidelity', () => {
	it('keeps the full value in the cell and rounds only on display', async () => {
		const items = [make(1, null, 0, { unitPrice: '19.995', quantity: '3' })];
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		expect(sheet.getCell('E2').value).toBe(19.995); // not 20.00
		expect(sheet.getCell('F2').value).toBe(59.985);
		expect(sheet.getCell('E2').numFmt).toContain('0.00'); // the format does the rounding on screen
	});

	it('returns every Item exactly through the file: ids, Budget, structure and exact decimals', async () => {
		const items = sample();
		const blob = await exportBudget(budget(), items);
		const decoded = decodeBudgetWorkbook(await readWorkbook(await blob.arrayBuffer()));
		if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));

		expect(decoded.budget).toEqual(budget());
		const byId = new Map(decoded.rows.map((row) => [row.itemId, row]));
		expect(decoded.rows).toHaveLength(items.length);
		for (const item of items) {
			const row = byId.get(item.id)!;
			expect(row.parentId).toBe(item.parentId);
			expect(row.description).toBe(item.description);
			expect(row.quantity).toBe(item.quantity);
			expect(row.unit).toBe(item.unit);
			const isGroup = items.some((other) => other.parentId === item.id);
			expect(row.unitPrice).toBe(isGroup ? '0' : item.unitPrice); // a Group's own price is calculated
		}
		expect(byId.get(uuid(2))!.unitPrice).toBe('19.990'); // trailing zero kept
		expect(byId.get(uuid(7))!.unitPrice).toBe('-0.1000000000000000055511151231257827'); // beyond a double
	});
});

describe('the file', () => {
	it('is an .xlsx Blob', async () => {
		const blob = await exportBudget(budget(), sample());
		expect(blob.type).toBe(XLSX_MIME);
		expect(blob.size).toBeGreaterThan(0);
	});

	it('exports an empty Budget as the header and its metadata, with no rows', async () => {
		const workbook = await readWorkbook(await (await exportBudget(budget(), [])).arrayBuffer());
		expect(workbook.getWorksheet(BUDGET_SHEET)!.actualRowCount).toBe(1);
		const decoded = decodeBudgetWorkbook(workbook);
		expect(decoded.ok && decoded.rows).toEqual([]);
	});

	it('does not change the Items it is given', async () => {
		const items = sample();
		Object.freeze(items);
		items.forEach(Object.freeze);
		await exportBudget(budget(), items);
		expect(items).toEqual(sample());
	});

	it('names the file after the Budget, safely', () => {
		const named = (name: string) => exportFilename({ ...budget(), name });
		expect(named('Wedding 2026')).toBe('Wedding 2026.xlsx');
		expect(named('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j.xlsx');
		expect(named('   ')).toBe('Budget.xlsx');
		expect(named('..hidden')).toBe('hidden.xlsx');
		expect(named('x'.repeat(200))).toBe(`${'x'.repeat(80)}.xlsx`);
	});
});
