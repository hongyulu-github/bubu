import type { Budget, Item } from './model';
import { parseQuantity, parseUnitPrice } from './numbers';

export type ValidationCode =
	| 'invalid-type'
	| 'invalid-id'
	| 'invalid-name'
	| 'invalid-currency'
	| 'invalid-timestamp'
	| 'invalid-sort-index'
	| 'invalid-number'
	| 'duplicate-id'
	| 'wrong-budget'
	| 'dangling-parent'
	| 'cross-budget-parent'
	| 'cycle';

export interface ValidationIssue {
	code: ValidationCode;
	/** Where the problem is, e.g. `budget.currency` or `items[3].parentId`. */
	path: string;
	message: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): boolean {
	return (
		typeof value === 'string' &&
		ISO_TIMESTAMP_PATTERN.test(value) &&
		!Number.isNaN(Date.parse(value))
	);
}

/** Structural validation of a Budget record. Accepts untrusted data. */
export function validateBudget(budget: unknown): ValidationIssue[] {
	if (!isRecord(budget)) {
		return [{ code: 'invalid-type', path: 'budget', message: 'Budget must be an object.' }];
	}

	const issues: ValidationIssue[] = [];
	if (!isUuid(budget.id)) {
		issues.push({ code: 'invalid-id', path: 'budget.id', message: 'Budget id must be a UUID.' });
	}
	if (typeof budget.name !== 'string' || budget.name.trim() === '') {
		issues.push({ code: 'invalid-name', path: 'budget.name', message: 'Name must not be blank.' });
	}
	if (typeof budget.currency !== 'string' || !CURRENCY_PATTERN.test(budget.currency)) {
		issues.push({
			code: 'invalid-currency',
			path: 'budget.currency',
			message: 'Currency must be a three-letter uppercase code.'
		});
	}
	for (const field of ['createdAt', 'updatedAt'] as const) {
		if (!isIsoTimestamp(budget[field])) {
			issues.push({
				code: 'invalid-timestamp',
				path: `budget.${field}`,
				message: `${field} must be an ISO 8601 timestamp.`
			});
		}
	}
	return issues;
}

/**
 * Validate the flat Item array of one Budget: per-Item structure and numbers, then references
 * (duplicate ids, Items from another Budget, dangling or cross-Budget parents, cycles).
 * Pass `null` as budgetId to skip the check that Items belong to a particular Budget.
 * Accepts untrusted data and never throws.
 */
export function validateItems(budgetId: string | null, items: unknown): ValidationIssue[] {
	if (!Array.isArray(items)) {
		return [{ code: 'invalid-type', path: 'items', message: 'Items must be an array.' }];
	}

	const issues: ValidationIssue[] = [];
	const wellFormed: { index: number; item: Item }[] = [];

	items.forEach((raw, index) => {
		const path = `items[${index}]`;
		if (!isRecord(raw)) {
			issues.push({ code: 'invalid-type', path, message: 'Item must be an object.' });
			return;
		}
		const before = issues.length;

		if (!isUuid(raw.id)) {
			issues.push({ code: 'invalid-id', path: `${path}.id`, message: 'Item id must be a UUID.' });
		}
		if (!isUuid(raw.budgetId)) {
			issues.push({
				code: 'invalid-id',
				path: `${path}.budgetId`,
				message: 'budgetId must be a UUID.'
			});
		}
		if (raw.parentId !== null && !isUuid(raw.parentId)) {
			issues.push({
				code: 'invalid-id',
				path: `${path}.parentId`,
				message: 'parentId must be a UUID or null.'
			});
		}
		if (typeof raw.sortIndex !== 'number' || !Number.isFinite(raw.sortIndex)) {
			issues.push({
				code: 'invalid-sort-index',
				path: `${path}.sortIndex`,
				message: 'sortIndex must be a finite number.'
			});
		}
		if (typeof raw.description !== 'string') {
			issues.push({
				code: 'invalid-type',
				path: `${path}.description`,
				message: 'description must be a string.'
			});
		}
		if (raw.unit !== undefined && typeof raw.unit !== 'string') {
			issues.push({
				code: 'invalid-type',
				path: `${path}.unit`,
				message: 'unit must be a string when present.'
			});
		}
		if (typeof raw.unitPrice !== 'string' || !parseUnitPrice(raw.unitPrice).ok) {
			issues.push({
				code: 'invalid-number',
				path: `${path}.unitPrice`,
				message: 'unitPrice must be a decimal string.'
			});
		}
		if (typeof raw.quantity !== 'string' || !parseQuantity(raw.quantity).ok) {
			issues.push({
				code: 'invalid-number',
				path: `${path}.quantity`,
				message: 'quantity must be a decimal string of zero or more.'
			});
		}

		if (issues.length === before) wellFormed.push({ index, item: raw as unknown as Item });
	});

	issues.push(...validateReferences(budgetId, wellFormed));
	return issues;
}

