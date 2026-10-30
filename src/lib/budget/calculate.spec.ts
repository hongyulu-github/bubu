import { describe, expect, it } from 'vitest';
import { calculateBudget, calculateTotals } from './calculate';
import { createItem, type Item } from './model';
import { toString } from './numbers';
import { buildItemTree } from './tree';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
}

function line(n: number, parent: number | null, unitPrice: string, quantity = '1', sortIndex = n): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET_ID,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		unitPrice,
		quantity
	});
}

const total = (items: Item[], n: number) => toString(calculateBudget(items).amounts.get(uuid(n))!.total);
const unitPrice = (items: Item[], n: number) => toString(calculateBudget(items).amounts.get(uuid(n))!.unitPrice);
const grand = (items: Item[]) => toString(calculateBudget(items).grandTotal);

function deepFreeze<T>(value: T): T {
	if (typeof value === 'object' && value !== null) {
		Object.values(value).forEach(deepFreeze);
		Object.freeze(value);
	}
	return value;
}

describe('empty and single Items', () => {
	it('works for an empty Budget', () => {
		const result = calculateBudget([]);
		expect(toString(result.grandTotal)).toBe('0');
		expect(result.amounts.size).toBe(0);
	});

	it('multiplies a Line Unit price by its Quantity', () => {
		const items = [line(1, null, '19.99', '3')];
		expect(total(items, 1)).toBe('59.97');
		expect(unitPrice(items, 1)).toBe('19.99');
		expect(grand(items)).toBe('59.97');
	});

	it('supports fractional quantities without rounding', () => {
		const items = [line(1, null, '19.99', '0.5')];
		expect(total(items, 1)).toBe('9.995');
		expect(grand(items)).toBe('9.995');
	});

	it('avoids floating-point artifacts across Lines', () => {
		const items = [line(1, null, '0.1'), line(2, null, '0.2')];
		expect(0.1 + 0.2).not.toBe(0.3);
		expect(grand(items)).toBe('0.3');
	});

	it('handles zero Quantity and zero Unit price', () => {
		const items = [line(1, null, '50', '0'), line(2, null, '0', '9')];
		expect(total(items, 1)).toBe('0');
		expect(total(items, 2)).toBe('0');
		expect(grand(items)).toBe('0');
	});
});

describe('Groups', () => {
	it('sums direct children into the Group Unit price and multiplies by the Group Quantity', () => {
		const items = [line(1, null, '0', '2'), line(2, 1, '10', '1'), line(3, 1, '5', '2')];
		expect(unitPrice(items, 1)).toBe('20');
		expect(total(items, 1)).toBe('40');
		expect(grand(items)).toBe('40');
	});

	it('multiplies each nested Group Quantity after summing its direct children', () => {
		// Outer (x2) = Inner (x3) of [10 x1, 5 x2] + Line 7 x1
		// Inner: unit 20, total 60. Outer: unit 60 + 7 = 67, total 134.
		const items = [
			line(1, null, '0', '2'),
			line(2, 1, '0', '3'),
			line(3, 2, '10', '1'),
			line(4, 2, '5', '2'),
			line(5, 1, '7', '1')
		];
		expect(unitPrice(items, 2)).toBe('20');
		expect(total(items, 2)).toBe('60');
		expect(unitPrice(items, 1)).toBe('67');
		expect(total(items, 1)).toBe('134');
		expect(grand(items)).toBe('134');
	});

	it('uses only top-level Totals for the grand total (no double counting)', () => {
		const items = [line(1, null, '0', '1'), line(2, 1, '100'), line(3, null, '1', '1')];
		expect(grand(items)).toBe('101');
	});

	it('keeps a Group Unit price but gives a zero Total for zero Quantity', () => {
		const items = [line(1, null, '0', '0'), line(2, 1, '10'), line(3, null, '5')];
		expect(unitPrice(items, 1)).toBe('10');
		expect(total(items, 1)).toBe('0');
		expect(grand(items)).toBe('5');
	});

	it('supports fractional Group Quantity', () => {
		const items = [line(1, null, '0', '1.5'), line(2, 1, '0.1'), line(3, 1, '0.2')];
		expect(unitPrice(items, 1)).toBe('0.3');
		expect(total(items, 1)).toBe('0.45');
	});

	it('ignores a Group stored Unit price and derives Group/Line from children only', () => {
		const stored = line(1, null, '999', '2');
		const withChild = [stored, line(2, 1, '10')];
		expect(unitPrice(withChild, 1)).toBe('10');
		expect(total(withChild, 1)).toBe('20');

		// Once its last child is gone the same Item is a Line again and its stored price counts.
		expect(unitPrice([stored], 1)).toBe('999');
		expect(total([stored], 1)).toBe('1998');
	});
});

