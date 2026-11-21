import { describe, expect, it } from 'vitest';
import { createBudget, createItem, type Budget, type Item } from '../budget/model';
import { buildItemTree } from '../budget/tree';
import {
	BUDGET_SHEET,
	METADATA_SHEET,
	VISIBLE_COLUMNS,
	decodeBudgetWorkbook,
	encodeMetadata,
	ensureBudgetSheet,
	readMetadata,
	type DecodeResult
} from './metadata';
import { createWorkbook, readWorkbook, writeWorkbook, type Workbook } from './workbook';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const budget = (): Budget => createBudget({ id: BUDGET_ID, name: 'Wedding, “2026”', currency: 'EUR', now: new Date('2026-02-01T10:20:30.456Z') });

function make(n: number, parent: number | null, sortIndex: number, extra: Partial<Item> = {}): Item {
	return createItem({ id: uuid(n), budgetId: BUDGET_ID, parentId: parent === null ? null : uuid(parent), sortIndex, description: `Item ${n}`, ...extra });
}

// 1 Venue (Group, Quantity 2.5) > 1.1 Hall (19.990 x 3, "days"), 1.2 Deposit (-0.1000000000000000055511151231257827); 2 Music (Line, 1200.5)
const sample = (): Item[] => [
	make(1, null, 0, { description: 'Venue', quantity: '2.5' }),
	make(2, 1, 0, { description: 'Hall', unitPrice: '19.990', quantity: '3', unit: 'days' }),
	make(3, 1, 1, { description: 'Deposit', unitPrice: '-0.1000000000000000055511151231257827' }),
	make(4, null, 1, { description: 'Music', unitPrice: '1200.5' })
];

/** Stand-in for the exporter (a later ticket): the visible rows as the contract describes, numbers as Excel stores them. */
function writeVisible(workbook: Workbook, items: readonly Item[], edit: (row: Record<string, unknown>, item: Item) => void = () => {}) {
	const sheet = ensureBudgetSheet(workbook);
	for (const node of buildItemTree(items).ordered) {
		const { item } = node;
		const row: Record<string, unknown> = {
			Code: node.code,
			Description: item.description,
			Quantity: Number(item.quantity),
			Unit: item.unit ?? null,
			'Unit price': node.kind === 'group' ? 12.34 : Number(item.unitPrice), // a Group's is calculated
			Total: 99
		};
		edit(row, item);
		sheet.addRow(VISIBLE_COLUMNS.map((column) => row[column] as never));
	}
	return sheet;
}

async function exported(items = sample(), edit?: Parameters<typeof writeVisible>[2]) {
	const workbook = await createWorkbook();
	writeVisible(workbook, items, edit);
	encodeMetadata(workbook, budget(), items);
	return workbook;
}
/** Through a real .xlsx file, as a user would send it back. */
const roundTrip = async (workbook: Workbook) => readWorkbook(await (await writeWorkbook(workbook)).arrayBuffer());
const issues = (result: DecodeResult) => (result.ok ? [] : result.issues);
const codesOf = (result: DecodeResult) => issues(result).map((i) => i.code);

describe('the workbook contract', () => {
	it('keeps the Budget sheet to the six visible columns and hides the metadata sheet', async () => {
		const workbook = await roundTrip(await exported());

		const visible = workbook.getWorksheet(BUDGET_SHEET)!;
		expect(visible.getRow(1).values).toEqual([undefined, ...VISIBLE_COLUMNS]);
		expect(visible.columnCount).toBe(6);
		expect(visible.state).toBe('visible');
		expect(workbook.getWorksheet(METADATA_SHEET)!.state).toBe('hidden');
		expect(workbook.worksheets.filter((sheet) => sheet.state === 'visible').map((sheet) => sheet.name)).toEqual([BUDGET_SHEET]);
	});

	it('encoding never touches the visible sheet and replaces earlier metadata', async () => {
		const workbook = await createWorkbook();
		const sheet = writeVisible(workbook, sample());
		const before = JSON.stringify(sheet.getSheetValues());
		encodeMetadata(workbook, budget(), sample());
		encodeMetadata(workbook, budget(), sample());
		expect(JSON.stringify(sheet.getSheetValues())).toBe(before);
		expect(workbook.worksheets.filter((s) => s.name === METADATA_SHEET)).toHaveLength(1);
	});
});