function validateReferences(
	budgetId: string | null,
	entries: { index: number; item: Item }[]
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const firstByIdIndex = new Map<string, number>();
	const byId = new Map<string, Item>();

	for (const { index, item } of entries) {
		const seenAt = firstByIdIndex.get(item.id);
		if (seenAt !== undefined) {
			issues.push({
				code: 'duplicate-id',
				path: `items[${index}].id`,
				message: `Item id ${item.id} is already used by items[${seenAt}].`
			});
			continue;
		}
		firstByIdIndex.set(item.id, index);
		byId.set(item.id, item);

		if (budgetId !== null && item.budgetId !== budgetId) {
			issues.push({
				code: 'wrong-budget',
				path: `items[${index}].budgetId`,
				message: `Item belongs to Budget ${item.budgetId}, not ${budgetId}.`
			});
		}
	}

	for (const { index, item } of entries) {
		if (firstByIdIndex.get(item.id) !== index || item.parentId === null) continue;
		const parent = byId.get(item.parentId);
		if (!parent) {
			issues.push({
				code: 'dangling-parent',
				path: `items[${index}].parentId`,
				message: `Parent ${item.parentId} does not exist.`
			});
		} else if (parent.budgetId !== item.budgetId) {
			issues.push({
				code: 'cross-budget-parent',
				path: `items[${index}].parentId`,
				message: `Parent ${item.parentId} belongs to a different Budget.`
			});
		}
	}

	issues.push(...findCycles(entries, firstByIdIndex, byId));
	return issues;
}

/**
 * Report each parent cycle (including an Item that is its own parent) once. Walks parent chains
 * iteratively so very deep hierarchies cannot overflow the call stack.
 */
function findCycles(
	entries: { index: number; item: Item }[],
	firstByIdIndex: Map<string, number>,
	byId: Map<string, Item>
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const state = new Map<string, 1 | 2>();

	for (const { index, item } of entries) {
		if (firstByIdIndex.get(item.id) !== index || state.has(item.id)) continue;

		const path: Item[] = [];
		let current: Item | undefined = item;
		while (current && !state.has(current.id)) {
			state.set(current.id, 1);
			path.push(current);
			current = current.parentId === null ? undefined : byId.get(current.parentId);
		}

		if (current && state.get(current.id) === 1) {
			const cycle = path.slice(path.findIndex((member) => member.id === current!.id));
			const first = cycle[0];
			issues.push({
				code: 'cycle',
				path: `items[${firstByIdIndex.get(first.id)}].parentId`,
				message: `Parent cycle: ${[...cycle, first].map((member) => member.id).join(' -> ')}.`
			});
		}
		for (const member of path) state.set(member.id, 2);
	}
	return issues;
}

/** Validate a Budget together with its Items. An empty result means the data is valid. */
export function validateBudgetData(budget: unknown, items: unknown): ValidationIssue[] {
	const budgetId = isRecord(budget) && isUuid(budget.id) ? budget.id : null;
	return [...validateBudget(budget), ...validateItems(budgetId, items)];
}
