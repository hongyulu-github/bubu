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

/** A cell's number: a plain value, or the cached result of a formula. */
const num = (cell: { value: unknown }) => {
	const value = cell.value as number | { result: number };
	return typeof value === 'number' ? value : value.result;
};
const formulaOf = (cell: { value: unknown }) => (cell.value as { formula?: string }).formula;

const built = (items = sample(), b = budget()) => buildBudgetWorkbook(b, items);
const rowsOf = (sheet: Awaited<ReturnType<typeof built>>['worksheets'][number]) =>
	Array.from({ length: sheet.actualRowCount - 2 }, (_, i) => sheet.getRow(i + 3)); // the header is row 1, the Grand total row 2

/** The worksheet row of an Item in an already built tree. */
const rowOf = (tree: { ordered: readonly { item: { id: string } }[] }, id: string) => tree.ordered.findIndex((node) => node.item.id === id) + 3;

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
		expect(sheet.getCell('A4').type).toBe(3); // text, so Excel does not turn "1.1" into a number
	});

	it('show the current calculated Group Unit prices and Totals, including negative roll-ups and a non-default Group Quantity', async () => {
		const items = sample();
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const rows = rowsOf(sheet);
		const { amounts } = calculateBudget(items);
		const cell = (row: number, column: number) => num(rows[row].getCell(column));

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

	it('leave the Unit empty when an Item has none', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		expect(rowsOf(sheet).map((row) => row.getCell(4).value)).toEqual([null, 'days', null, null, null, null, null]);
	});
});

describe('the Grand total row', () => {
	it('is the first row under the header, labelled, with no Code and nothing but the Total', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		expect(sheet.getRow(1).getCell(1).value).toBe('Code');
		expect(sheet.getRow(2).values).toEqual([undefined, undefined, 'Grand total', undefined, undefined, undefined, expect.anything()]);
		expect(sheet.getCell('A3').value).toBe('1'); // the Items follow
	});

	it('adds the top-level Totals only, because their children are already inside them', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		const topLevel = rowsOf(sheet).filter((row) => !String(row.getCell(1).value).includes('.'));
		expect(formulaOf(sheet.getCell('F2'))).toBe(`SUM(${topLevel.map((row) => `F${row.number}`).join(',')})`);
		expect(topLevel.map((row) => row.getCell(1).value)).toEqual(['1', '2', '3']);
	});

	it('shows the app\'s grand total as its cached result, negative parts included, and matches a recalculation', async () => {
		const items = sample();
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		expect(num(sheet.getCell('F2'))).toBe(Number(toString(calculateBudget(items).grandTotal)));
		expect(num(sheet.getCell('F2'))).toBeCloseTo(149.675 + 1200.5 - 63, 9);
		expect(recalculate(sheet).get('F2')).toBeCloseTo(num(sheet.getCell('F2')), 9);
	});

	it('is formatted in the Budget currency and stands out by weight and fill, with the same hairline as every other row', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		expect(sheet.getCell('F2').numFmt).toBe('"€"#,##0.00;-"€"#,##0.00');
		for (let column = 1; column <= 6; column++) {
			const cell = sheet.getRow(2).getCell(column);
			expect(cell.font).toMatchObject({ bold: true, size: 10.5 });
			expect((cell.fill as { fgColor: { argb: string } }).fgColor.argb).toBe('FFFDF9F7');
			expect(cell.border?.bottom).toMatchObject({ style: 'thin', color: { argb: 'FFD8D5D2' } }); // not a heavier line than the rest
		}
	});

	it('is not an Item: the metadata rows start below it, and the decoder skips it', async () => {
		const items = sample();
		const decoded = decodeBudgetWorkbook(await readWorkbook(await (await exportBudget(budget(), items)).arrayBuffer()));
		if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
		expect(decoded.rows).toHaveLength(items.length);
		expect(decoded.rows[0]).toMatchObject({ row: 3, code: '1' });
		expect(decoded.rows.some((row) => row.description === 'Grand total')).toBe(false);
	});

	it('stays valid with more than 255 top-level Items', async () => {
		const items = Array.from({ length: 300 }, (_, i) => make(10 + i, null, i, { unitPrice: '2' }));
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		expect(formulaOf(sheet.getCell('F2'))!.split('+')).toHaveLength(2);
		expect(recalculate(sheet).get('F2')).toBe(600);
	});
});

