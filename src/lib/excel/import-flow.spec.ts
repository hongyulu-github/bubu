import { describe, expect, it } from 'vitest';
import { createBudget, createItem, type Item } from '../budget/model';
import { exportBudget } from './export-budget';
import { buildImport, describeLocation, needsFor, stageWorkbook, type Staged } from './import-flow';
import { createTemplate } from './template';
import { createWorkbook, writeWorkbook } from './workbook';

const bid = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const budget = () => createBudget({ id: bid, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T00:00:00.000Z') });
const make = (n: number, parent: number | null, sortIndex: number, extra: Partial<Item> = {}) =>
	createItem({ id: uuid(n), budgetId: bid, parentId: parent === null ? null : uuid(parent), sortIndex, description: `Item ${n}`, ...extra });
const items = () => [make(1, null, 0, { quantity: '2' }), make(2, 1, 0, { unitPrice: '10', unit: 'h' }), make(3, null, 1, { unitPrice: '-5' })];
const ids = () => {
	let n = 0;
	return () => `bbbbbbbb-bbbb-4bbb-8bbb-${(++n).toString().padStart(12, '0')}`;
};

const exported = async () => {
	const result = await stageWorkbook(await (await exportBudget(budget(), items())).arrayBuffer());
	if (!result.ok) throw new Error(JSON.stringify(result.errors));
	return result.staged;
};
const plain = async (): Promise<Staged> => {
	const workbook = await createWorkbook();
	const sheet = workbook.addWorksheet('Budget');
	sheet.addRow(['Code', 'Description', 'Quantity', 'Unit', 'Unit price', 'Total']);
	sheet.addRow(['1', 'Venue', 1, null, 100, 100]);
	const result = await stageWorkbook(await (await writeWorkbook(workbook)).arrayBuffer());
	if (!result.ok) throw new Error('invalid');
	return result.staged;
};

describe('stageWorkbook', () => {
	it('stages a valid workbook with its rows and metadata', async () => {
		const staged = await exported();
		expect(staged.rows.map((r) => r.code)).toEqual(['1', '1.1', '2']);
		expect(staged.metadata?.budget).toEqual(budget());
	});

	it('stages a plain workbook with no metadata, and the empty template with no rows', async () => {
		expect((await plain()).metadata).toBeNull();
		const empty = await stageWorkbook(await (await createTemplate()).arrayBuffer());
		expect(empty).toEqual({ ok: true, staged: { rows: [], metadata: null } });
	});

	it('returns the errors of an invalid or unreadable file, not an exception', async () => {
		const bad = await stageWorkbook(new TextEncoder().encode('nope').buffer as ArrayBuffer);
		expect(!bad.ok && bad.errors.map((e) => e.code)).toEqual(['unreadable-workbook']);
	});
});

describe('needsFor', () => {
	it('asks for name and currency when there is no metadata', async () => {
		expect(needsFor(await plain(), [budget()])).toEqual({ kind: 'details' });
	});

	it('finds a saved Budget with the same id as a conflict, and nothing to ask when there is none', async () => {
		const staged = await exported();
		expect(needsFor(staged, [budget()])).toEqual({ kind: 'conflict', existing: budget() });
		expect(needsFor(staged, [])).toEqual({ kind: 'none' });
		expect(needsFor(staged, [{ ...budget(), id: '22222222-2222-4222-8222-222222222222' }])).toEqual({ kind: 'none' });
	});
});

describe('buildImport', () => {
	it('keeps the exported identities and the saved Budget document', async () => {
		const built = buildImport(await exported());
		if (!built.ok) throw new Error('failed');
		expect(built.budget).toEqual(budget());
		const byId = (list: Item[]) => [...list].sort((a, b) => a.id.localeCompare(b.id));
		expect(byId(built.items)).toEqual(byId(items()));
	});

	it('imports a copy with a new Budget id and a new id for every Item, all references remapped', async () => {
		const staged = await exported();
		const built = buildImport(staged, { mode: 'copy', newId: ids(), now: new Date('2026-06-01T00:00:00.000Z') });
		if (!built.ok) throw new Error('failed');

		expect(built.budget.id).not.toBe(bid);
		expect(built.budget).toMatchObject({ name: 'Wedding (copy)', currency: 'EUR', createdAt: '2026-06-01T00:00:00.000Z' });
		const originalIds = new Set(items().map((i) => i.id));
		expect(built.items.every((item) => !originalIds.has(item.id))).toBe(true);
		expect(new Set(built.items.map((i) => i.id)).size).toBe(built.items.length);
		expect(built.items.every((item) => item.budgetId === built.budget.id)).toBe(true);
		const own = new Set(built.items.map((i) => i.id));
		expect(built.items.every((item) => item.parentId === null || own.has(item.parentId))).toBe(true);
		const hall = built.items.find((i) => i.description === 'Item 2')!;
		expect(built.items.find((i) => i.id === hall.parentId)!.description).toBe('Item 1'); // the same hierarchy
		expect(hall).toMatchObject({ unitPrice: '10', unit: 'h' });
	});

	it('gives a plain workbook the name and currency, fresh identities and exactly the rows of the file', async () => {
		const built = buildImport(await plain(), { details: { name: '  Garden  ', currency: 'USD' }, newId: ids() });
		if (!built.ok) throw new Error('failed');
		expect(built.budget).toMatchObject({ name: 'Garden', currency: 'USD' }); // trimmed
		expect(built.items.map((i) => i.description)).toEqual(['Venue']); // no starter Items
		expect(built.items[0].id.startsWith('bbbbbbbb')).toBe(true);
	});

	it('needs details for a plain workbook, and rejects invalid ones', async () => {
		expect(buildImport(await plain())).toEqual({ ok: false, reason: 'budget-required' });
		expect(buildImport(await plain(), { details: { name: '', currency: 'EUR' } })).toMatchObject({ ok: false, reason: 'invalid' });
	});
});

describe('describeLocation', () => {
	it('says where an error is in Excel terms', () => {
		expect(describeLocation({ code: 'invalid-quantity', message: '', row: 3, column: 'Quantity', cell: 'C3' })).toBe('Row 3 · Quantity (C3)');
		expect(describeLocation({ code: 'duplicate-code', message: '', row: 7, column: 'Code' })).toBe('Row 7 · Code');
		expect(describeLocation({ code: 'inconsistent-association', message: '', row: 4 })).toBe('Row 4');
		expect(describeLocation({ code: 'unreadable-workbook', message: '' })).toBe('');
	});
});
