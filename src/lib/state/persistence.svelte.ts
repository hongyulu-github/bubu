import type { Budget, Item, Uuid } from '../budget/model';
import { bubuStorage, type BubuStorage, type StorageError } from '../storage/bubu';
import { budgetStore, type BudgetStore } from './budgets.svelte';

/**
 * The one automatic save path from shared Budget state to browser storage.
 *
 * Instead of every feature remembering to save, this watches the shared state and writes whatever
 * differs from what was last saved. Shared state is replaced, never mutated, so "differs" is a cheap
 * reference check per Budget document and per Item array. That covers Budget create, rename,
 * duplicate and delete, every Item command, and the results of undo and redo, uniformly.
 *
 * Only documents and flat Item arrays are written: no derived values, no editing buffers, no
 * command history. Nothing is written for Budgets that failed to load (they are not in state), so
 * unreadable data is never overwritten or deleted. A failed write is reported in `failures` and
 * retried on the next pass; it never throws.
 */
export interface SaveFailure {
	operation: 'save-items' | 'save-budget' | 'delete-budget';
	budgetId: Uuid;
	error: StorageError;
}

/** What was last written (or loaded) for one Budget; undefined means not yet saved. */
interface Saved {
	budget?: Budget;
	items?: readonly Item[];
}

export class BudgetPersistence {
	readonly #store: BudgetStore;
	readonly #storage: BubuStorage;
	#saved = new Map<Uuid, Saved>();
	#seenHydration = -1;

	/** Everything that failed to save in the latest pass; empty when all is saved. */
	failures = $state.raw<readonly SaveFailure[]>([]);

	constructor(store: BudgetStore = budgetStore, storage: BubuStorage = bubuStorage) {
		this.#store = store;
		this.#storage = storage;
	}

	/** Begin saving automatically after every state change. Returns a function that stops it. */
	start(): () => void {
		return $effect.root(() => {
			$effect(() => {
				this.flush();
			});
		});
	}

	/** Save everything that changed since the last pass. Also the way to retry after a failure. */
	flush(): void {
		const store = this.#store;
		// Nothing is saved before the stored Budgets have been loaded, or they could be overwritten.
		if (store.hydrationStatus === 'idle') return;

		const current = store.budgets.map((budget) => ({ budget, items: store.itemsOf(budget.id) }));

		// Loading replaces the state wholesale: what was just loaded is, by definition, already saved.
		if (store.hydrationCount !== this.#seenHydration) {
			this.#seenHydration = store.hydrationCount;
			this.#saved = new Map(current.map(({ budget, items }) => [budget.id, { budget, items }]));
			this.failures = [];
			return;
		}

		const failures: SaveFailure[] = [];
		const nextSaved = new Map<Uuid, Saved>();

		for (const { budget, items } of current) {
			const saved = this.#saved.get(budget.id) ?? {};
			const entry: Saved = { ...saved };

			let itemsSaved = true;
			if (saved.items !== items) {
				const written = this.#storage.writeItems(budget.id, items);
				if (written.ok) entry.items = items;
				else {
					itemsSaved = false;
					failures.push({ operation: 'save-items', budgetId: budget.id, error: written.error });
				}
			}

			// The document goes last, and only once its Items are safe, so a Budget never appears
			// in storage without its data.
			if (saved.budget !== budget && itemsSaved) {
				const written = this.#storage.writeBudget(budget);
				if (written.ok) entry.budget = budget;
				else failures.push({ operation: 'save-budget', budgetId: budget.id, error: written.error });
			}

			nextSaved.set(budget.id, entry);
		}

		const currentIds = new Set(current.map(({ budget }) => budget.id));
		for (const [budgetId, saved] of this.#saved) {
			if (currentIds.has(budgetId)) continue;
			const removed = this.#storage.deleteBudget(budgetId);
			if (!removed.ok) {
				nextSaved.set(budgetId, saved); // keep it so the deletion is retried
				failures.push({ operation: 'delete-budget', budgetId, error: removed.error });
			}
		}

		this.#saved = nextSaved;
		this.failures = failures;
	}
}

/** The app-wide autosave, for the shared store. Started once the app mounts in the browser. */
export const budgetPersistence = new BudgetPersistence();
