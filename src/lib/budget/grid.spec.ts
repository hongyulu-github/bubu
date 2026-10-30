import { describe, expect, it } from 'vitest';
import {
	COLUMNS,
	adjacentEditableCell,
	editableField,
	isEditableCell,
	moveCell,
	settleCell,
	type Cell,
	type GridRow
} from './grid';

const rows = (): GridRow[] => [
	{ id: 'g1', kind: 'group' },
	{ id: 'l1', kind: 'line' },
	{ id: 'l2', kind: 'line' },
	{ id: 'g2', kind: 'group' }
];
const at = (rowId: string, column: Cell['column']): Cell => ({ rowId, column });

describe('which cells are editable', () => {
	it('allows Description, Quantity and Unit on Lines and Groups', () => {
		for (const column of ['description', 'quantity', 'unit'] as const) {
			expect(isEditableCell('line', column), `line ${column}`).toBe(true);
			expect(isEditableCell('group', column), `group ${column}`).toBe(true);
		}
	});

	it('allows Unit price on a Line only', () => {
		expect(isEditableCell('line', 'unitPrice')).toBe(true);
		expect(isEditableCell('group', 'unitPrice')).toBe(false);
	});

	it('never allows Code or Total', () => {
		for (const kind of ['line', 'group'] as const) {
			expect(isEditableCell(kind, 'code')).toBe(false);
			expect(isEditableCell(kind, 'total')).toBe(false);
		}
		expect(editableField('code')).toBeUndefined();
		expect(editableField('total')).toBeUndefined();
		expect(editableField('quantity')).toBe('quantity');
	});

	it('lists the columns in the order shown', () => {
		expect([...COLUMNS]).toEqual(['code', 'description', 'quantity', 'unit', 'unitPrice', 'total']);
	});
});

describe('moveCell (arrow keys)', () => {
	it('moves down and up through the visible rows, keeping the column', () => {
		expect(moveCell(rows(), at('g1', 'quantity'), 'down')).toEqual(at('l1', 'quantity'));
		expect(moveCell(rows(), at('l2', 'unit'), 'up')).toEqual(at('l1', 'unit'));
	});

	it('moves left and right along the columns, keeping the row', () => {
		expect(moveCell(rows(), at('l1', 'quantity'), 'right')).toEqual(at('l1', 'unit'));
		expect(moveCell(rows(), at('l1', 'quantity'), 'left')).toEqual(at('l1', 'description'));
	});

	it('includes the read-only columns as places to land', () => {
		expect(moveCell(rows(), at('l1', 'description'), 'left')).toEqual(at('l1', 'code'));
		expect(moveCell(rows(), at('l1', 'unitPrice'), 'right')).toEqual(at('l1', 'total'));
	});

	it('stays put at each edge (no wrapping)', () => {
		expect(moveCell(rows(), at('g1', 'code'), 'up')).toEqual(at('g1', 'code'));
		expect(moveCell(rows(), at('g1', 'code'), 'left')).toEqual(at('g1', 'code'));
		expect(moveCell(rows(), at('g2', 'total'), 'down')).toEqual(at('g2', 'total'));
		expect(moveCell(rows(), at('g2', 'total'), 'right')).toEqual(at('g2', 'total'));
	});

	it('skips rows that are not in the visible list (collapsed descendants)', () => {
		const withoutChildren = rows().filter((row) => row.id !== 'l1' && row.id !== 'l2');
		expect(moveCell(withoutChildren, at('g1', 'description'), 'down')).toEqual(at('g2', 'description'));
		expect(moveCell(withoutChildren, at('g2', 'description'), 'up')).toEqual(at('g1', 'description'));
	});

	it('leaves an unknown cell alone, and handles a single row', () => {
		expect(moveCell(rows(), at('missing', 'unit'), 'down')).toEqual(at('missing', 'unit'));
		const one: GridRow[] = [{ id: 'only', kind: 'line' }];
		expect(moveCell(one, at('only', 'unit'), 'down')).toEqual(at('only', 'unit'));
		expect(moveCell(one, at('only', 'unit'), 'up')).toEqual(at('only', 'unit'));
	});
});

