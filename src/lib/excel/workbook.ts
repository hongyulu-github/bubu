import type { Workbook } from 'exceljs';

/**
 * Browser-only workbook access (LUL-33): the one place the app touches ExcelJS. Everything works on
 * in-memory data (an ArrayBuffer in, a Blob out), so no server and no Node API is involved. ExcelJS is
 * large, so it is loaded the first time a workbook is needed, not with the app. Its package maps
 * `exceljs` to the prebuilt browser bundle, which is what Vite resolves for the static site.
 */
export type { Workbook, Worksheet, Row, Cell } from 'exceljs';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

async function excel() {
	const loaded = await import('exceljs');
	return loaded.default ?? loaded; // the bundle is CommonJS: its API is on the default export
}

/** A new, empty workbook. */
export async function createWorkbook(): Promise<Workbook> {
	return new (await excel()).Workbook();
}

/** Read an .xlsx file's bytes (for example from `File.arrayBuffer()`). Rejects when it is not a valid .xlsx. */
export async function readWorkbook(data: ArrayBuffer): Promise<Workbook> {
	const workbook = await createWorkbook();
	// ExcelJS types `load` for Node's Buffer, but in the browser it takes the ArrayBuffer as it is.
	await workbook.xlsx.load(data as unknown as Parameters<Workbook['xlsx']['load']>[0]);
	return workbook;
}

/** A valid .xlsx file, ready to download or hand to `URL.createObjectURL`. */
export async function writeWorkbook(workbook: Workbook): Promise<Blob> {
	const bytes = await workbook.xlsx.writeBuffer();
	return new Blob([bytes as BlobPart], { type: XLSX_MIME });
}
