import { describe, expect, it } from 'vitest';
import {
	DEFAULT_QUANTITY,
	DEFAULT_UNIT_PRICE,
	createBudget,
	createItem,
	deriveItemKinds,
	type Item
} from './model';
import { isUuid, validateBudget, validateBudgetData, validateItems } from './validation';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BUDGET_ID = '22222222-2222-4222-8222-222222222222';

let counter = 0;
function id(): string {
	counter += 1;
	return `00000000-0000-4000-8000-${counter.toString().padStart(12, '0')}`;
}

function item(overrides: Partial<Item> = {}): Item {
	return createItem({ budgetId: BUDGET_ID, id: id(), ...overrides });
}

function budget() {
	return createBudget({ id: BUDGET_ID, name: 'Wedding', currency: 'EUR', now: new Date('2026-01-02T03:04:05Z') });
}

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe('createBudget', () => {
	it('creates a valid empty Budget with matching timestamps', () => {
		const result = budget();
		expect(result).toEqual({
			id: BUDGET_ID,
			name: 'Wedding',
			currency: 'EUR',
			createdAt: '2026-01-02T03:04:05.000Z',
			updatedAt: '2026-01-02T03:04:05.000Z'
		});
		expect(validateBudgetData(result, [])).toEqual([]);
	});

	it('generates a UUID when none is given', () => {
		const generated = createBudget({ name: 'A', currency: 'USD' });
		expect(isUuid(generated.id)).toBe(true);
		expect(validateBudget(generated)).toEqual([]);
	});

	it('survives a JSON round trip unchanged', () => {
		const original = budget();
		expect(JSON.parse(JSON.stringify(original))).toEqual(original);
	});
});

describe('createItem', () => {
	it('defaults to Quantity 1, Unit price 0, no Unit and top level', () => {
		const created = createItem({ budgetId: BUDGET_ID });
		expect(created.quantity).toBe(DEFAULT_QUANTITY);
		expect(created.unitPrice).toBe(DEFAULT_UNIT_PRICE);
		expect(DEFAULT_QUANTITY).toBe('1');
		expect(DEFAULT_UNIT_PRICE).toBe('0');
		expect(created.parentId).toBeNull();
		expect(created.description).toBe('');
		expect('unit' in created).toBe(false);
		expect(isUuid(created.id)).toBe(true);
		expect(validateItems(BUDGET_ID, [created])).toEqual([]);
	});

	it('keeps an optional Unit and explicit values', () => {
		const created = item({ unit: 'hours', quantity: '2.5', unitPrice: '-10.50', sortIndex: 3 });
		expect(created).toMatchObject({ unit: 'hours', quantity: '2.5', unitPrice: '-10.50', sortIndex: 3 });
		expect(validateItems(BUDGET_ID, [created])).toEqual([]);
	});

	it('does not persist Code, Totals or a Group flag', () => {
		expect(Object.keys(createItem({ budgetId: BUDGET_ID, id: id() })).sort()).toEqual(
			['budgetId', 'description', 'id', 'parentId', 'quantity', 'sortIndex', 'unitPrice'].sort()
		);
	});
});

describe('deriveItemKinds', () => {
	it('derives Group and Line from the presence of children only', () => {
		const root = item();
		const child = item({ parentId: root.id });
		const grandchild = item({ parentId: child.id });
		const lonely = item();

		const kinds = deriveItemKinds([root, child, grandchild, lonely]);
		expect(kinds.get(root.id)).toBe('group');
		expect(kinds.get(child.id)).toBe('group');
		expect(kinds.get(grandchild.id)).toBe('line');
		expect(kinds.get(lonely.id)).toBe('line');
	});

	it('turns a Group back into a Line when its last child is gone', () => {
		const parent = item();
		const child = item({ parentId: parent.id });
		expect(deriveItemKinds([parent, child]).get(parent.id)).toBe('group');
		expect(deriveItemKinds([parent]).get(parent.id)).toBe('line');
	});
});

