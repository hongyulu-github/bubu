import { describe, expect, it } from 'vitest';
import { XLSX_MIME, createWorkbook, readWorkbook, writeWorkbook } from './workbook';

/** A real .xlsx is a ZIP archive: it starts with "PK". */
const startsWithZip = async (blob: Blob) => {
	const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
	return String.fromCharCode(...head) === 'PK';
};

describe('workbook adapter (in a real browser)', () => {
	it('writes a valid .xlsx Blob', async () => {
		const workbook = await createWorkbook();
		workbook.addWorksheet('Budget').addRow(['Venue', 1200]);

		const blob = await writeWorkbook(workbook);

		expect(blob.type).toBe(XLSX_MIME);
		expect(blob.size).toBeGreaterThan(0);
		expect(await startsWithZip(blob)).toBe(true);
	});

	it('reads back what it wrote from an ArrayBuffer, including text, numbers and negatives', async () => {
		const workbook = await createWorkbook();
		const sheet = workbook.addWorksheet('Budget');
		sheet.addRow(['Venue', 1200.5, -40]);
		sheet.getCell('A2').value = 'Music';

		const again = await readWorkbook(await (await writeWorkbook(workbook)).arrayBuffer());

		const read = again.getWorksheet('Budget')!;
		expect(read.getCell('A1').value).toBe('Venue');
		expect(read.getCell('B1').value).toBe(1200.5);
		expect(read.getCell('C1').value).toBe(-40);
		expect(read.getCell('A2').value).toBe('Music');
	});

	it('reads a minimal .xlsx that was not made by this adapter', async () => {
		// The smallest workbook ExcelJS can produce, built independently and read as plain bytes.
		const { default: ExcelJS } = await import('exceljs');
		const source = new ExcelJS.Workbook();
		source.addWorksheet('Sheet1').getCell('A1').value = 'hello';
		const bytes = await source.xlsx.writeBuffer();
		const buffer = (bytes as unknown as Uint8Array).slice().buffer as ArrayBuffer;

		const workbook = await readWorkbook(buffer);
		expect(workbook.getWorksheet('Sheet1')!.getCell('A1').value).toBe('hello');
	});

	it('rejects bytes that are not an .xlsx instead of returning an empty workbook', async () => {
		const notAWorkbook = new TextEncoder().encode('just some text').buffer as ArrayBuffer;
		await expect(readWorkbook(notAWorkbook)).rejects.toThrow();
	});
});
