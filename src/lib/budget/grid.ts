import { canEditField, type EditableField } from './edit';
import type { ItemKind, Uuid } from './model';

/**
 * Keyboard navigation over the spreadsheet cells, as pure functions of the rows that are currently
 * visible. Collapsed descendants are not in that list, so they are skipped without any extra rule.
 * Which cell is active, and whether it is being edited, is tracked by the component from real focus.
 */
export const COLUMNS = ['code', 'description', 'quantity', 'unit', 'unitPrice', 'total'] as const;
export type Column = (typeof COLUMNS)[number];

export interface GridRow {
	readonly id: Uuid;
	readonly kind: ItemKind;
}

export interface Cell {
	readonly rowId: Uuid;
	readonly column: Column;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

const EDITABLE_FIELD: Partial<Record<Column, EditableField>> = {
	description: 'description',
	quantity: 'quantity',
	unit: 'unit',
	unitPrice: 'unitPrice'
};

/** The field behind a column that can be edited, or undefined for Code and Total. */
export function editableField(column: Column): EditableField | undefined {
	return EDITABLE_FIELD[column];
}

/**
 * Whether a cell can be edited: Description, Quantity and Unit always, Unit price only on a Line.
 * Code, Total and a Group's Unit price are read-only and never enter edit mode.
 */
export function isEditableCell(kind: ItemKind, column: Column): boolean {
	const field = EDITABLE_FIELD[column];
	return field !== undefined && canEditField(kind, field);
}

/** Move one cell in a direction, staying put at the edge of the grid (no wrapping). */
export function moveCell(rows: readonly GridRow[], cell: Cell, direction: Direction): Cell {
	const rowIndex = rows.findIndex((row) => row.id === cell.rowId);
	if (rowIndex === -1) return cell;
	const columnIndex = COLUMNS.indexOf(cell.column);

	switch (direction) {
		case 'up':
			return { rowId: rows[Math.max(0, rowIndex - 1)].id, column: cell.column };
		case 'down':
			return { rowId: rows[Math.min(rows.length - 1, rowIndex + 1)].id, column: cell.column };
		case 'left':
			return { rowId: cell.rowId, column: COLUMNS[Math.max(0, columnIndex - 1)] };
		case 'right':
			return { rowId: cell.rowId, column: COLUMNS[Math.min(COLUMNS.length - 1, columnIndex + 1)] };
	}
}

/**
 * The next (step 1) or previous (step -1) editable cell in reading order: along the row, then down.
 * Read-only cells are skipped. Returns null past the last or before the first editable cell.
 */
export function adjacentEditableCell(rows: readonly GridRow[], cell: Cell, step: 1 | -1): Cell | null {
	const rowIndex = rows.findIndex((row) => row.id === cell.rowId);
	if (rowIndex === -1) return null;

	let position = rowIndex * COLUMNS.length + COLUMNS.indexOf(cell.column) + step;
	while (position >= 0 && position < rows.length * COLUMNS.length) {
		const row = rows[Math.floor(position / COLUMNS.length)];
		const column = COLUMNS[position % COLUMNS.length];
		if (isEditableCell(row.kind, column)) return { rowId: row.id, column };
		position += step;
	}
	return null;
}

/**
 * Where focus should go when the active cell's row has disappeared (deleted, or hidden by a
 * collapse): the same column on the row now at that position, or the last row. Null when no rows.
 */
export function settleCell(rows: readonly GridRow[], cell: Cell, previousIndex: number): Cell | null {
	if (rows.length === 0) return null;
	if (rows.some((row) => row.id === cell.rowId)) return cell;
	return { rowId: rows[Math.min(Math.max(previousIndex, 0), rows.length - 1)].id, column: cell.column };
}