describe('encode and decode', () => {
	it('round-trips the Budget document, Item identities, structure, Units and a Group Quantity', async () => {
		const result = decodeBudgetWorkbook(await roundTrip(await exported()));
		if (!result.ok) throw new Error(JSON.stringify(result.issues));

		expect(result.budget).toEqual(budget()); // id, name (with its punctuation), currency, both timestamps
		expect(result.rows.map((r) => [r.row, r.code, r.itemId, r.parentId])).toEqual([
			[2, '1', uuid(1), null],
			[3, '1.1', uuid(2), uuid(1)],
			[4, '1.2', uuid(3), uuid(1)],
			[5, '2', uuid(4), null]
		]);
		expect(result.rows.map((r) => r.description)).toEqual(['Venue', 'Hall', 'Deposit', 'Music']);
		expect(result.rows[1].unit).toBe('days');
		expect(result.rows[0]).not.toHaveProperty('unit'); // optional: absent stays absent
		expect(result.rows[0].quantity).toBe('2.5'); // a Group keeps its own Quantity
	});

	it('keeps exact decimals when the visible numbers were not edited, even through the file', async () => {
		const result = decodeBudgetWorkbook(await roundTrip(await exported()));
		if (!result.ok) throw new Error(JSON.stringify(result.issues));
		expect(result.rows[1].unitPrice).toBe('19.990'); // the trailing zero survives
		expect(result.rows[2].unitPrice).toBe('-0.1000000000000000055511151231257827'); // more digits than a double holds
	});

	it("stores a Group's Unit price as 0 whatever the calculated visible cell shows", async () => {
		const result = decodeBudgetWorkbook(await exported());
		if (!result.ok) throw new Error('decode failed');
		expect(result.rows[0].unitPrice).toBe('0');
	});

	it('takes edited visible values as authoritative and leaves the other rows exact', async () => {
		const workbook = await exported(sample(), (row, item) => {
			if (item.id === uuid(2)) {
				row.Quantity = 4;
				row['Unit price'] = 20.25;
				row.Unit = 'hours';
				row.Description = 'Hall (renamed)';
			}
			if (item.id === uuid(3)) row['Unit price'] = '-7.50'; // typed as text: exact as typed
			if (item.id === uuid(1)) row.Unit = null;
		});
		const result = decodeBudgetWorkbook(await roundTrip(workbook));
		if (!result.ok) throw new Error(JSON.stringify(result.issues));

		expect(result.rows[1]).toMatchObject({ quantity: '4', unitPrice: '20.25', unit: 'hours', description: 'Hall (renamed)', itemId: uuid(2) });
		expect(result.rows[2].unitPrice).toBe('-7.50');
		expect(result.rows[3].unitPrice).toBe('1200.5');
	});

	it('gives a row the metadata does not know no identity, and reads it as new', async () => {
		const workbook = await exported();
		workbook.getWorksheet(BUDGET_SHEET)!.addRow(['3', 'Photographer', 1, 'days', 300, 300]);
		const result = decodeBudgetWorkbook(workbook);
		if (!result.ok) throw new Error(JSON.stringify(result.issues));
		expect(result.rows.at(-1)).toMatchObject({ code: '3', itemId: null, parentId: null, quantity: '1', unitPrice: '300' });
	});

	it('treats a deleted row as deleted, not as an inconsistency', async () => {
		const workbook = await exported();
		workbook.getWorksheet(BUDGET_SHEET)!.spliceRows(5, 1); // Music was last: removing it moves nothing else
		const result = decodeBudgetWorkbook(workbook);
		expect(result.ok && result.rows.map((r) => r.itemId)).toEqual([uuid(1), uuid(2), uuid(3)]);
	});
});

