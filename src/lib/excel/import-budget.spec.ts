import { describe, expect, it } from 'vitest';
import { calculateBudget } from '../budget/calculate';
import { createBudget, createItem, type Item } from '../budget/model';
import { toString } from '../budget/numbers';
import { buildItemTree } from '../budget/tree';
import { validateItems } from '../budget/validation';
import { exportBudget } from './export-budget';
import { buildBudgetItems, type ImportInput } from './import-budget';
import { validateBudgetWorkbook, type ValidatedRow } from './validate';
import { createWorkbook, readWorkbook } from './workbook';

const NEW = { name: 'Imported', currency: 'EUR' };
const ids = () => {
	let n = 0;
	return () => `aaaaaaaa-aaaa-4aaa-8aaa-${(++n).toString().padStart(12, '0')}`;
};

let rowNumber = 2;
const row = (code: string, extra: Partial<ValidatedRow> = {}): ValidatedRow => ({
	row: rowNumber++,
	code,
	parentCode: code.includes('.') ? code.slice(0, code.lastIndexOf('.')) : null,
	kind: 'line',
	description: `Item ${code}`,
	quantity: '1',
	unitPrice: '0',
	...extra
});
const rowsOf = (...codes: (string | [string, Partial<ValidatedRow>])[]) => {
	rowNumber = 2;
	return codes.map((entry) => (typeof entry === 'string' ? row(entry) : row(entry[0], entry[1])));
};
const build = (input: Partial<ImportInput> & Pick<ImportInput, 'rows'>) => {
	const result = buildBudgetItems({ metadata: null, budget: NEW, newId: ids(), ...input });
	if (!result.ok) throw new Error(JSON.stringify(result));
	return result;
};
const byDescription = (items: readonly Item[], description: string) => items.find((item) => item.description === description)!;

describe('hierarchy', () => {
	it('rebuilds multiple roots, nesting of any depth and sibling order into valid flat parent links', () => {
		const { items, budget } = build({ rows: rowsOf('1', '1.1', '1.1.1', '1.1.1.1', '1.1.1.1.1', '1.2', '2', '2.1', '3') });

		expect(items.map((item) => item.description)).toEqual(['Item 1', 'Item 1.1', 'Item 1.1.1', 'Item 1.1.1.1', 'Item 1.1.1.1.1', 'Item 1.2', 'Item 2', 'Item 2.1', 'Item 3']);
		expect(validateItems(budget.id, items)).toEqual([]);
		const parent = (description: string) => items.find((i) => i.id === byDescription(items, description).parentId)?.description ?? null;
		expect([parent('Item 1'), parent('Item 1.1'), parent('Item 1.1.1.1.1'), parent('Item 1.2'), parent('Item 2.1'), parent('Item 3')]).toEqual([null, 'Item 1', 'Item 1.1.1.1', 'Item 1', 'Item 2', null]);
		expect(buildItemTree(items).unreachableIds).toEqual([]);
	});

	it('orders siblings by their Code as numbers, whatever order the rows come in', () => {
		const { items } = build({ rows: rowsOf('10', '2', '1', '2.10', '2.2', '2.1', '1.1') });
		const tree = buildItemTree(items);
		expect(tree.ordered.map((node) => node.item.description)).toEqual(['Item 1', 'Item 1.1', 'Item 2', 'Item 2.1', 'Item 2.2', 'Item 2.10', 'Item 10']);
		expect(tree.ordered.map((node) => node.code)).toEqual(['1', '1.1', '2', '2.1', '2.2', '2.3', '3']); // Codes are derived again, and close the gaps
	});

	it('derives contiguous sortIndex values per parent and never stores the Code', () => {
		const { items } = build({ rows: rowsOf('5', '9', '9.4', '9.8', '20') });
		expect(items.filter((i) => i.parentId === null).map((i) => i.sortIndex)).toEqual([0, 1, 2]);
		expect(items.filter((i) => i.parentId === byDescription(items, 'Item 9').id).map((i) => i.sortIndex)).toEqual([0, 1]);
		for (const item of items) expect(Object.keys(item)).not.toContain('code');
		expect(items.every((item) => Object.keys(item).every((key) => ['id', 'budgetId', 'parentId', 'sortIndex', 'description', 'unitPrice', 'quantity', 'unit'].includes(key)))).toBe(true);
	});

	it('gives a deep and wide hierarchy unique ids that every parent link points at', () => {
		const codes = ['1', ...Array.from({ length: 40 }, (_, i) => `1.${i + 1}`), ...Array.from({ length: 40 }, (_, i) => `1.1.${i + 1}`)];
		const { items, budget } = build({ rows: rowsOf(...codes) });
		const all = new Set(items.map((i) => i.id));
		expect(all.size).toBe(items.length);
		expect(items.every((i) => i.parentId === null || all.has(i.parentId))).toBe(true);
		expect(items.every((i) => i.budgetId === budget.id)).toBe(true);
		expect(validateItems(budget.id, items)).toEqual([]);
	});

	it('builds an empty Budget from no rows', () => {
		const { items, totals } = build({ rows: [] });
		expect(items).toEqual([]);
		expect(toString(totals.grandTotal)).toBe('0');
	});
});

