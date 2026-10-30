import { createItem, type Item } from '../../budget/model';

const BUDGET_ID = '99999999-9999-4999-8999-999999999999';

export const uuid = (n: number): string => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function item(n: number, parent: number | null, sortIndex: number, description: string): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET_ID,
		parentId: parent === null ? null : uuid(parent),
		sortIndex,
		description
	});
}

/** Small flat fixture: two nested Groups, plain Lines, several roots. */
export function createFixture(): Item[] {
	return [
		item(1, null, 0, 'Venue'),
		item(2, 1, 0, 'Hall rental'),
		item(3, 1, 1, 'Decoration'),
		item(4, 3, 0, 'Flowers'),
		item(5, 3, 1, 'Lights'),
		item(6, null, 1, 'Catering'),
		item(7, 6, 0, 'Food'),
		item(8, 6, 1, 'Drinks'),
		item(9, null, 2, 'Music'),
		item(10, null, 3, 'Photography')
	];
}
