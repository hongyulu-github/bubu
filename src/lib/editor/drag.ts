import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
	draggable,
	dropTargetForElements,
	monitorForElements
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import {
	attachInstruction,
	extractInstruction,
	type Instruction
} from '@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item';
import type { Attachment } from 'svelte/attachments';
import type { Uuid } from '../budget/model';

/**
 * Pointer drag of Item rows (LUL-13): hit testing only. This module never reads or changes Items; it
 * turns a drop into a `DropRequest` and hands it to the caller, who decides whether to accept it
 * (hierarchy rules, conversion, history live with the move handler).
 */
export type DropIntent = 'before' | 'after' | 'inside';

export interface DropRequest {
	/** The Item that was dragged. */
	dragId: Uuid;
	/** The Item it was dropped on. */
	targetId: Uuid;
	intent: DropIntent;
}

const ROW = 'budget-item-row';
const INTENTS: Partial<Record<Instruction['type'], DropIntent>> = {
	'reorder-above': 'before',
	'reorder-below': 'after',
	'make-child': 'inside'
};

/** Attribute that marks the part of a row a drag may start from; the whole row when absent. */
export const DRAG_HANDLE = 'data-drag-handle';

const intentOf = (data: Record<string | symbol, unknown>): DropIntent | null => {
	const instruction = extractInstruction(data);
	return instruction ? (INTENTS[instruction.type] ?? null) : null;
};

/**
 * Make a row both a drag source and a drop target for the Item `id`. Use as `{@attach rowDrag(...)}` on
 * the row: the registrations are removed when the row unmounts or any option changes.
 *
 * `expanded` is a Group that shows its children. Below it is visually inside it, so it only offers
 * before and inside (the middle and bottom of the row both mean inside).
 */
export function rowDrag(options: { id: Uuid; depth: number; expanded: boolean }): Attachment<HTMLElement> {
	const { id, depth, expanded } = options;
	return (row) =>
		combine(
			draggable({
				element: row,
				dragHandle: row.querySelector<HTMLElement>(`[${DRAG_HANDLE}]`) ?? undefined,
				getInitialData: () => ({ type: ROW, id })
			}),
			dropTargetForElements({
				element: row,
				canDrop: ({ source }) => source.data.type === ROW && source.data.id !== id,
				getData: ({ input, element }) =>
					attachInstruction(
						{ type: ROW, id },
						{ input, element, currentLevel: depth, indentPerLevel: 0, mode: expanded ? 'expanded' : 'standard' }
					)
			})
		);
}

/**
 * Report every completed drop on a row. A drop outside any row, on the dragged row itself, or a
 * cancelled drag (Escape) has no target and reports nothing. Returns the cleanup.
 */
export function monitorRowDrops(ondrop: (request: DropRequest) => void): () => void {
	return monitorForElements({
		canMonitor: ({ source }) => source.data.type === ROW,
		onDrop({ source, location }) {
			const target = location.current.dropTargets[0];
			const intent = target && intentOf(target.data);
			const { id: dragId } = source.data;
			const { id: targetId } = target?.data ?? {};
			if (intent && typeof dragId === 'string' && typeof targetId === 'string') {
				ondrop({ dragId, targetId, intent });
			}
		}
	});
}