describe('valid data', () => {
	it('accepts an empty Item array', () => {
		expect(validateItems(BUDGET_ID, [])).toEqual([]);
	});

	it('accepts nested Items', () => {
		const a = item();
		const b = item({ parentId: a.id });
		const c = item({ parentId: a.id, sortIndex: 1 });
		const d = item({ parentId: b.id });
		expect(validateBudgetData(budget(), [d, c, b, a])).toEqual([]);
	});

	it('supports arbitrary depth without a limit', () => {
		const items: Item[] = [];
		let parentId: string | null = null;
		for (let depth = 0; depth < 20_000; depth++) {
			const next = item({ parentId });
			items.push(next);
			parentId = next.id;
		}
		expect(validateItems(BUDGET_ID, items)).toEqual([]);
		const kinds = deriveItemKinds(items);
		expect(kinds.get(items[0].id)).toBe('group');
		expect(kinds.get(items.at(-1)!.id)).toBe('line');
	});
});

describe('reference validation', () => {
	it('detects duplicate ids', () => {
		const a = item();
		const duplicate = { ...item(), id: a.id };
		const issues = validateItems(BUDGET_ID, [a, duplicate]);
		expect(issues).toEqual([expect.objectContaining({ code: 'duplicate-id', path: 'items[1].id' })]);
	});

	it('detects dangling parents', () => {
		const orphan = item({ parentId: id() });
		expect(validateItems(BUDGET_ID, [orphan])).toEqual([
			expect.objectContaining({ code: 'dangling-parent', path: 'items[0].parentId' })
		]);
	});

	it('detects Items that belong to another Budget', () => {
		const foreign = item({ budgetId: OTHER_BUDGET_ID });
		expect(codes(validateItems(BUDGET_ID, [foreign]))).toEqual(['wrong-budget']);
	});

	it('detects a parent from another Budget (cross-Budget parent)', () => {
		const parent = item({ budgetId: OTHER_BUDGET_ID });
		const child = item({ parentId: parent.id });
		const issues = validateItems(BUDGET_ID, [parent, child]);
		expect(codes(issues)).toContain('cross-budget-parent');
		expect(issues).toContainEqual(expect.objectContaining({ code: 'cross-budget-parent', path: 'items[1].parentId' }));
	});

	it('detects an Item that is its own parent', () => {
		const selfParent = item();
		selfParent.parentId = selfParent.id;
		expect(codes(validateItems(BUDGET_ID, [selfParent]))).toEqual(['cycle']);
	});

	it('detects a two-Item cycle and reports it once', () => {
		const a = item();
		const b = item({ parentId: a.id });
		a.parentId = b.id;
		const issues = validateItems(BUDGET_ID, [a, b]);
		expect(codes(issues)).toEqual(['cycle']);
		expect(issues[0].message).toContain(a.id);
		expect(issues[0].message).toContain(b.id);
	});

	it('detects a cycle that other Items hang from, and a long cycle, without overflowing the stack', () => {
		const ring: Item[] = Array.from({ length: 5_000 }, () => item());
		ring.forEach((member, index) => (member.parentId = ring[(index + 1) % ring.length].id));
		const tail = item({ parentId: ring[0].id });
		const issues = validateItems(BUDGET_ID, [tail, ...ring]);
		expect(codes(issues)).toEqual(['cycle']);
	});

	it('reports two separate cycles separately', () => {
		const a = item();
		const b = item({ parentId: a.id });
		a.parentId = b.id;
		const c = item();
		c.parentId = c.id;
		expect(codes(validateItems(BUDGET_ID, [a, b, c]))).toEqual(['cycle', 'cycle']);
	});

	it('does not flag a deep valid chain next to a broken one as a cycle', () => {
		const root = item();
		const child = item({ parentId: root.id });
		const orphan = item({ parentId: id() });
		expect(codes(validateItems(BUDGET_ID, [root, child, orphan]))).toEqual(['dangling-parent']);
	});
});

