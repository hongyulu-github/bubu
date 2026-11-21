import { describe, expect, it } from 'vitest';
import { calculateBudget } from '../budget/calculate';
import { createItem, deriveItemKinds } from '../budget/model';
import { isZero, toString } from '../budget/numbers';
import { buildItemTree, deriveCodes } from '../budget/tree';
import { validateItems } from '../budget/validation';
import { copyTemplateItems, homeRenovationTemplate, templates, travelTemplate, weddingTemplate, type BudgetTemplate } from './templates';

const BUDGET_ID = '11111111-1111-4111-8111-111111111111';

/** What opening a template will do (UUID remapping is a later ticket): the same Items with UUIDs and a Budget. */
function asBudgetItems(template: BudgetTemplate) {
	const uuids = new Map(template.items.map((item, i) => [item.id, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
	return template.items.map(({ id, parentId, ...rest }) =>
		createItem({ ...rest, id: uuids.get(id)!, parentId: parentId === null ? null : uuids.get(parentId)!, budgetId: BUDGET_ID })
	);
}

describe.each(templates.map((template) => [template.id, template] as const))('%s template', (_name, template) => {
	it('has unique template identifiers', () => {
		const ids = template.items.map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('names only parents that exist in the template, and every Item is reachable from the top level', () => {
		const ids = new Set(template.items.map((item) => item.id));
		for (const item of template.items) expect(item.parentId === null || ids.has(item.parentId)).toBe(true);
		const tree = buildItemTree(asBudgetItems(template));
		expect(tree.unreachableIds).toEqual([]);
		expect(tree.ordered).toHaveLength(template.items.length);
	});

	it('numbers siblings 0, 1, 2... so the order is explicit', () => {
		const parents = new Set(template.items.map((item) => item.parentId));
		for (const parentId of parents) {
			const indexes = template.items.filter((item) => item.parentId === parentId).map((item) => item.sortIndex);
			expect(indexes).toEqual(indexes.map((_, i) => i));
		}
	});

	it('is small, has real nesting, and gives every Item a Description and every Line a Unit', () => {
		expect(template.items.length).toBeGreaterThanOrEqual(10);
		expect(template.items.length).toBeLessThanOrEqual(30);
		const items = asBudgetItems(template);
		const kinds = deriveItemKinds(items);
		const tree = buildItemTree(items);
		expect(Math.max(...tree.ordered.map((node) => node.depth))).toBeGreaterThanOrEqual(2);
		for (const item of items) {
			expect(item.description.trim()).not.toBe('');
			if (kinds.get(item.id) === 'line') expect(item.unit?.trim()).toBeTruthy();
			else expect(item.unit).toBeUndefined();
		}
	});

	it('starts every Item at Unit price 0 and Quantity 1', () => {
		for (const item of template.items) {
			expect(item.unitPrice).toBe('0');
			expect(item.quantity).toBe('1');
		}
	});

	it('stores no Codes or Totals, only the Item fields', () => {
		const allowed = ['id', 'parentId', 'sortIndex', 'description', 'unitPrice', 'quantity', 'unit'];
		for (const item of template.items) expect(Object.keys(item).every((key) => allowed.includes(key))).toBe(true);
	});

	it('is valid flat Budget data, with derived Codes and every computed Total zero', () => {
		const items = asBudgetItems(template);
		expect(validateItems(BUDGET_ID, items)).toEqual([]);
		const codes = deriveCodes(items);
		expect(codes.size).toBe(items.length);
		const { amounts, grandTotal } = calculateBudget(items);
		expect(toString(grandTotal)).toBe('0');
		for (const { total } of amounts.values()) expect(isZero(total)).toBe(true);
	});

	it('cannot be changed, and independent copies do not affect it or each other', () => {
		expect(Object.isFrozen(template)).toBe(true);
		expect(Object.isFrozen(template.items)).toBe(true);
		expect(template.items.every((item) => Object.isFrozen(item))).toBe(true);
		expect(() => {
			(template.items[0] as { description: string }).description = 'changed';
		}).toThrow(TypeError);

		const snapshot = JSON.stringify(template);
		const first = copyTemplateItems(template);
		const second = copyTemplateItems(template);
		first[0].description = 'edited in the first Budget';
		first.pop();
		expect(second[0].description).toBe(template.items[0].description);
		expect(second).toHaveLength(template.items.length);
		expect(JSON.stringify(template)).toBe(snapshot);
	});
});

describe('the template list', () => {
	it('offers the Wedding, Home renovation and Travel templates, with unique ids', () => {
		expect(templates).toEqual([weddingTemplate, homeRenovationTemplate, travelTemplate]);
		expect(new Set(templates.map((template) => template.id)).size).toBe(templates.length);
		expect(Object.isFrozen(templates)).toBe(true);
	});

	it('gives every template the same number of Items and Groups, so the showcases are equally tall', () => {
		const shape = (template: BudgetTemplate) => [template.items.length, new Set(template.items.map((item) => item.parentId).filter((id) => id !== null)).size];
		expect(templates.map(shape)).toEqual(templates.map(() => shape(homeRenovationTemplate)));
	});

	it('embeds no currency', () => {
		expect(JSON.stringify(templates)).not.toMatch(/currency/i);
	});
});
