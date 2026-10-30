import { describe, expect, it } from 'vitest';
import { applyFieldEdit, canEditField, type EditableField } from './edit';
import { createItem, deriveItemKinds, type Item } from './model';
import { calculateBudget } from './calculate';
import { toString } from './numbers';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

// 1 Group (qty 2) with children 2 Line (10 x 1, unit "pcs") and 3 Line (5 x 2); 4 top-level Line.
function fixture(): Item[] {
	const make = (n: number, parent: number | null, unitPrice: string, quantity: string, extra: Partial<Item> = {}) =>
		createItem({ id: uuid(n), budgetId: BUDGET, parentId: parent === null ? null : uuid(parent), sortIndex: n, description: `Item ${n}`, unitPrice, quantity, ...extra });
	return [make(1, null, '999', '2'), make(2, 1, '10', '1', { unit: 'pcs' }), make(3, 1, '5', '2'), make(4, null, '7', '1')];
}

const GROUP = uuid(1);
const LINE = uuid(2);
const grand = (items: readonly Item[]) => toString(calculateBudget(items).grandTotal);

function edit(field: EditableField, text: string, id = LINE, items = fixture()) {
	return applyFieldEdit(items, id, field, text);
}

describe('field permissions', () => {
	it('allows Description, Quantity and Unit on Lines and Groups, Unit price only on Lines', () => {
		for (const field of ['description', 'quantity', 'unit'] as const) {
			expect(canEditField('line', field), `line ${field}`).toBe(true);
			expect(canEditField('group', field), `group ${field}`).toBe(true);
		}
		expect(canEditField('line', 'unitPrice')).toBe(true);
		expect(canEditField('group', 'unitPrice')).toBe(false);
	});

	it('never allows Code or Total', () => {
		for (const kind of ['line', 'group'] as const) {
			expect(canEditField(kind, 'code')).toBe(false);
			expect(canEditField(kind, 'total')).toBe(false);
			expect(canEditField(kind, 'depth')).toBe(false);
		}
	});

	it('rejects a Group Unit price edit and leaves the stored value alone', () => {
		const items = fixture();
		const result = edit('unitPrice', '1', GROUP, items);
		expect(result).toMatchObject({ ok: false, reason: 'read-only' });
		expect(items[0].unitPrice).toBe('999');
	});

	it('derives the kind from children, so a Group edit works through the same rule', () => {
		const items = fixture();
		expect(deriveItemKinds(items).get(GROUP)).toBe('group');
		expect(edit('quantity', '3', GROUP, items)).toMatchObject({ ok: true, changed: true });
		// A parentless-of-children Item is a Line again and its stored price becomes editable.
		const onlyGroup = items.filter((item) => item.parentId !== GROUP);
		expect(edit('unitPrice', '12', GROUP, onlyGroup)).toMatchObject({ ok: true, changed: true });
	});

	it('rejects an unknown Item', () => {
		expect(edit('description', 'x', uuid(99))).toMatchObject({ ok: false, reason: 'unknown-item' });
	});
});