describe('negative amounts and discounts', () => {
	it('allows a negative Line Unit price', () => {
		const items = [line(1, null, '-12.50', '2')];
		expect(total(items, 1)).toBe('-25.00');
		expect(grand(items)).toBe('-25.00');
	});

	it('produces negative Group prices and Totals when discounts exceed positives', () => {
		const items = [line(1, null, '0', '2'), line(2, 1, '100'), line(3, 1, '-250')];
		expect(unitPrice(items, 1)).toBe('-150');
		expect(total(items, 1)).toBe('-300');
		expect(grand(items)).toBe('-300');
	});

	it('nets discounts against positive siblings in the grand total', () => {
		const items = [line(1, null, '500'), line(2, null, '-120.75'), line(3, null, '-0.25')];
		expect(grand(items)).toBe('379.00');
	});

	it('multiplies a negative Group Unit price through nested Quantities', () => {
		const items = [line(1, null, '0', '3'), line(2, 1, '0', '2'), line(3, 2, '-5')];
		expect(total(items, 2)).toBe('-10');
		expect(total(items, 1)).toBe('-30');
	});
});

describe('purity and input changes', () => {
	it('recomputes totals when inputs change, a move, an insert and a removal', () => {
		const base = [line(1, null, '0', '1'), line(2, 1, '10', '2'), line(3, null, '5')];
		expect(grand(base)).toBe('25');

		expect(grand(base.map((i) => (i.id === uuid(2) ? { ...i, quantity: '3' } : i)))).toBe('35');
		expect(grand(base.map((i) => (i.id === uuid(2) ? { ...i, unitPrice: '-1' } : i)))).toBe('3');
		// Move Line 2 out of the Group: the Group becomes a Line with its own stored price (0).
		expect(grand(base.map((i) => (i.id === uuid(2) ? { ...i, parentId: null } : i)))).toBe('25');
		expect(grand([...base, line(4, 3, '1', '4')])).toBe('24');
		expect(grand(base.filter((i) => i.id !== uuid(2)))).toBe('5');
	});

	it('gives the same result for any input order', () => {
		const items = [
			line(1, null, '0', '2'),
			line(2, 1, '0.1'),
			line(3, 1, '0.2', '3'),
			line(4, null, '-1')
		];
		const reversed = [...items].reverse();
		expect(grand(reversed)).toBe(grand(items));
		expect(grand(items)).toBe('0.4'); // 2 x (0.1 + 3 x 0.2) - 1
	});

	it('does not mutate Items or write computed values onto them', () => {
		const items = deepFreeze([line(1, null, '999', '2'), line(2, 1, '10', '1.5')]);
		const before = JSON.stringify(items);
		expect(() => calculateBudget(items)).not.toThrow();
		expect(JSON.stringify(items)).toBe(before);
		for (const stored of items) {
			expect(Object.keys(stored)).not.toContain('total');
		}
	});

	it('can reuse a prebuilt tree', () => {
		const items = [line(1, null, '2', '3')];
		expect(toString(calculateTotals(buildItemTree(items)).grandTotal)).toBe('6');
	});
});

describe('arbitrary depth and invalid data', () => {
	it('rolls up a deep chain exactly, beyond double precision', () => {
		// 70 nested Groups, each Quantity 2, around one Line of 7: total is 7 * 2^70.
		const depth = 70;
		const items: Item[] = [];
		for (let i = 1; i <= depth; i++) items.push(line(i, i === 1 ? null : i - 1, '0', '2'));
		items.push(line(depth + 1, depth, '7'));
		const expected = (7n << BigInt(depth)).toString();
		expect(grand(items)).toBe(expected);
		expect(Number(expected)).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
	});

	it('handles a very deep chain without recursion', () => {
		const depth = 20_000;
		const items: Item[] = [];
		for (let i = 1; i <= depth; i++) items.push(line(i, i === 1 ? null : i - 1, '0', '1'));
		items.push(line(depth + 1, depth, '7.25'));
		expect(grand(items)).toBe('7.25');
	});

	it('handles wide Groups', () => {
		const items = [line(1, null, '0', '2')];
		for (let i = 0; i < 5_000; i++) items.push(line(i + 2, 1, '0.01'));
		expect(grand(items)).toBe('100.00');
	});

	it('ignores Items that are unreachable from the top level', () => {
		const items = [line(1, null, '5'), line(2, 3, '100'), line(3, 2, '100'), line(4, 99, '100')];
		expect(grand(items)).toBe('5');
		expect(calculateBudget(items).amounts.has(uuid(2))).toBe(false);
	});

	it('throws a clear error for an unparsable stored number', () => {
		expect(() => calculateBudget([line(1, null, 'abc')])).toThrow(/invalid unitPrice/);
		expect(() => calculateBudget([line(1, null, '1', '-1')])).toThrow(/invalid quantity/);
	});
});
