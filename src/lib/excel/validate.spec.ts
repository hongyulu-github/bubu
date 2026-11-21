import { describe, expect, it } from 'vitest';
import { createBudget, createItem, type Budget, type Item } from '../budget/model';
import { VISIBLE_COLUMNS, METADATA_SHEET, encodeMetadata } from './metadata';
import { exportBudget } from './export-budget';
import { createTemplate } from './template';
import { validateBudgetFile, validateBudgetWorkbook, type ValidationError, type ValidationResult } from './validate';
import { createWorkbook, readWorkbook, writeWorkbook, type Workbook } from './workbook';

type Cells = [code: unknown, description?: unknown, quantity?: unknown, unit?: unknown, unitPrice?: unknown, total?: unknown];

/** A workbook with the shared header and the given rows (numbers as numbers, text as text, like a user's file). */
async function book(rows: Cells[], header: readonly string[] = VISIBLE_COLUMNS): Promise<Workbook> {
	const workbook = await createWorkbook();
	const sheet = workbook.addWorksheet('Budget');
	sheet.addRow([...header]);
	for (const row of rows) sheet.addRow(row.map((cell) => cell ?? null) as never);
	return workbook;
}
const errorsOf = (result: ValidationResult): ValidationError[] => (result.ok ? [] : result.errors);
const codes = (result: ValidationResult) => errorsOf(result).map((e) => e.code);
const where = (result: ValidationResult) => errorsOf(result).map((e) => [e.code, e.cell]);
const rowsOf = (result: ValidationResult) => (result.ok ? result.rows : []);

describe('valid workbooks', () => {
	it('accepts the empty template, with no metadata', async () => {
		const result = await validateBudgetFile(await (await createTemplate()).arrayBuffer());
		expect(result).toEqual({ ok: true, rows: [], metadata: null });
	});

	it('accepts a filled template with a hierarchy, reading Groups and Lines apart', async () => {
		const result = validateBudgetWorkbook(
			await book([
				['1', 'Venue', 2, null, 'ignored', 'ignored'],
				['1.1', 'Hall', 3, 'days', 19.99, 59.97],
				['1.2', 'Deposit', 1, null, -100, -100],
				['2', 'Music', 1, 'hours', 1200.5, 1200.5]
			])
		);
		expect(result.ok).toBe(true);
		expect(rowsOf(result).map((r) => [r.code, r.parentCode, r.kind])).toEqual([
			['1', null, 'group'],
			['1.1', '1', 'line'],
			['1.2', '1', 'line'],
			['2', null, 'line']
		]);
		expect(rowsOf(result)[1]).toMatchObject({ row: 3, description: 'Hall', quantity: '3', unit: 'days', unitPrice: '19.99' });
		expect(rowsOf(result)[0]).not.toHaveProperty('unit');
		expect(result.ok && result.metadata).toBeNull();
	});

	it('accepts fractional and zero Quantity and negative Line prices, keeping the exact text', async () => {
		const result = validateBudgetWorkbook(
			await book([
				['1', 'Half', '0.50', null, '-19.990'],
				['2', 'None', 0, null, 5],
				['3', 'Tiny', '.25', null, '-0.1000000000000000055511151231257827']
			])
		);
		expect(rowsOf(result).map((r) => [r.quantity, r.unitPrice])).toEqual([
			['0.50', '-19.990'], // typed as text: every digit stays
			['0', '5'],
			['.25', '-0.1000000000000000055511151231257827']
		]);
	});

	it('does not care about the order of rows, extra columns or case in the titles', async () => {
		const workbook = await book([['2', 'B', 1, null, 2], ['1', 'A', 1, null, 1]], ['code', 'DESCRIPTION', 'Quantity', 'Unit', 'Unit price', 'Total']);
		workbook.getWorksheet('Budget')!.getCell('H1').value = 'Notes';
		expect(validateBudgetWorkbook(workbook).ok).toBe(true);
	});

	it('skips blank rows and the exporter\'s Grand total row', async () => {
		const result = validateBudgetWorkbook(await book([[null, 'Grand total', null, null, null, 1], ['1', 'A', 1, null, 1], [null], ['2', 'B', 1, null, 1]]));
		expect(rowsOf(result).map((r) => r.code)).toEqual(['1', '2']);
	});
});

