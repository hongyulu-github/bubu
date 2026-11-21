import { describe, expect, it } from 'vitest';
import { calculateBudget } from '../budget/calculate';
import { isUuid, validateBudgetData } from '../budget/validation';
import { isZero, toString } from '../budget/numbers';
import { buildItemTree, deriveCodes } from '../budget/tree';
import { createBudgetFromTemplate } from './instantiate';
import { templates } from './templates';

const input = { name: '  My plan ', currency: 'DKK' };

describe.each(templates.map((template) => [template.id, template] as const))('creating a Budget from the %s template', (_id, template) => {
	function make() {
		const result = createBudgetFromTemplate(template, input);
		if (!result.ok) throw new Error('expected a Budget');
		return result;
	}

	it('makes a valid Budget in the chosen currency with the template hierarchy', () => {
		const { budget, items } = make();
		expect(budget).toMatchObject({ name: 'My plan', currency: 'DKK' });
		expect(isUuid(budget.id)).toBe(true);
		expect(validateBudgetData(budget, items)).toEqual([]);
		expect(items).toHaveLength(template.items.length);
	});

	it('gives every Item a fresh UUID and remaps each parent reference to the new ids, keeping order and values', () => {
		const { budget, items } = make();
		const byTemplateId = new Map(template.items.map((item, i) => [item.id, items[i]]));
		for (const [i, source] of template.items.entries()) {
			const copy = items[i];
			expect(isUuid(copy.id)).toBe(true);
			expect(copy.budgetId).toBe(budget.id);
			expect(copy.parentId).toBe(source.parentId === null ? null : byTemplateId.get(source.parentId)!.id);
			expect(copy).toMatchObject({ sortIndex: source.sortIndex, description: source.description, unitPrice: source.unitPrice, quantity: source.quantity });
			expect(copy.unit).toBe(source.unit);
			expect(copy.id).not.toBe(source.id);
		}
		expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
	});

	it('produces distinct Budget and Item UUIDs on every launch', () => {
		const first = make();
		const second = make();
		expect(second.budget.id).not.toBe(first.budget.id);
		const firstIds = new Set(first.items.map((item) => item.id));
		expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
		expect(second.items.every((item) => item.budgetId === second.budget.id)).toBe(true);
	});

	it('has the template Codes and every computed Total at zero', () => {
		const { items } = make();
		const codes = deriveCodes(items);
		const templateCodes = deriveCodes(template.items.map((item) => ({ ...item, budgetId: 'x' })));
		expect(items.map((item) => codes.get(item.id))).toEqual(template.items.map((item) => templateCodes.get(item.id)));
		expect(buildItemTree(items).unreachableIds).toEqual([]);
		const { amounts, grandTotal } = calculateBudget(items);
		expect(toString(grandTotal)).toBe('0');
		for (const { total } of amounts.values()) expect(isZero(total)).toBe(true);
	});

	it('copies: editing the new Items cannot change the template or another Budget', () => {
		const before = JSON.stringify(template);
		const first = make();
		const second = make();
		first.items[0].description = 'changed';
		first.items[0].unitPrice = '999';
		expect(second.items[0].description).toBe(template.items[0].description);
		expect(JSON.stringify(template)).toBe(before);
		expect(first.items.every((item) => !Object.values(template.items).includes(item as never))).toBe(true);
	});

	it('uses the supplied id source and skips ids it already handed out', () => {
		let n = 0;
		const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', ...Array.from({ length: 60 }, (_, i) => `00000000-0000-4000-8000-${String(i + 2).padStart(12, '0')}`)];
		const result = createBudgetFromTemplate(template, input, { newId: () => ids[n++] });
		if (!result.ok) throw new Error('expected a Budget');
		expect(new Set([result.budget.id, ...result.items.map((item) => item.id)]).size).toBe(result.items.length + 1);
	});
});

describe('an invalid form', () => {
	it('creates nothing and reports the same errors as a normal Budget', () => {
		const result = createBudgetFromTemplate(templates[0], { name: ' ', currency: '' });
		expect(result).toEqual({ ok: false, errors: { name: 'Enter a name for the Budget.', currency: 'Choose a currency.' } });
	});
});