describe('styling and formatting', () => {
	const rowsByCode = async (items = sample()) => {
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		return { sheet, rows: new Map(rowsOf(sheet).map((row) => [row.getCell(1).value as string, row])) };
	};
	const fillOf = (row: { getCell: (n: number) => { fill?: unknown } }, column = 2) => (row.getCell(column).fill as { fgColor: { argb: string } }).fgColor.argb;

	it('tints Group rows by depth like the app, and gives Lines the page background', async () => {
		const items = [...sample(), make(8, 2, 0, { description: 'Sub', unitPrice: '1' }), make(9, 8, 0, { description: 'Subsub', unitPrice: '1' })];
		const { rows } = await rowsByCode(items);

		expect(fillOf(rows.get('1')!)).toBe('FFD7E5DF'); // top-level Group
		expect(fillOf(rows.get('1.1')!)).toBe('FFE0EBE6'); // a Group inside it
		expect(fillOf(rows.get('1.1.1')!)).toBe('FFE8EFEB'); // and one more level
		expect(fillOf(rows.get('3')!)).toBe(fillOf(rows.get('1')!)); // same depth, same tint
		for (const line of ['1.2', '2', '3.1', '1.1.1.1']) expect(fillOf(rows.get(line)!)).toBe('FFF1F5F3');
		for (const group of ['1', '1.1', '1.1.1']) {
			for (const column of [1, 3, 5, 6]) expect(fillOf(rows.get(group)!, column)).toBe(fillOf(rows.get(group)!)); // the whole row
		}
	});

	it('draws a hairline separator under every row, header included', async () => {
		const { sheet, rows } = await rowsByCode();
		const border = (cell: { border?: { bottom?: { style?: string; color?: { argb?: string } } } }) => [cell.border?.bottom?.style, cell.border?.bottom?.color?.argb];
		for (const row of [sheet.getRow(1), ...rows.values()]) {
			for (let column = 1; column <= 6; column++) expect(border(row.getCell(column))).toEqual(['thin', 'FFD8D5D2']);
		}
	});

	it('marks every row inside a top-level Group with the accent bar, and no top-level Line', async () => {
		const { rows } = await rowsByCode();
		const bar = (code: string) => rows.get(code)!.getCell(1).border?.left;
		for (const code of ['1', '1.1', '1.2', '3', '3.1', '3.2']) expect(bar(code)).toMatchObject({ style: 'thick', color: { argb: 'FF00603C' } });
		expect(bar('2')).toBeUndefined();
		expect(rows.get('1.1')!.getCell(2).border?.left).toBeUndefined(); // the bar is on the first cell only
	});

	it('uses the app\'s text colours and weights: muted Code and calculated prices, bold Total and Group Description', async () => {
		const { rows } = await rowsByCode();
		const font = (code: string, column: number) => rows.get(code)!.getCell(column).font!;

		expect(font('1.1', 1).color?.argb).toBe('FF4A4C49'); // Code, muted
		expect(font('1.1', 5).color?.argb).toBe('FF080B09'); // a Line's Unit price is an input: full strength
		expect(font('1', 5).color?.argb).toBe('FF4A4C49'); // a Group's is calculated: muted
		expect(font('1', 2).bold).toBe(true); // Group Description
		expect(font('1.1', 2).bold).toBeFalsy(); // Line Description
		for (const code of ['1', '1.1', '2']) expect(font(code, 6).bold).toBe(true); // Total
		expect(font('2', 3).bold).toBeFalsy();
		expect(font('2', 2).size).toBe(10.5);
	});

	it('styles the header like the app: small, bold, muted, on the page background, frozen, without gridlines', async () => {
		const { sheet } = await rowsByCode();
		const header = sheet.getRow(1).getCell(2);
		expect(header.font).toMatchObject({ bold: true, size: 9, color: { argb: 'FF4A4C49' } });
		expect(fillOf(sheet.getRow(1))).toBe('FFF1F5F3');
		expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 2, showGridLines: false }); // header and Grand total stay in view
		expect(sheet.getRow(1).getCell(5).alignment?.horizontal).toBe('right');
	});

	it('indents Descriptions by depth', async () => {
		const { sheet } = await rowsByCode();
		expect(rowsOf(sheet).map((row) => row.getCell(2).alignment?.indent)).toEqual([0, 1, 1, 0, 0, 1, 1]);
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

/** An independent check of the formulas: evaluate them from the plain cells only, in the two shapes the export writes. */
function recalculate(sheet: Awaited<ReturnType<typeof built>>['worksheets'][number]): Map<string, number> {
	const value = new Map<string, number>(); // "F3" -> number
	const read = (ref: string): number => {
		const known = value.get(ref);
		if (known !== undefined) return known;
		const cell = sheet.getCell(ref);
		const formula = formulaOf(cell);
		const result = formula === undefined ? (cell.value as number) : evaluate(formula);
		value.set(ref, result);
		return result;
	};
	const evaluate = (formula: string): number => {
		const sums = formula.replace(/SUM\(([^)]*)\)/g, (_, args: string) => String(args.split(',').reduce((total, ref) => total + read(ref.trim()), 0)));
		return sums.split('+').reduce((total, term) => total + term.split('*').reduce((product, ref) => product * (/^[A-Z]\d+$/.test(ref.trim()) ? read(ref.trim()) : Number(ref)), 1), 0);
	};
	for (let r = 2; r <= sheet.actualRowCount; r++) for (const column of r === 2 ? ['F'] : ['E', 'F']) read(`${column}${r}`);
	return value;
}

describe('live formulas', () => {
	it('write each Total as Quantity times Unit price, and keep a Line\'s Quantity and Unit price as plain numbers', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		for (const row of rowsOf(sheet)) {
			const r = row.number;
			expect(formulaOf(row.getCell(6))).toBe(`C${r}*E${r}`);
			expect(typeof row.getCell(3).value).toBe('number'); // Quantity is an input, Groups included
		}
		const lines = rowsOf(sheet).filter((row) => !['1', '3'].includes(row.getCell(1).value as string));
		for (const row of lines) expect(typeof row.getCell(5).value).toBe('number');
	});

	it('write a Group\'s Unit price as the sum of its direct children\'s Totals, and no other row', async () => {
		const sheet = (await built([...sample(), make(8, 2, 0, { description: 'Sub', unitPrice: '1' })])).getWorksheet(BUDGET_SHEET)!;
		const rows = rowsOf(sheet);
		const code = (row: (typeof rows)[number]) => row.getCell(1).value as string;
		const group = (c: string) => rows.find((row) => code(row) === c)!;
		const childrenOf = (parent: string) => rows.filter((row) => code(row).startsWith(`${parent}.`) && code(row).split('.').length === parent.split('.').length + 1);

		for (const parent of ['1', '1.1', '3']) {
			const refs = childrenOf(parent).map((row) => `F${row.number}`);
			expect(formulaOf(group(parent).getCell(5))).toBe(`SUM(${refs.join(',')})`);
		}
		// "1" sums 1.1 and 1.2 only: not 1.1.1, which is already inside 1.1's Total.
		expect(formulaOf(group('1').getCell(5))).not.toContain(`F${group('1.1.1').number}`);
	});

	it('carry the app\'s calculated values as cached results, negative roll-ups included', async () => {
		const items = sample();
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const { amounts } = calculateBudget(items);
		const tree = (await import('../budget/tree')).buildItemTree(items);

		for (const node of tree.ordered) {
			const row = sheet.getRow(rowOf(tree, node.item.id));
			expect(num(row.getCell(5))).toBe(Number(toString(amounts.get(node.item.id)!.unitPrice)));
			expect(num(row.getCell(6))).toBe(Number(toString(amounts.get(node.item.id)!.total)));
		}
		expect(num(sheet.getCell('F7'))).toBe(-63); // Discounts: negative, with Quantity 3
	});

	it('reproduce those results when recalculated from the plain cells alone', async () => {
		const sheet = (await built()).getWorksheet(BUDGET_SHEET)!;
		const value = recalculate(sheet);
		for (const row of rowsOf(sheet)) {
			for (const column of [5, 6]) expect(value.get(`${'ABCDEF'[column - 1]}${row.number}`)).toBeCloseTo(num(row.getCell(column)), 9);
		}
	});

	it('follow an edit up the hierarchy: change a child and its Group and every ancestor Total move', async () => {
		const items = [make(1, null, 0, { quantity: '2' }), make(2, 1, 0, { quantity: '3' }), make(3, 2, 0, { unitPrice: '10', quantity: '4' }), make(4, null, 1, { unitPrice: '5' })];
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const before = recalculate(sheet);
		expect(before.get('F3')).toBe(240); // (10 x 4) x 3 x 2
		expect(before.get('F2')).toBe(245); // the Grand total: 240 + 5

		sheet.getCell('E5').value = 11; // the Line 1.1.1: Unit price 10 -> 11
		const after = recalculate(sheet);
		expect(after.get('F5')).toBe(44);
		expect(after.get('E4')).toBe(44); // 1.1's Unit price follows its child
		expect(after.get('F4')).toBe(132); // x 3
		expect(after.get('E3')).toBe(132); // the top Group follows 1.1
		expect(after.get('F3')).toBe(264); // x 2
		expect(after.get('F6')).toBe(5); // an unrelated Line is untouched
		expect(after.get('F2')).toBe(269); // and the Grand total follows: 264 + 5
	});

	it('stay valid for a Group with more than 255 children: several SUMs added together', async () => {
		const children = Array.from({ length: 300 }, (_, i) => make(10 + i, 1, i, { unitPrice: '2', quantity: '1.5' }));
		const sheet = (await built([make(1, null, 0, { quantity: '2' }), ...children])).getWorksheet(BUDGET_SHEET)!;
		const formula = formulaOf(sheet.getCell('E3'))!;

		const sums = formula.split('+');
		expect(sums.length).toBe(2); // 200 + 100 children
		for (const sum of sums) expect(sum.slice(4, -1).split(',').length).toBeLessThanOrEqual(255);
		expect(formula.length).toBeLessThan(8192); // Excel's formula limit
		expect(recalculate(sheet).get('E3')).toBe(900); // 300 x (2 x 1.5)
		expect(num(sheet.getCell('E3'))).toBe(900);
		expect(num(sheet.getCell('F3'))).toBe(1800); // x the Group's Quantity 2
		expect(num(sheet.getCell('F2'))).toBe(1800); // the Grand total
	});

	it('survive the file: formulas and their cached results read back unchanged', async () => {
		const items = sample();
		const original = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		const reread = (await readWorkbook(await (await exportBudget(budget(), items)).arrayBuffer())).getWorksheet(BUDGET_SHEET)!;

		for (const row of rowsOf(original)) {
			for (const column of [5, 6]) {
				expect(formulaOf(reread.getCell(row.number, column))).toBe(formulaOf(row.getCell(column)));
				expect(num(reread.getCell(row.number, column))).toBe(num(row.getCell(column)));
			}
		}
		expect(formulaOf(reread.getCell('E3'))).toMatch(/^SUM\(F\d+,F\d+\)$/);
	});

	it('still decode to the same Items: a Group\'s calculated cells and every Total are ignored, Lines read exactly', async () => {
		const items = sample();
		const decoded = decodeBudgetWorkbook(await readWorkbook(await (await exportBudget(budget(), items)).arrayBuffer()));
		if (!decoded.ok) throw new Error(JSON.stringify(decoded.issues));
		for (const item of items) {
			const row = decoded.rows.find((r) => r.itemId === item.id)!;
			expect(row.quantity).toBe(item.quantity);
			if (!items.some((other) => other.parentId === item.id)) expect(row.unitPrice).toBe(item.unitPrice);
		}
	});
});

describe('decimal fidelity', () => {
	it('keeps the full value in the cell and rounds only on display', async () => {
		const items = [make(1, null, 0, { unitPrice: '19.995', quantity: '3' })];
		const sheet = (await built(items)).getWorksheet(BUDGET_SHEET)!;
		expect(sheet.getCell('E3').value).toBe(19.995); // not 20.00
		expect(num(sheet.getCell('F3'))).toBe(59.985);
		expect(num(sheet.getCell('F2'))).toBe(59.985); // the Grand total
		expect(sheet.getCell('E3').numFmt).toContain('0.00'); // the format does the rounding on screen
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

	it('exports an empty Budget as the header, a zero Grand total and its metadata, with no Item rows', async () => {
		const workbook = await readWorkbook(await (await exportBudget(budget(), [])).arrayBuffer());
		const sheet = workbook.getWorksheet(BUDGET_SHEET)!;
		expect(sheet.actualRowCount).toBe(2);
		expect([sheet.getCell('B2').value, num(sheet.getCell('F2'))]).toEqual(['Grand total', 0]);
		expect(formulaOf(sheet.getCell('F2'))).toBeUndefined(); // nothing to sum
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
