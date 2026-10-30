import { calculateTotals, type ItemAmounts } from '../budget/calculate';
import { applyFieldEdit, type EditResult, type EditableField } from '../budget/edit';
import { insertSiblingItem, insertTopLevelItem, type InsertResult, type NewItemFields } from '../budget/insert';
import { renameBudgetDocument } from '../budget/rename';
import { createBudgetDocument, type BudgetFormInput, type CreateBudgetResult } from '../budget/create';
import type { Budget, Item, ItemKind, Uuid } from '../budget/model';
import { buildItemTree } from '../budget/tree';
import { validateBudget, validateItems, type ValidationIssue } from '../budget/validation';
import { CommandHistory, sessionHistory } from '../history/commands';
import { bubuStorage, type BubuStorage, type StorageError } from '../storage/bubu';

/**
 * The one reactive source of truth for browser-local Budgets.
 *
 * Only documents and flat Item arrays are state. Hierarchy, Codes, Group/Line and totals are
 * `$derived` from those same arrays, so replacing an array refreshes all of them and nothing is
 * stored twice. Undo/redo history lives in the (non-reactive) command engine for the page session;
 * this store mirrors its results into state and keeps a version counter so `canUndo`/`canRedo`
 * stay reactive. Nothing here writes to storage: persistence is wired separately.
 *
 * Nothing touches browser storage until `hydrate()` is called, which components do from `onMount`.
 */
export interface BudgetRow {
	readonly id: Uuid;
	readonly code: string;
	readonly depth: number;
	readonly kind: ItemKind;
	/** The very Item object held in state (no copy). */
	readonly item: Item;
	readonly amounts: ItemAmounts;
}

export interface LoadIssue {
	/** The Budget that could not be loaded, when the failure is specific to one. */
	budgetId?: string;
	error: StorageError;
}

export type MutationResult =
	| { ok: true }
	| { ok: false; reason: 'unknown-budget' | 'invalid'; issues: ValidationIssue[] };

export type AddItemResult =
	| { ok: true; item: Item }
	| { ok: false; reason: 'unknown-budget' | 'unknown-item' | 'invalid' };

export type RenameBudgetResult =
	| { ok: true; changed: boolean; budget: Budget }
	| { ok: false; reason: 'unknown-budget' }
	| { ok: false; reason: 'invalid'; errors: { name: string } };

export type HydrationStatus = 'idle' | 'ready' | 'unavailable';

export interface BudgetStoreOptions {
	storage?: BubuStorage;
	history?: CommandHistory;
	now?: () => Date;
}

const NO_ITEMS: readonly Item[] = [];

const unknownBudget = (budgetId: Uuid): MutationResult => ({
	ok: false,
	reason: 'unknown-budget',
	issues: [{ code: 'invalid-id', path: 'budgetId', message: `No Budget with id ${budgetId}.` }]
});

export class BudgetStore {
	readonly #storage: BubuStorage;
	readonly #history: CommandHistory;
	readonly #now: () => Date;

	/** Budget documents. Replaced, never mutated in place. */
	budgets = $state.raw<readonly Budget[]>([]);
	#itemsByBudget = $state.raw<Readonly<Record<Uuid, readonly Item[]>>>({});
	activeBudgetId = $state<Uuid | null>(null);

	hydrationStatus = $state<HydrationStatus>('idle');
	loadIssues = $state.raw<readonly LoadIssue[]>([]);
	#historyVersion = $state(0);

