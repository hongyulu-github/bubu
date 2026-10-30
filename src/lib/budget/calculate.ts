import type { Item, Uuid } from './model';
import { multiply, parseQuantity, parseUnitPrice, sum, type Decimal } from './numbers';
import { buildItemTree, type ItemTree } from './tree';

/**
 * Pure, unrounded roll-up calculation over the flat Items. Nothing is written back to Items:
 * computed amounts are returned separately, so a Group's stored `unitPrice` and every Line's
 * precise manual input stay exactly as entered.
 *
 * - Line: Total = Unit price x Quantity (both from the Item).
 * - Group (an Item with children): Unit price = sum of its direct children's Totals, ignoring
 *   the Item's own stored `unitPrice`; Total = that Unit price x the Group's own Quantity.
 * - Budget grand total = sum of top-level Totals only (children are already inside their parents).
 *
 * Group/Line comes only from the presence of children. Results may be negative (discounts) and are
 * never rounded; display rounding belongs to a presentation adapter. Assumes validated Items
 * (see `validateItems`); an unparsable stored number throws. Items unreachable from the top level
 * (dangling parent, cycle) are ignored.
 */
export interface ItemAmounts {
	readonly unitPrice: Decimal;
	readonly quantity: Decimal;
	readonly total: Decimal;
}

export interface BudgetTotals {
	readonly amounts: ReadonlyMap<Uuid, ItemAmounts>;
	readonly grandTotal: Decimal;
}

function readDecimal(item: Item, field: 'unitPrice' | 'quantity'): Decimal {
	const result = field === 'unitPrice' ? parseUnitPrice(item.unitPrice) : parseQuantity(item.quantity);
	if (!result.ok) {
		throw new Error(`Item ${item.id} has an invalid ${field} "${item[field]}" (${result.error}).`);
	}
	return result.value;
}

/** Calculate amounts for every Item of an already built tree. */
export function calculateTotals(tree: ItemTree): BudgetTotals {
	const amounts = new Map<Uuid, ItemAmounts>();

	// `ordered` lists parents before their children, so walking it backwards visits every child
	// before its parent without recursion (nesting depth is unbounded).
	for (let i = tree.ordered.length - 1; i >= 0; i--) {
		const node = tree.ordered[i];
		const quantity = readDecimal(node.item, 'quantity');

		let unitPrice: Decimal;
		if (node.kind === 'group') {
			unitPrice = sum(node.children.map((child) => amounts.get(child.item.id)!.total));
		} else {
			unitPrice = readDecimal(node.item, 'unitPrice');
		}

		amounts.set(node.item.id, { unitPrice, quantity, total: multiply(unitPrice, quantity) });
	}

	const grandTotal = sum(tree.roots.map((root) => amounts.get(root.item.id)!.total));
	return { amounts, grandTotal };
}

/** Calculate amounts and the grand total straight from the flat Items. Zero for an empty Budget. */
export function calculateBudget(items: readonly Item[]): BudgetTotals {
	return calculateTotals(buildItemTree(items));
}