describe('without metadata', () => {
	it('makes a new Budget from the name and currency, with fresh consistent identities', () => {
		const { budget, items } = build({ rows: rowsOf('1', '1.1'), now: new Date('2026-05-06T07:08:09.000Z') });
		expect(budget).toMatchObject({ name: 'Imported', currency: 'EUR', createdAt: '2026-05-06T07:08:09.000Z', updatedAt: '2026-05-06T07:08:09.000Z' });
		expect(items.map((i) => i.id)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003']); // the Budget took the first
		expect(budget.id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
		expect(items[1].parentId).toBe(items[0].id);
	});

	it('uses real random UUIDs by default, different each time', () => {
		const a = buildBudgetItems({ rows: rowsOf('1'), metadata: null, budget: NEW });
		const b = buildBudgetItems({ rows: rowsOf('1'), metadata: null, budget: NEW });
		if (!a.ok || !b.ok) throw new Error('failed');
		expect(a.items[0].id).not.toBe(b.items[0].id);
		expect(a.budget.id).not.toBe(b.budget.id);
		expect(a.items[0].id).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('needs a name and currency when there is no metadata to take them from', () => {
		expect(buildBudgetItems({ rows: rowsOf('1'), metadata: null })).toEqual({ ok: false, reason: 'budget-required' });
	});

	it('refuses a Budget that is not valid, with the reasons', () => {
		const result = buildBudgetItems({ rows: rowsOf('1'), metadata: null, budget: { name: '   ', currency: 'euro' }, newId: ids() });
		expect(result.ok).toBe(false);
		expect(!result.ok && result.reason === 'invalid' && result.issues.map((i) => i.code).sort()).toEqual(['invalid-currency', 'invalid-name']);
	});
});

describe('with metadata (a real export, through the file)', () => {
	const bid = '11111111-1111-4111-8111-111111111111';
	const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
	const make = (n: number, parent: number | null, sortIndex: number, extra: Partial<Item> = {}) =>
		createItem({ id: uuid(n), budgetId: bid, parentId: parent === null ? null : uuid(parent), sortIndex, description: `Item ${n}`, ...extra });
	const budget = () => createBudget({ id: bid, name: 'Wedding', currency: 'EUR', now: new Date('2026-02-01T10:20:30.456Z') });
	// 1 Venue (Group x2.5) > 1.1 Hall (19.990 x 3 days), 1.2 Deposit (-0.1000000000000000055511151231257827); 2 Music; 3 Discounts (Group x3) > -10, -5.5 x 2
	const original = (): Item[] => [
		make(1, null, 0, { description: 'Venue', quantity: '2.5' }),
		make(2, 1, 0, { description: 'Hall', unitPrice: '19.990', quantity: '3', unit: 'days' }),
		make(3, 1, 1, { description: 'Deposit', unitPrice: '-0.1000000000000000055511151231257827' }),
		make(4, null, 1, { description: 'Music', unitPrice: '1200.5' }),
		make(5, null, 2, { description: 'Discounts', quantity: '3' }),
		make(6, 5, 0, { description: 'Coupon', unitPrice: '-10' }),
		make(7, 5, 1, { description: 'Voucher', unitPrice: '-5.5', quantity: '2' })
	];
	const exported = async (items = original()) => readWorkbook(await (await exportBudget(budget(), items)).arrayBuffer());
	const validated = async (workbook: Awaited<ReturnType<typeof exported>>) => {
		const result = validateBudgetWorkbook(workbook);
		if (!result.ok) throw new Error(JSON.stringify(result.errors));
		return result;
	};

	it('returns exactly the Items that were exported: identities, links, order and every editable value', async () => {
		const { rows, metadata } = await validated(await exported());
		const result = build({ rows, metadata });
		const byId = (items: Item[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
		expect(byId(result.items)).toEqual(byId(original()));
		expect(result.budget).toEqual(budget()); // id, name, currency, both timestamps
	});

	it('keeps the exact decimals, optional Units, a non-default Group Quantity and negative prices', async () => {
		const { rows, metadata } = await validated(await exported());
		const { items } = build({ rows, metadata });
		expect(byDescription(items, 'Hall')).toMatchObject({ unitPrice: '19.990', quantity: '3', unit: 'days' });
		expect(byDescription(items, 'Deposit').unitPrice).toBe('-0.1000000000000000055511151231257827');
		expect(byDescription(items, 'Venue')).toMatchObject({ quantity: '2.5', unitPrice: '0' });
		expect(byDescription(items, 'Discounts').quantity).toBe('3');
		expect(byDescription(items, 'Voucher')).toMatchObject({ unitPrice: '-5.5', quantity: '2' });
		expect(Object.keys(byDescription(items, 'Music'))).not.toContain('unit'); // absent stays absent
	});

	it('recomputes every derived value with the shared engine: Group prices, Totals and the grand total', async () => {
		const { rows, metadata } = await validated(await exported());
		const { items, totals } = build({ rows, metadata });
		const expected = calculateBudget(original());
		expect(toString(totals.grandTotal)).toBe(toString(expected.grandTotal));
		for (const item of original()) {
			expect(toString(totals.amounts.get(item.id)!.total)).toBe(toString(expected.amounts.get(item.id)!.total));
			expect(toString(totals.amounts.get(item.id)!.unitPrice)).toBe(toString(expected.amounts.get(item.id)!.unitPrice));
		}
		expect(toString(totals.amounts.get(uuid(5))!.total)).toBe('-63.0'); // Discounts: (-10 + -5.5 x 2) x 3, a negative roll-up
		expect(items.length).toBe(7);
	});

	it('does not trust the visible derived cells: a tampered Total or Group price changes nothing', async () => {
		const workbook = await exported();
		const sheet = workbook.getWorksheet('Budget')!;
		sheet.getCell('F2').value = 999999; // Grand total
		sheet.getCell('E3').value = 123456; // Venue's calculated Unit price
		sheet.getCell('F3').value = 888888;
		const { rows, metadata } = await validated(workbook);
		const { totals, items } = build({ rows, metadata });
		expect(toString(totals.grandTotal)).toBe(toString(calculateBudget(original()).grandTotal));
		expect(byDescription(items, 'Venue').unitPrice).toBe('0');
	});

	it('takes visible edits as the new values, keeping identities, and fresh ids for rows added in Excel', async () => {
		const workbook = await exported();
		const sheet = workbook.getWorksheet('Budget')!;
		sheet.getCell('C4').value = 5; // Hall's Quantity
		sheet.getCell('B4').value = 'Hall (renamed)';
		sheet.addRow(['4', 'Photographer', 1, 'session', 300, 300]);
		const { rows, metadata } = await validated(workbook);
		const { items } = build({ rows, metadata, newId: ids() });

		expect(byDescription(items, 'Hall (renamed)')).toMatchObject({ id: uuid(2), quantity: '5', unitPrice: '19.990' });
		const added = byDescription(items, 'Photographer');
		expect(added).toMatchObject({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', unit: 'session', unitPrice: '300', parentId: null });
		expect(items.map((i) => i.id)).toContain(uuid(1)); // the rest keep theirs
		expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
	});

	it('leaves out a row deleted in Excel, and never reuses a saved id for a new row', async () => {
		const workbook = await exported();
		workbook.getWorksheet('Budget')!.spliceRows(9, 1); // the last row, "3.2 Voucher": nothing below it moves
		workbook.getWorksheet('Budget')!.addRow(['9', 'New', 1, null, 1, 1]);
		const { rows, metadata } = await validated(workbook);
		const collide = [uuid(4), uuid(4), 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001']; // first answers are saved ids
		let n = 0;
		const { items } = build({ rows, metadata, newId: () => collide[n++] ?? 'cccccccc-cccc-4ccc-8ccc-000000000001' });
		expect(items.some((i) => i.description === 'Voucher')).toBe(false);
		expect(byDescription(items, 'New').id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-000000000001');
	});

	it('works on a workbook whose metadata was removed: a plain import with fresh identities', async () => {
		const workbook = await exported();
		workbook.removeWorksheet(workbook.getWorksheet('BuBu metadata')!.id);
		const { rows, metadata } = await validated(workbook);
		expect(metadata).toBeNull();
		const { items, budget } = build({ rows, metadata });
		expect(budget.name).toBe('Imported');
		expect(items.some((i) => i.id === uuid(1))).toBe(false);
		expect(items.map((i) => i.description).sort()).toEqual(original().map((i) => i.description).sort());
	});
});

describe('purity', () => {
	it('changes nothing it is given and gives the same result for the same input', () => {
		const rows = rowsOf('1', ['1.1', { quantity: '2.50', unitPrice: '-3.10', unit: 'h' }], '2');
		rows.forEach(Object.freeze);
		Object.freeze(rows);
		const snapshot = structuredClone(rows);
		const a = build({ rows, newId: ids(), now: new Date('2026-01-01T00:00:00Z') });
		const b = build({ rows, newId: ids(), now: new Date('2026-01-01T00:00:00Z') });
		expect(rows).toEqual(snapshot);
		expect(a.items).toEqual(b.items);
		expect(a.budget).toEqual(b.budget);
	});

	it('returns new objects: mutating the result never reaches the input metadata', async () => {
		const metadata = {
			version: 1,
			budget: createBudget({ id: '11111111-1111-4111-8111-111111111111', name: 'Saved', currency: 'EUR' }),
			items: []
		};
		const { budget } = build({ rows: [], metadata });
		budget.name = 'changed';
		expect(metadata.budget.name).toBe('Saved');
	});

	it('touches no browser storage', () => {
		const touched: string[] = [];
		const storage = new Proxy({}, { get: (_t, key) => { touched.push(String(key)); return undefined; } });
		const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
		Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
		try {
			build({ rows: rowsOf('1', '1.1') });
		} finally {
			if (original) Object.defineProperty(globalThis, 'localStorage', original);
			else delete (globalThis as { localStorage?: unknown }).localStorage;
		}
		expect(touched).toEqual([]);
	});
});
