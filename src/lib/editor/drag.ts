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

/**
 * Width of one level's drop zone at the left of a row's last-in-group. Twice the visible indent (1rem),
 * so that "after the parent" is a target a pointer can actually hit.
 */
const levelZoneWidth = () => 2 * parseFloat(getComputedStyle(document.documentElement).fontSize);

/** What a drop on a row means: the target Item and the intent, or null when the instruction is blocked or missing. */
function resolveDrop(data: Record<string | symbol, unknown>): { targetId: Uuid; intent: DropIntent } | null {
	const instruction = extractInstruction(data);
	if (!instruction) return null;
	if (instruction.type === 'reparent') {
		// Pointer left of a group's last row: after the ancestor at the chosen level.
		const ancestor = (data.ancestors as Uuid[])[instruction.desiredLevel];
		return ancestor ? { targetId: ancestor, intent: 'after' } : null;
	}
	const intent = INTENTS[instruction.type];
	return intent && typeof data.id === 'string' ? { targetId: data.id, intent } : null;
}

/**
 * Make a row both a drag source and a drop target for the Item `id`. Use as `{@attach rowDrag(...)}` on
 * the row: the registrations are removed when the row unmounts or any option changes.
 *
 * `expanded` is a Group that shows its children. Below it is visually inside it, so it only offers
 * before and inside (the middle and bottom of the row both mean inside).
 *
 * `lastInGroup` is the last visible row of its parent, so the pointer's horizontal position can also
 * pick a higher level: left of the row, below its middle, means after one of its `ancestors`
 * (top-level first), which is how an Item is moved out as a sibling of its parent.
 */
export function rowDrag(options: {
	id: Uuid;
	depth: number;
	expanded: boolean;
	lastInGroup: boolean;
	ancestors: readonly Uuid[];
}): Attachment<HTMLElement> {
	const { id, depth, expanded, lastInGroup, ancestors } = options;
	const mode = expanded ? 'expanded' : lastInGroup ? 'last-in-group' : 'standard';
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
						{ type: ROW, id, ancestors },
						{ input, element, currentLevel: depth, indentPerLevel: levelZoneWidth(), mode }
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
			const drop = target && resolveDrop(target.data);
			const { id: dragId } = source.data;
			if (drop && typeof dragId === 'string') ondrop({ dragId, ...drop });
		}
	});
}