describe('typed errors, and no change to anything', () => {
	it('reports a workbook with no metadata', async () => {
		const workbook = await createWorkbook();
		writeVisible(workbook, sample());
		const result = decodeBudgetWorkbook(workbook);
		expect(codesOf(result)).toEqual(['missing-metadata']);
	});

	it('reports an unsupported version, and a version it cannot read', async () => {
		for (const [version, code] of [['2', 'unsupported-version'], ['0', 'unsupported-version'], ['99', 'unsupported-version'], ['abc', 'malformed-metadata'], ['1.5', 'malformed-metadata'], ['', 'malformed-metadata']] as const) {
			const workbook = await exported();
			workbook.getWorksheet(METADATA_SHEET)!.getCell('B1').value = version;
			const result = decodeBudgetWorkbook(workbook);
			expect(codesOf(result)).toEqual([code]);
			if (!result.ok && code === 'unsupported-version') expect(result.issues[0].message).toContain(`version ${version}`);
		}
	});

	it('reports malformed metadata: bad ids, numbers and duplicates', async () => {
		const bad = async (change: (sheet: Workbook['worksheets'][number]) => void) => {
			const workbook = await exported();
			change(workbook.getWorksheet(METADATA_SHEET)!);
			return codesOf(decodeBudgetWorkbook(workbook));
		};
		expect(await bad((s) => (s.getCell('B2').value = 'not-a-uuid'))).toContain('malformed-metadata'); // Budget id
		expect(await bad((s) => (s.getCell('B4').value = 'euro'))).toContain('malformed-metadata'); // currency
		expect(await bad((s) => (s.getCell('C10').value = 'nope'))).toContain('malformed-metadata'); // an Item id
		expect(await bad((s) => (s.getCell('E10').value = '-1'))).toContain('malformed-metadata'); // negative Quantity
		expect(await bad((s) => (s.getCell('F10').value = '1e3'))).toContain('malformed-metadata'); // not plain decimal
		expect(await bad((s) => (s.getCell('C11').value = s.getCell('C10').value))).toContain('malformed-metadata'); // duplicate id
		expect(await bad((s) => (s.getCell('B11').value = s.getCell('B10').value))).toContain('malformed-metadata'); // duplicate Code
	});

	it('reports rows that were moved or sorted instead of attaching identities to different rows', async () => {
		const workbook = await exported();
		const sheet = workbook.getWorksheet(BUDGET_SHEET)!;
		// Swap the Hall and Deposit rows, Codes and all, as a sort would.
		const hall = sheet.getRow(3).values as unknown[];
		sheet.getRow(3).values = sheet.getRow(4).values as never;
		sheet.getRow(4).values = hall as never;

		const result = decodeBudgetWorkbook(workbook);
		expect(codesOf(result)).toContain('inconsistent-association');
		expect(result.ok).toBe(false);
	});

	it('reports a row whose Code was changed to another row\'s Code', async () => {
		const workbook = await exported();
		workbook.getWorksheet(BUDGET_SHEET)!.getCell('A5').value = '1.1'; // Music now claims to be 1.1
		expect(codesOf(decodeBudgetWorkbook(workbook))).toEqual(expect.arrayContaining(['inconsistent-association', 'duplicate-code']));
	});

	it('reports saved parents that disagree with the visible hierarchy', async () => {
		const workbook = await exported();
		workbook.getWorksheet(METADATA_SHEET)!.getCell('D11').value = uuid(4); // 1.2 saved under Music, but its Code says 1
		expect(codesOf(decodeBudgetWorkbook(workbook))).toEqual(['inconsistent-association']);
	});

	it('reports a visible parent row that is no longer the saved parent', async () => {
		const workbook = await exported();
		workbook.getWorksheet(BUDGET_SHEET)!.getCell('A2').value = '9'; // the Group row lost its identity: its children are orphaned
		const found = codesOf(decodeBudgetWorkbook(workbook));
		expect(found).toContain('inconsistent-association');
	});

	it('reports a missing Budget sheet and unreadable values', async () => {
		const noSheet = await exported();
		noSheet.removeWorksheet(noSheet.getWorksheet(BUDGET_SHEET)!.id);
		expect(codesOf(decodeBudgetWorkbook(noSheet))).toEqual(['missing-budget-sheet']);

		const bad = await exported(sample(), (row, item) => {
			if (item.id === uuid(2)) row.Quantity = 'lots';
			if (item.id === uuid(4)) row['Unit price'] = null;
		});
		const result = decodeBudgetWorkbook(bad);
		expect(codesOf(result)).toEqual(['invalid-value', 'invalid-value']);
		expect(issues(result).map((i) => i.row)).toEqual([3, 5]);
	});

	it('changes nothing it reads: the workbook, the Budget and the Items are the same after decoding', async () => {
		const workbook = await exported();
		const before = JSON.stringify([workbook.getWorksheet(BUDGET_SHEET)!.getSheetValues(), workbook.getWorksheet(METADATA_SHEET)!.getSheetValues()]);
		const items = sample();
		Object.freeze(items);
		items.forEach(Object.freeze);

		decodeBudgetWorkbook(workbook);
		readMetadata(workbook);
		workbook.getWorksheet(METADATA_SHEET)!.getCell('B1').value = '2';
		decodeBudgetWorkbook(workbook); // an error path too

		workbook.getWorksheet(METADATA_SHEET)!.getCell('B1').value = '1';
		expect(JSON.stringify([workbook.getWorksheet(BUDGET_SHEET)!.getSheetValues(), workbook.getWorksheet(METADATA_SHEET)!.getSheetValues()])).toBe(before);
		expect(items).toEqual(sample());
	});
});
