/**
 * Flat Budget data model. A Budget persists as one Budget record plus a flat array of Items;
 * the hierarchy is derived at render time from `parentId`, so there is no depth limit.
 *
 * Deliberately not persisted: outline Codes, Totals, and a Group flag. An Item is a Group exactly
 * when another Item names it as parent, and a Line otherwise (see `deriveItemKinds`).
 */

export type Uuid = string;

export interface Budget {
	id: Uuid;
	name: string;
	/** ISO 4217 currency code, e.g. "EUR". */
	currency: string;
	/** ISO 8601 timestamps (UTC), so a Budget serializes to JSON unchanged. */
	createdAt: string;
	updatedAt: string;
}

export interface Item {
	id: Uuid;
	budgetId: Uuid;
	/** Parent Item id, or null for a top-level Item. */
	parentId: Uuid | null;
	/** Position among siblings; ordering rules live with the tree builder. */
	sortIndex: number;
	description: string;
	/** Decimal string from the decimal adapter (`toString`); negative values allowed. */
	unitPrice: string;
	/** Decimal string from the decimal adapter; zero or greater. */
	quantity: string;
	unit?: string;
}

export type ItemKind = 'group' | 'line';

export const DEFAULT_QUANTITY = '1';
export const DEFAULT_UNIT_PRICE = '0';

export interface NewBudgetInput {
	name: string;
	currency: string;
	/** Supply for deterministic tests or imports; generated otherwise. */
	id?: Uuid;
	now?: Date;
}

export function createBudget({ name, currency, id, now = new Date() }: NewBudgetInput): Budget {
	const timestamp = now.toISOString();
	return {
		id: id ?? crypto.randomUUID(),
		name,
		currency,
		createdAt: timestamp,
		updatedAt: timestamp
	};
}

export interface NewItemInput {
	budgetId: Uuid;
	id?: Uuid;
	parentId?: Uuid | null;
	sortIndex?: number;
	description?: string;
	unitPrice?: string;
	quantity?: string;
	unit?: string;
}

/** A new Item defaults to Quantity 1, Unit price 0, no Unit, and top level. */
export function createItem(input: NewItemInput): Item {
	const item: Item = {
		id: input.id ?? crypto.randomUUID(),
		budgetId: input.budgetId,
		parentId: input.parentId ?? null,
		sortIndex: input.sortIndex ?? 0,
		description: input.description ?? '',
		unitPrice: input.unitPrice ?? DEFAULT_UNIT_PRICE,
		quantity: input.quantity ?? DEFAULT_QUANTITY
	};
	if (input.unit !== undefined) item.unit = input.unit;
	return item;
}

/**
 * Group or Line for every Item, derived strictly from the presence of children.
 * Assumes references were validated; a parentId that matches no Item is ignored.
 */
export function deriveItemKinds(items: readonly Item[]): Map<Uuid, ItemKind> {
	const kinds = new Map<Uuid, ItemKind>(items.map((item) => [item.id, 'line']));
	for (const item of items) {
		if (item.parentId !== null && kinds.has(item.parentId)) kinds.set(item.parentId, 'group');
	}
	return kinds;
}