describe('derived cells are ignored, not trusted', () => {
	it('ignores any Total, and a Group\'s Unit price, whatever they hold', async () => {
		const result = validateBudgetWorkbook(
			await book([
				['1', 'Group', 2, null, 'garbage', 'also garbage'],
				['1.1', 'Line', 3, null, 10, '#DIV/0!'],
				['2', 'Group with a blank price', 1, null, null, null],
				['2.1', 'Line', 1, null, 5, -999]
			])
		);
		expect(result.ok).toBe(true);
		expect(rowsOf(result).map((r) => r.unitPrice)).toEqual(['0', '10', '0', '5']); // the Group's is 0, never the cell's
	});

	it('still checks a Line\'s own Unit price, since that one is an input', async () => {
		expect(where(validateBudgetWorkbook(await book([['1', 'Line', 1, null, 'garbage', 7]])))).toEqual([['invalid-unit-price', 'E2']]);
	});
});

describe('numeric errors name the cell', () => {
	it('rejects a blank or non-numeric Quantity, and a negative one', async () => {
		const result = validateBudgetWorkbook(
			await book([
				['1', 'a', null, null, 1],
				['2', 'b', 'lots', null, 1],
				['3', 'c', -1, null, 1],
				['4', 'd', '1e3', null, 1],
				['5', 'e', '', null, 1]
			])
		);
		expect(where(result)).toEqual([
			['invalid-quantity', 'C2'],
			['invalid-quantity', 'C3'],
			['invalid-quantity', 'C4'],
			['invalid-quantity', 'C5'],
			['invalid-quantity', 'C6']
		]);
		expect(errorsOf(result).map((e) => e.message)).toEqual([
			'Quantity: Enter a number.',
			'Quantity: Enter a valid number.',
			'Quantity: Quantity cannot be negative.',
			'Quantity: Enter a valid number.',
			'Quantity: Enter a number.'
		]);
		expect(errorsOf(result)[0]).toMatchObject({ row: 2, column: 'Quantity' });
	});

	it('checks a Group\'s Quantity too, since that one is an input', async () => {
		expect(where(validateBudgetWorkbook(await book([['1', 'G', -2, null, null], ['1.1', 'L', 1, null, 1]])))).toEqual([['invalid-quantity', 'C2']]);
	});

	it('rejects a blank or non-numeric Line Unit price', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 1, null, null], ['2', 'b', 1, null, 'ten'], ['3', 'c', 1, null, '1,5']]));
		expect(where(result)).toEqual([['invalid-unit-price', 'E2'], ['invalid-unit-price', 'E3'], ['invalid-unit-price', 'E4']]);
	});

	it('reports every problem at once, in row order', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 'x', null, 'y'], ['bad', 'b', 1, null, 1], ['1', 'c', 1, null, 1]]));
		expect(where(result)).toEqual([['invalid-quantity', 'C2'], ['invalid-unit-price', 'E2'], ['malformed-code', 'A3'], ['duplicate-code', 'A4']]);
	});
});