describe('structural and numeric validation', () => {
	it('rejects non-array Items and non-object entries', () => {
		expect(codes(validateItems(BUDGET_ID, {}))).toEqual(['invalid-type']);
		expect(codes(validateItems(BUDGET_ID, [null, 5, 'x', []]))).toEqual([
			'invalid-type',
			'invalid-type',
			'invalid-type',
			'invalid-type'
		]);
	});

	it('rejects invalid ids', () => {
		const bad = { ...item(), id: 'not-a-uuid', budgetId: 'nope', parentId: 7 };
		expect(codes(validateItems(BUDGET_ID, [bad]))).toEqual(['invalid-id', 'invalid-id', 'invalid-id']);
	});

	it('rejects invalid numeric contracts', () => {
		const cases: [Partial<Record<keyof Item, unknown>>, string][] = [
			[{ quantity: '-1' }, 'items[0].quantity'],
			[{ quantity: '' }, 'items[0].quantity'],
			[{ quantity: 'abc' }, 'items[0].quantity'],
			[{ quantity: 1 }, 'items[0].quantity'],
			[{ unitPrice: '' }, 'items[0].unitPrice'],
			[{ unitPrice: 'Infinity' }, 'items[0].unitPrice'],
			[{ unitPrice: 12 }, 'items[0].unitPrice'],
			[{ unitPrice: undefined }, 'items[0].unitPrice']
		];
		for (const [override, path] of cases) {
			const issues = validateItems(BUDGET_ID, [{ ...item(), ...override }]);
			expect(issues, JSON.stringify(override)).toEqual([expect.objectContaining({ code: 'invalid-number', path })]);
		}
	});

	it('accepts a negative Unit price, a zero or fractional Quantity, and precise decimals', () => {
		for (const [quantity, unitPrice] of [
			['0', '-0.5'],
			['0.125', '-1200.50'],
			['3', '0.1000000000000000055511151231257827']
		]) {
			expect(validateItems(BUDGET_ID, [item({ quantity, unitPrice })])).toEqual([]);
		}
	});

	it('rejects a bad sortIndex, description and unit', () => {
		expect(codes(validateItems(BUDGET_ID, [{ ...item(), sortIndex: Number.NaN }]))).toEqual(['invalid-sort-index']);
		expect(codes(validateItems(BUDGET_ID, [{ ...item(), sortIndex: '1' }]))).toEqual(['invalid-sort-index']);
		expect(codes(validateItems(BUDGET_ID, [{ ...item(), description: null }]))).toEqual(['invalid-type']);
		expect(codes(validateItems(BUDGET_ID, [{ ...item(), unit: 5 }]))).toEqual(['invalid-type']);
	});

	it('validates Budget fields', () => {
		const good = budget();
		expect(codes(validateBudget({ ...good, id: 'x' }))).toEqual(['invalid-id']);
		expect(codes(validateBudget({ ...good, name: '  ' }))).toEqual(['invalid-name']);
		expect(codes(validateBudget({ ...good, currency: 'eur' }))).toEqual(['invalid-currency']);
		expect(codes(validateBudget({ ...good, currency: 'EURO' }))).toEqual(['invalid-currency']);
		expect(codes(validateBudget({ ...good, createdAt: 'yesterday' }))).toEqual(['invalid-timestamp']);
		expect(codes(validateBudget({ ...good, updatedAt: '2026-13-45T00:00:00Z' }))).toEqual(['invalid-timestamp']);
		expect(codes(validateBudget(null))).toEqual(['invalid-type']);
	});

	it('still checks Item references when the Budget id is invalid', () => {
		const a = item();
		const b = item({ parentId: a.id });
		a.parentId = b.id;
		const issues = validateBudgetData({ ...budget(), id: 'bad' }, [a, b]);
		expect(codes(issues)).toEqual(['invalid-id', 'cycle']);
	});
});
