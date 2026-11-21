import { describe, expect, it } from 'vitest';
import { BUDGET_SHEET, METADATA_SHEET, VISIBLE_COLUMNS, decodeBudgetWorkbook, ensureBudgetSheet } from './metadata';
import { TEMPLATE_FILENAME, createTemplate } from './template';
import { XLSX_MIME, readWorkbook } from './workbook';

const open = async () => readWorkbook(await (await createTemplate()).arrayBuffer());

describe('the empty Budget template', () => {
	it('is an .xlsx file', async () => {
		const blob = await createTemplate();
		expect(blob.type).toBe(XLSX_MIME);
		expect(TEMPLATE_FILENAME.endsWith('.xlsx')).toBe(true);
	});

	it('has the six headers in order and no Item rows', async () => {
		const sheet = (await open()).getWorksheet(BUDGET_SHEET)!;

		expect(sheet.getRow(1).values).toEqual([undefined, 'Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
		expect(sheet.getRow(1).values).toEqual([undefined, ...VISIBLE_COLUMNS]);
		expect(sheet.columnCount).toBe(6);
		expect(sheet.actualRowCount).toBe(1); // the header only
		expect(sheet.rowCount).toBe(1);
	});

	it('has one visible sheet and no hidden identity data that ties it to a Budget', async () => {
		const workbook = await open();
		expect(workbook.worksheets.map((sheet) => [sheet.name, sheet.state])).toEqual([[BUDGET_SHEET, 'visible']]);
		expect(workbook.getWorksheet(METADATA_SHEET)).toBeUndefined();
	});

	it('has the sheet structure an importer expects: the shared Budget sheet, and no metadata, so it reads as a new Budget', async () => {
		const workbook = await open();
		const sheet = workbook.getWorksheet(BUDGET_SHEET)!;
		expect(ensureBudgetSheet(workbook)).toBe(sheet); // the shared contract finds it as it is
		const decoded = decodeBudgetWorkbook(workbook);
		expect(decoded.ok ? [] : decoded.issues.map((issue) => issue.code)).toEqual(['missing-metadata']);
	});

	it('is the same every time, with nothing that varies per download', async () => {
		const [a, b] = await Promise.all([open(), open()]);
		expect(JSON.stringify(a.worksheets.map((s) => s.getSheetValues()))).toBe(JSON.stringify(b.worksheets.map((s) => s.getSheetValues())));
	});
});