describe('workbook structure', () => {
	it('reports each missing or misplaced column with its cell', async () => {
		const result = validateBudgetWorkbook(await book([], ['Code', 'Description', 'Qty', 'Unit', 'Unit price']));
		expect(where(result)).toEqual([['missing-column', 'C1'], ['missing-column', 'F1']]);
		expect(errorsOf(result)[0]).toMatchObject({ column: 'Quantity', row: 1 });
		expect(errorsOf(result)[0].message).toContain('but is "Qty"');
		expect(errorsOf(result)[1].message).toBe('Column F should be titled "Total".');
	});

	it('reports columns in the wrong order', async () => {
		const result = validateBudgetWorkbook(await book([], ['Description', 'Code', 'Quantity', 'Unit', 'Unit price', 'Total']));
		expect(where(result)).toEqual([['missing-column', 'A1'], ['missing-column', 'B1']]);
	});

	it('reports a workbook with no Budget sheet', async () => {
		const workbook = await createWorkbook();
		workbook.addWorksheet('Sheet1');
		expect(codes(validateBudgetWorkbook(workbook))).toEqual(['missing-budget-sheet']);
	});

	it('reports bytes that are not a workbook as one error, without throwing', async () => {
		for (const bytes of [new TextEncoder().encode('just text'), new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]), new Uint8Array(0)]) {
			const result = await validateBudgetFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
			expect(codes(result)).toEqual(['unreadable-workbook']);
		}
	});

	it('reads a real .xlsx from bytes', async () => {
		const workbook = await book([['1', 'A', 1, null, 1]]);
		const result = await validateBudgetFile(await (await writeWorkbook(workbook)).arrayBuffer());
		expect(result.ok).toBe(true);
	});
});

describe('hierarchy and Codes', () => {
	it('rejects malformed Codes', async () => {
		const bad = ['a', '1.', '.1', '1..2', '1.2.', '-1', '1,2', '1 2', 'I'];
		const result = validateBudgetWorkbook(await book(bad.map((code) => [code, 'x', 1, null, 1])));
		expect(codes(result)).toEqual(bad.map(() => 'malformed-code'));
		expect(errorsOf(result).map((e) => e.cell)).toEqual(bad.map((_, i) => `A${i + 2}`));
	});

	it('rejects a blank Code on a row that has other content', async () => {
		expect(where(validateBudgetWorkbook(await book([[null, 'Orphan', 1, null, 1]])))).toEqual([['blank-code', 'A2']]);
	});

	it('rejects duplicate Codes, naming the first row', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 1, null, 1], ['2', 'b', 1, null, 1], ['1', 'c', 1, null, 1]]));
		expect(where(result)).toEqual([['duplicate-code', 'A4']]);
		expect(errorsOf(result)[0].message).toBe('Code 1 is already used on row 2.');
	});

	it('rejects a Code whose parent does not exist, at any depth', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 1, null, 1], ['1.2.3', 'b', 1, null, 1], ['2.1', 'c', 1, null, 1]]));
		expect(where(result)).toEqual([['missing-parent', 'A3'], ['missing-parent', 'A4']]);
		expect(errorsOf(result)[0].message).toBe('Code 1.2.3 has no parent: there is no row with Code 1.2.');
	});

	it('accepts a deep hierarchy and gaps between siblings', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 1], ['1.1', 'b', 1], ['1.1.1', 'c', 1], ['1.1.1.1', 'd', 1, null, 4], ['3', 'e', 1, null, 1]]));
		expect(result.ok).toBe(true);
	});

	it('flags a Code that Excel turned into a number, which may have lost a digit', async () => {
		const result = validateBudgetWorkbook(await book([['1', 'a', 1, null, 1], [1.1, 'b', 1, null, 1]]));
		expect(where(result)).toEqual([['malformed-code', 'A3']]);
		expect(errorsOf(result)[0].message).toContain('format the Code column as Text');
		expect(validateBudgetWorkbook(await book([[1, 'a', 1, null, 1], [2, 'b', 1, null, 1]])).ok).toBe(true); // whole numbers are fine
	});
});

