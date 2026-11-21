import { ensureBudgetSheet } from './metadata';
import { createWorkbook, writeWorkbook } from './workbook';

export const TEMPLATE_FILENAME = 'bubu-budget-template.xlsx';

/**
 * An empty workbook for entering a Budget outside BuBu: the visible Budget sheet with its six headers
 * and no rows. It has no metadata sheet, so nothing says it belongs to an existing Budget; importing it
 * makes a new one.
 */
export async function createTemplate(): Promise<Blob> {
	const workbook = await createWorkbook();
	ensureBudgetSheet(workbook);
	return writeWorkbook(workbook);
}

/** Hand a Blob to the browser as a file download. */
export function saveBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}

/** Download the empty template. */
export async function downloadTemplate(): Promise<void> {
	saveBlob(await createTemplate(), TEMPLATE_FILENAME);
}
