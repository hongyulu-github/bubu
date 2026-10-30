import type { Item, Uuid } from '../budget/model';

/**
 * Per-Budget undo/redo over immutable before/after snapshots of the flat Item array.
 *
 * One committed user action is one command. The engine knows nothing about what the command did
 * (feature code builds the before/after arrays), the UI, or storage: stacks live only in memory
 * for the page session, so a reload starts empty and nothing is ever written to localStorage.
 *
 * Snapshots are copied on the way in and on the way out. The supplied arrays are never mutated or
 * retained, and callers may freely edit what they get back without corrupting history.
 */
export interface Command {
	readonly before: readonly Item[];
	readonly after: readonly Item[];
}

interface Stacks {
	undo: Command[];
	redo: Command[];
}

function snapshot(items: readonly Item[]): Item[] {
	return items.map((item) => ({ ...item }));
}

export class CommandHistory {
	readonly #stacks = new Map<Uuid, Stacks>();

	#stacksFor(budgetId: Uuid): Stacks {
		let stacks = this.#stacks.get(budgetId);
		if (!stacks) {
			stacks = { undo: [], redo: [] };
			this.#stacks.set(budgetId, stacks);
		}
		return stacks;
	}

	/**
	 * Record a committed command for the Budget and clear its redo stack (a new action invalidates
	 * the undone branch). Returns the Item array that is now current (a copy of `after`).
	 */
	execute(budgetId: Uuid, command: Command): Item[] {
		const stacks = this.#stacksFor(budgetId);
		stacks.undo.push({ before: snapshot(command.before), after: snapshot(command.after) });
		stacks.redo.length = 0;
		return snapshot(command.after);
	}

	/** Step back one command. Returns the Items to restore, or null when there is nothing to undo. */
	undo(budgetId: Uuid): Item[] | null {
		const stacks = this.#stacks.get(budgetId);
		const command = stacks?.undo.pop();
		if (!stacks || !command) return null;
		stacks.redo.push(command);
		return snapshot(command.before);
	}

	/** Step forward one undone command. Returns the Items to restore, or null when there is nothing to redo. */
	redo(budgetId: Uuid): Item[] | null {
		const stacks = this.#stacks.get(budgetId);
		const command = stacks?.redo.pop();
		if (!stacks || !command) return null;
		stacks.undo.push(command);
		return snapshot(command.after);
	}

	/** Discard a Budget's undo and redo stacks, e.g. when the Budget itself is deleted. Others are untouched. */
	clear(budgetId: Uuid): void {
		this.#stacks.delete(budgetId);
	}

	canUndo(budgetId: Uuid): boolean {
		return (this.#stacks.get(budgetId)?.undo.length ?? 0) > 0;
	}

	canRedo(budgetId: Uuid): boolean {
		return (this.#stacks.get(budgetId)?.redo.length ?? 0) > 0;
	}
}

/** The page-session history shared by every editing path. Module state, so a reload empties it. */
export const sessionHistory = new CommandHistory();
