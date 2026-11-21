import { createBudgetDocument, type BudgetFormInput, type BudgetFormErrors } from '../budget/create';
import type { Budget, Item, Uuid } from '../budget/model';
import type { BudgetTemplate } from './templates';

export interface InstantiateOptions {
	now?: Date;
	/** Id source, for deterministic tests. Ids already handed out are skipped. */
	newId?: () => Uuid;
}

export type TemplateBudgetResult = { ok: true; budget: Budget; items: Item[] } | { ok: false; errors: BudgetFormErrors };

/**
 * A new, independent Budget made from a template: the Budget is created exactly like a normal one (same validation,
 * a fresh UUID, the chosen name and currency), and its Items are copies of the template's, each with a fresh UUID and
 * its parent reference remapped to the new ids. Sort order, Descriptions, Units, Quantities and Unit prices come over
 * as they are. The template is only read: every Item is a new object, so editing the Budget can never change the
 * definition, and two Budgets made from one template share nothing.
 */
export function createBudgetFromTemplate(
	template: BudgetTemplate,
	input: BudgetFormInput,
	{ now = new Date(), newId = () => crypto.randomUUID() }: InstantiateOptions = {}
): TemplateBudgetResult {
	const taken = new Set<Uuid>();
	const freshId = (): Uuid => {
		let id = newId();
		while (taken.has(id)) id = newId();
		taken.add(id);
		return id;
	};

	const created = createBudgetDocument(input, { id: freshId(), now });
	if (!created.ok) return created;

	const ids = new Map<string, Uuid>(template.items.map((item) => [item.id, freshId()]));
	const items = template.items.map(({ id, parentId, ...rest }): Item => ({
		...rest,
		id: ids.get(id)!,
		budgetId: created.budget.id,
		parentId: parentId === null ? null : ids.get(parentId)!
	}));
	return { ok: true, budget: created.budget, items };
}