	activeBudget = $derived(this.budgets.find((budget) => budget.id === this.activeBudgetId) ?? null);
	/** Flat Items of the active Budget. */
	items = $derived(this.activeBudget ? (this.#itemsByBudget[this.activeBudget.id] ?? NO_ITEMS) : NO_ITEMS);
	tree = $derived(buildItemTree(this.items));
	totals = $derived(calculateTotals(this.tree));
	grandTotal = $derived(this.totals.grandTotal);
	/** Ordered display model: every Item depth-first with its Code, kind and amounts. */
	rows = $derived<readonly BudgetRow[]>(
		this.tree.ordered.map((node) => ({
			id: node.item.id,
			code: node.code,
			depth: node.depth,
			kind: node.kind,
			item: node.item,
			amounts: this.totals.amounts.get(node.item.id)!
		}))
	);

	constructor({ storage = bubuStorage, history = sessionHistory, now = () => new Date() }: BudgetStoreOptions = {}) {
		this.#storage = storage;
		this.#history = history;
		this.#now = now;
	}

	/**
	 * Load every saved Budget and its Items from browser storage. Call from `onMount`: on the
	 * server, or with storage blocked, it only sets the status to `unavailable`. Budgets that fail
	 * to load are reported in `loadIssues` and left out (and untouched in storage).
	 */
	hydrate(): void {
		const listing = this.#storage.listBudgets();
		if (!listing.ok) {
			this.hydrationStatus = 'unavailable';
			this.loadIssues = [{ error: listing.error }];
			return;
		}

		const issues: LoadIssue[] = listing.value.failures.map(({ budgetId, error }) => ({ budgetId, error }));
		const budgets: Budget[] = [];
		const itemsByBudget: Record<Uuid, readonly Item[]> = {};

		for (const budget of listing.value.budgets) {
			const items = this.#storage.readItems(budget.id);
			if (items.ok) {
				itemsByBudget[budget.id] = items.value;
			} else if (items.error.kind === 'not-found') {
				itemsByBudget[budget.id] = []; // a Budget saved before any Item existed
			} else {
				issues.push({ budgetId: budget.id, error: items.error });
				continue;
			}
			budgets.push(budget);
		}

		this.budgets = budgets;
		this.#itemsByBudget = itemsByBudget;
		this.loadIssues = issues;
		this.hydrationStatus = 'ready';
		if (this.activeBudgetId !== null && !itemsByBudget[this.activeBudgetId]) this.activeBudgetId = null;
	}

	/** Make a Budget the active one. Switching never touches any Budget's history. */
	select(budgetId: Uuid | null): void {
		this.activeBudgetId = budgetId;
	}

	itemsOf(budgetId: Uuid): readonly Item[] {
		return this.#itemsByBudget[budgetId] ?? NO_ITEMS;
	}

	/** Add or replace a Budget document, optionally with its Items. Not an undoable command. */
	setBudget(budget: Budget, items?: readonly Item[]): MutationResult {
		const issues = [...validateBudget(budget), ...(items ? validateItems(budget.id, items) : [])];
		if (issues.length > 0) return { ok: false, reason: 'invalid', issues };

		const exists = this.budgets.some((existing) => existing.id === budget.id);
		this.budgets = exists
			? this.budgets.map((existing) => (existing.id === budget.id ? budget : existing))
			: [...this.budgets, budget];
		if (items) this.#itemsByBudget = { ...this.#itemsByBudget, [budget.id]: items };
		else if (!exists) this.#itemsByBudget = { ...this.#itemsByBudget, [budget.id]: [] };
		return { ok: true };
	}

	/**
	 * Create a normal Budget from the create form: validated, a fresh UUID and timestamps, and an
	 * empty Item array (never template data). The Budget is added to shared state; it is not selected,
	 * so the caller decides where to navigate. Not an undoable command.
	 */
	createBudget(input: BudgetFormInput, options?: { id?: Uuid; now?: Date }): CreateBudgetResult {
		const created = createBudgetDocument(input, { now: this.#now(), ...options });
		if (!created.ok) return created;
		this.setBudget(created.budget, []);
		return created;
	}

	/**
	 * Rename a Budget: a document-level change, not an Item command. Only the name and updatedAt
	 * change; Items, their order and every history stack are left exactly as they are.
	 */
	renameBudget(budgetId: Uuid, name: string): RenameBudgetResult {
		const budget = this.budgets.find((candidate) => candidate.id === budgetId);
		if (!budget) return { ok: false, reason: 'unknown-budget' };

		const renamed = renameBudgetDocument(budget, name, this.#now());
		if (!renamed.ok) return { ok: false, reason: 'invalid', errors: renamed.errors };
		if (renamed.changed) {
			this.budgets = this.budgets.map((candidate) => (candidate.id === budgetId ? renamed.budget : candidate));
		}
		return { ok: true, changed: renamed.changed, budget: renamed.budget };
	}

	/** Remove a Budget from state (its history stays in memory until the page reloads). */
	removeBudget(budgetId: Uuid): void {
		this.budgets = this.budgets.filter((budget) => budget.id !== budgetId);
		const { [budgetId]: _removed, ...rest } = this.#itemsByBudget;
		this.#itemsByBudget = rest;
		if (this.activeBudgetId === budgetId) this.activeBudgetId = null;
	}

	/** Replace a Budget's Items without recording history (e.g. an import). Instantly recomputes derived data. */
	setItems(budgetId: Uuid, items: readonly Item[]): MutationResult {
		const checked = this.#check(budgetId, items);
		if (!checked.ok) return checked;
		this.#apply(budgetId, items);
		return { ok: true };
	}

	/**
	 * Commit one user action: the current Items become the "before" snapshot and `after` the new
	 * state. Invalid arrays are rejected and change nothing, so derived data never sees them.
	 */
	execute(budgetId: Uuid, after: readonly Item[]): MutationResult {
		const checked = this.#check(budgetId, after);
		if (!checked.ok) return checked;
		const current = this.#history.execute(budgetId, { before: this.itemsOf(budgetId), after });
		this.#apply(budgetId, current);
		this.#historyVersion++;
		return { ok: true };
	}

	/**
	 * Commit one inline cell edit as a single history command. Invalid, forbidden and no-op edits
	 * change nothing and record nothing; a real change updates the Items (and so every derived
	 * value) at once and can be undone as one step.
	 */
	editItem(budgetId: Uuid, itemId: Uuid, field: EditableField, text: string): EditResult {
		if (!this.budgets.some((budget) => budget.id === budgetId)) {
			return { ok: false, reason: 'unknown-item', message: 'That Budget no longer exists.' };
		}
		const edit = applyFieldEdit(this.itemsOf(budgetId), itemId, field, text);
		if (!edit.ok || !edit.changed) return edit;

		const committed = this.execute(budgetId, edit.items);
		if (!committed.ok) return { ok: false, reason: 'invalid', message: committed.issues[0]?.message ?? 'The edit is not valid.' };
		return edit;
	}

	/** Add a top-level Item as one undoable command. Returns the new Item, or why nothing was added. */
	addTopLevelItem(budgetId: Uuid, fields?: NewItemFields): AddItemResult {
		if (!this.budgets.some((budget) => budget.id === budgetId)) return { ok: false, reason: 'unknown-budget' };
		return this.#commitInsert(budgetId, insertTopLevelItem(this.itemsOf(budgetId), budgetId, fields));
	}

	/** Add an Item directly after a sibling, under the same parent, as one undoable command. */
	addSiblingItem(budgetId: Uuid, siblingId: Uuid, fields?: NewItemFields): AddItemResult {
		if (!this.budgets.some((budget) => budget.id === budgetId)) return { ok: false, reason: 'unknown-budget' };
		return this.#commitInsert(budgetId, insertSiblingItem(this.itemsOf(budgetId), siblingId, fields));
	}

	#commitInsert(budgetId: Uuid, inserted: InsertResult): AddItemResult {
		if (!inserted.ok) return inserted;
		const committed = this.execute(budgetId, inserted.items);
		return committed.ok ? { ok: true, item: inserted.item } : { ok: false, reason: 'invalid' };
	}

	/** Undo the Budget's last command. Returns false when there is nothing to undo. */
	undo(budgetId: Uuid): boolean {
		const restored = this.#history.undo(budgetId);
		if (!restored) return false;
		this.#apply(budgetId, restored);
		this.#historyVersion++;
		return true;
	}

	/** Redo the Budget's last undone command. Returns false when there is nothing to redo. */
	redo(budgetId: Uuid): boolean {
		const restored = this.#history.redo(budgetId);
		if (!restored) return false;
		this.#apply(budgetId, restored);
		this.#historyVersion++;
		return true;
	}

	canUndo(budgetId: Uuid): boolean {
		this.#historyVersion; // reactive dependency: re-evaluate after any history change
		return this.#history.canUndo(budgetId);
	}

	canRedo(budgetId: Uuid): boolean {
		this.#historyVersion;
		return this.#history.canRedo(budgetId);
	}

	#check(budgetId: Uuid, items: readonly Item[]): MutationResult {
		if (!this.budgets.some((budget) => budget.id === budgetId)) return unknownBudget(budgetId);
		const issues = validateItems(budgetId, items);
		return issues.length > 0 ? { ok: false, reason: 'invalid', issues } : { ok: true };
	}

	#apply(budgetId: Uuid, items: readonly Item[]): void {
		this.#itemsByBudget = { ...this.#itemsByBudget, [budgetId]: items };
		const updatedAt = this.#now().toISOString();
		this.budgets = this.budgets.map((budget) => (budget.id === budgetId ? { ...budget, updatedAt } : budget));
	}
}

/** The app-wide store. Safe to import anywhere: it reads no browser global until `hydrate()`. */
export const budgetStore = new BudgetStore();