describe('adjacentEditableCell (Tab and Shift+Tab)', () => {
	it('goes to the next editable cell in the row, skipping read-only ones', () => {
		expect(adjacentEditableCell(rows(), at('l1', 'description'), 1)).toEqual(at('l1', 'quantity'));
		expect(adjacentEditableCell(rows(), at('l1', 'quantity'), 1)).toEqual(at('l1', 'unit'));
		expect(adjacentEditableCell(rows(), at('l1', 'unit'), 1)).toEqual(at('l1', 'unitPrice')); // a Line's price is editable
	});

	it('skips a Group Unit price, the Total and the next Code on the way to the next row', () => {
		expect(adjacentEditableCell(rows(), at('g1', 'unit'), 1)).toEqual(at('l1', 'description')); // Group: price is read-only
		expect(adjacentEditableCell(rows(), at('l1', 'unitPrice'), 1)).toEqual(at('l2', 'description')); // past Total and Code
	});

	it('goes backwards the same way', () => {
		expect(adjacentEditableCell(rows(), at('l1', 'quantity'), -1)).toEqual(at('l1', 'description'));
		expect(adjacentEditableCell(rows(), at('l2', 'description'), -1)).toEqual(at('l1', 'unitPrice'));
		expect(adjacentEditableCell(rows(), at('l1', 'description'), -1)).toEqual(at('g1', 'unit')); // skips the Group price
	});

	it('works from a read-only cell too', () => {
		expect(adjacentEditableCell(rows(), at('l1', 'code'), 1)).toEqual(at('l1', 'description'));
		expect(adjacentEditableCell(rows(), at('l1', 'total'), 1)).toEqual(at('l2', 'description'));
		expect(adjacentEditableCell(rows(), at('l1', 'total'), -1)).toEqual(at('l1', 'unitPrice'));
	});

	it('returns null after the last and before the first editable cell', () => {
		expect(adjacentEditableCell(rows(), at('g2', 'unit'), 1)).toBeNull(); // last Group: price read-only, then the end
		expect(adjacentEditableCell(rows(), at('g1', 'description'), -1)).toBeNull();
		expect(adjacentEditableCell(rows(), at('l2', 'unitPrice'), 1)).toEqual(at('g2', 'description'));
	});

	it('skips rows that are not visible', () => {
		const withoutL1 = rows().filter((row) => row.id !== 'l1');
		expect(adjacentEditableCell(withoutL1, at('g1', 'unit'), 1)).toEqual(at('l2', 'description'));
		expect(adjacentEditableCell(withoutL1, at('l2', 'description'), -1)).toEqual(at('g1', 'unit'));
	});

	it('returns null for an unknown cell', () => {
		expect(adjacentEditableCell(rows(), at('missing', 'unit'), 1)).toBeNull();
	});
});

describe('settleCell (after rows change)', () => {
	it('keeps the cell when its row is still visible', () => {
		expect(settleCell(rows(), at('l1', 'unit'), 1)).toEqual(at('l1', 'unit'));
	});

	it('moves to the row now at that position, in the same column, when its row is gone', () => {
		const gone = rows().filter((row) => row.id !== 'l1');
		expect(settleCell(gone, at('l1', 'unit'), 1)).toEqual(at('l2', 'unit'));
	});

	it('falls back to the last row when the position is past the end', () => {
		const gone = rows().slice(0, 2);
		expect(settleCell(gone, at('g2', 'quantity'), 3)).toEqual(at('l1', 'quantity'));
	});

	it('is null when there are no rows', () => {
		expect(settleCell([], at('l1', 'unit'), 0)).toBeNull();
	});
});