describe('Bubu metadata', () => {
	const budget = (): Budget => createBudget({ id: '11111111-1111-4111-8111-111111111111', name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00.000Z') });
	const items = (): Item[] => [
		createItem({ id: '00000000-0000-4000-8000-000000000001', budgetId: budget().id, sortIndex: 0, description: 'Venue', quantity: '2' }),
		createItem({ id: '00000000-0000-4000-8000-000000000002', budgetId: budget().id, parentId: '00000000-0000-4000-8000-000000000001', sortIndex: 0, description: 'Hall', unitPrice: '19.990', quantity: '3' }),
		createItem({ id: '00000000-0000-4000-8000-000000000003', budgetId: budget().id, sortIndex: 1, description: 'Music', unitPrice: '1200.5' })
	];
	const exported = async () => readWorkbook(await (await exportBudget(budget(), items())).arrayBuffer());

	it('accepts a real export, returning the saved Budget and identities', async () => {
		const result = validateBudgetWorkbook(await exported());
		expect(result.ok).toBe(true);
		expect(result.ok && result.metadata?.budget).toEqual(budget());
		expect(rowsOf(result).map((r) => r.code)).toEqual(['1', '1.1', '2']); // the Grand total row is not an Item
		expect(result.ok && result.metadata?.items).toHaveLength(3);
	});

	it('reports an unsupported metadata version', async () => {
		const workbook = await exported();
		workbook.getWorksheet(METADATA_SHEET)!.getCell('B1').value = '2';
		const result = validateBudgetWorkbook(workbook);
		expect(codes(result)).toEqual(['unsupported-version']);
		expect(errorsOf(result)[0].message).toContain('version 2');
	});

	it('reports malformed metadata', async () => {
		const workbook = await exported();
		workbook.getWorksheet(METADATA_SHEET)!.getCell('C10').value = 'not-a-uuid';
		expect(codes(validateBudgetWorkbook(workbook))).toContain('malformed-metadata');
	});

	it('reports moved or sorted rows instead of misassigning identities', async () => {
		const workbook = await exported();
		const sheet = workbook.getWorksheet('Budget')!;
		const music = sheet.getRow(5).values as unknown[];
		sheet.getRow(5).values = sheet.getRow(4).values as never; // swap "1.1 Hall" and "2 Music", Codes and all
		sheet.getRow(4).values = music as never;
		const result = validateBudgetWorkbook(workbook);
		expect(codes(result)).toContain('inconsistent-association');
		expect(result.ok).toBe(false);
	});

	it('reports cell errors and metadata errors together, once each', async () => {
		const workbook = await exported();
		workbook.getWorksheet('Budget')!.getCell('C5').value = 'lots';
		workbook.getWorksheet(METADATA_SHEET)!.getCell('B1').value = '9';
		expect(codes(validateBudgetWorkbook(workbook)).sort()).toEqual(['invalid-quantity', 'unsupported-version']);
	});

	it('accepts edited visible values, which stay authoritative, and new rows without identity', async () => {
		const workbook = await exported();
		const sheet = workbook.getWorksheet('Budget')!;
		sheet.getCell('C4').value = 5; // Hall's Quantity
		sheet.addRow(['3', 'Photographer', 1, null, 300, 300]);
		const result = validateBudgetWorkbook(workbook);
		expect(result.ok).toBe(true);
		expect(rowsOf(result).find((r) => r.code === '1.1')!.quantity).toBe('5');
	});

	it('treats a workbook without metadata as a plain template, with no error for it', async () => {
		const workbook = await exported();
		workbook.removeWorksheet(workbook.getWorksheet(METADATA_SHEET)!.id);
		const result = validateBudgetWorkbook(workbook);
		expect(result.ok && result.metadata).toBeNull();
	});

	it('is as strict about a hand-built metadata sheet as about an exported one', async () => {
		const workbook = await book([['1', 'A', 1, null, 1]]);
		encodeMetadata(workbook, budget(), items().slice(0, 1), 2);
		expect(validateBudgetWorkbook(workbook).ok).toBe(true);
	});
});

describe('no side effects', () => {
	it('changes nothing it reads', async () => {
		const workbook = await book([['1', 'a', 'x', null, 1], ['1', 'b', 1, null, 1]]);
		const before = JSON.stringify(workbook.getWorksheet('Budget')!.getSheetValues());
		validateBudgetWorkbook(workbook);
		validateBudgetWorkbook(workbook);
		expect(JSON.stringify(workbook.getWorksheet('Budget')!.getSheetValues())).toBe(before);
	});
});