describe('allowed fields commit correctly', () => {
	it('edits the Description (trimmed, blank allowed)', () => {
		const result = edit('description', '  Hall rental  ');
		expect(result.ok && result.items.find((i) => i.id === LINE)?.description).toBe('Hall rental');
		const blank = edit('description', '   ');
		expect(blank.ok && blank.items.find((i) => i.id === LINE)?.description).toBe('');
	});

	it('sets and clears the Unit; clearing removes the property', () => {
		const set = edit('unit', ' hours ', uuid(3));
		expect(set.ok && set.items.find((i) => i.id === uuid(3))?.unit).toBe('hours');

		const cleared = edit('unit', '  ');
		expect(cleared.ok && 'unit' in cleared.items.find((i) => i.id === LINE)!).toBe(false);
	});

	it('edits a fractional Quantity, including zero', () => {
		for (const text of ['0.5', '0', '12.125', '.5']) {
			expect(edit('quantity', text), text).toMatchObject({ ok: true, changed: true });
		}
		const result = edit('quantity', '2.50');
		expect(result.ok && result.items.find((i) => i.id === LINE)?.quantity).toBe('2.50'); // precision kept
	});

	it('edits a Line Unit price, including negative discounts', () => {
		const result = edit('unitPrice', '-12.50');
		expect(result.ok && result.items.find((i) => i.id === LINE)?.unitPrice).toBe('-12.50');
	});

	it('stores numbers as the decimal adapter string without losing digits', () => {
		const result = edit('unitPrice', '0.1000000000000000055511151231257827');
		expect(result.ok && result.items.find((i) => i.id === LINE)?.unitPrice).toBe('0.1000000000000000055511151231257827');
	});

	it('changes only the edited Item and returns a new array', () => {
		const items = fixture();
		const result = edit('description', 'Renamed', LINE, items);
		if (!result.ok) throw new Error('rejected');
		expect(result.items).not.toBe(items);
		result.items.forEach((item, i) => {
			if (item.id === LINE) expect(item).not.toBe(items[i]);
			else expect(item).toBe(items[i]); // untouched Items are the same objects
		});
		expect(result.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
	});
});

describe('invalid values', () => {
	it('rejects blank and non-numeric numbers with a message and changes nothing', () => {
		for (const field of ['quantity', 'unitPrice'] as const) {
			expect(edit(field, ''), field).toEqual({ ok: false, reason: 'invalid', message: 'Enter a number.' });
			expect(edit(field, '   ').ok).toBe(false);
			for (const text of ['abc', '1e3', '1,5', 'NaN', 'Infinity', '--1', '€5']) {
				expect(edit(field, text), `${field} ${text}`).toEqual({ ok: false, reason: 'invalid', message: 'Enter a valid number.' });
			}
		}
	});

	it('rejects a negative Quantity, on Lines and Groups', () => {
		expect(edit('quantity', '-1')).toEqual({ ok: false, reason: 'invalid', message: 'Quantity cannot be negative.' });
		expect(edit('quantity', '-0.001', GROUP)).toMatchObject({ ok: false, reason: 'invalid' });
	});

	it('does not mutate the input array or its Items, whatever the outcome', () => {
		const items = Object.freeze(fixture().map((item) => Object.freeze({ ...item })));
		expect(() => {
			edit('quantity', '9', LINE, items as Item[]);
			edit('quantity', 'abc', LINE, items as Item[]);
			edit('unit', '', LINE, items as Item[]);
			edit('unitPrice', '1', GROUP, items as Item[]);
		}).not.toThrow();
		expect(items).toEqual(fixture());
	});
});

describe('no-op edits', () => {
	it('report no change and return the very same array', () => {
		const items = fixture();
		for (const [field, text] of [['description', 'Item 2'], ['quantity', '1'], ['unitPrice', '10'], ['unit', 'pcs']] as const) {
			const result = edit(field, text, LINE, items);
			expect(result, `${field}=${text}`).toMatchObject({ ok: true, changed: false });
			expect(result.ok && result.items).toBe(items);
		}
	});

	it('treat a different spelling of the same number as a change (precision is kept)', () => {
		expect(edit('quantity', '1.0')).toMatchObject({ ok: true, changed: true });
	});
});

describe('exact roll-ups after edits', () => {
	it('refreshes totals for fractions and discounts', () => {
		const items = fixture(); // group 2 x (10 + 10) + 7 = 47
		expect(grand(items)).toBe('47');

		const fraction = edit('quantity', '0.5', GROUP, items);
		if (!fraction.ok) throw new Error('rejected');
		expect(grand(fraction.items)).toBe('17.0'); // 0.5 x 20 + 7 (scale is kept)

		const discount = edit('unitPrice', '-100', LINE, items);
		if (!discount.ok) throw new Error('rejected');
		expect(grand(discount.items)).toBe('-173'); // 2 x (-100 + 5 x 2) + 7
	});
});
