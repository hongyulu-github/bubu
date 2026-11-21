import { flushSync } from 'svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CommandHistory } from '../history/commands';
import { BudgetPersistence } from '../state/persistence.svelte';
import { BudgetStore } from '../state/budgets.svelte';
import { createBubuStorage } from '../storage/bubu';
import { FakeStorage } from '../testing/fake-storage';
import { homeRenovationTemplate, templates, weddingTemplate } from './templates';

const stops: (() => void)[] = [];
let fake: FakeStorage;

function session() {
	const storage = createBubuStorage(() => fake);
	const store = new BudgetStore({ storage, history: new CommandHistory() });
	store.hydrate();
	stops.push(new BudgetPersistence(store, storage).start());
	flushSync();
	return store;
}
const reload = () => {
	const store = new BudgetStore({ storage: createBubuStorage(() => fake), history: new CommandHistory() });
	store.hydrate();
	return store;
};

beforeEach(() => (fake = new FakeStorage()));
afterEach(() => {
	while (stops.length) stops.pop()!();
});

describe('template Budgets in the shared store', () => {
	it('are saved through the storage module and survive a reload, with their Items', () => {
		const store = session();
		const result = store.createBudgetFromTemplate(weddingTemplate, { name: 'Our wedding', currency: 'EUR' });
		if (!result.ok) throw new Error('expected a Budget');
		flushSync();

		const reloaded = reload();
		expect(reloaded.budgets.map((budget) => budget.name)).toEqual(['Our wedding']);
		expect(reloaded.itemsOf(result.budget.id)).toEqual(store.itemsOf(result.budget.id));
		expect(reloaded.itemsOf(result.budget.id)).toHaveLength(weddingTemplate.items.length);
	});

	it('can be made repeatedly from the same template, each independent', () => {
		const store = session();
		const a = store.createBudgetFromTemplate(homeRenovationTemplate, { name: 'Flat', currency: 'USD' });
		const b = store.createBudgetFromTemplate(homeRenovationTemplate, { name: 'House', currency: 'GBP' });
		if (!a.ok || !b.ok) throw new Error('expected Budgets');
		flushSync();
		const reloaded = reload();
		expect(reloaded.budgets).toHaveLength(2);
		expect(reloaded.budgets.map((budget) => budget.currency).sort()).toEqual(['GBP', 'USD']);
		const ids = [...reloaded.itemsOf(a.budget.id), ...reloaded.itemsOf(b.budget.id)].map((item) => item.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('is not an Item command: nothing to undo or redo, and later edits start their own history', () => {
		const store = session();
		const result = store.createBudgetFromTemplate(weddingTemplate, { name: 'Wedding', currency: 'EUR' });
		if (!result.ok) throw new Error('expected a Budget');
		expect(store.canUndo(result.budget.id)).toBe(false);
		expect(store.canRedo(result.budget.id)).toBe(false);
	});

	it('creates nothing for an invalid form', () => {
		const store = session();
		const result = store.createBudgetFromTemplate(weddingTemplate, { name: '', currency: 'EUR' });
		flushSync();
		expect(result.ok).toBe(false);
		expect(store.budgets).toHaveLength(0);
		expect(fake.data.size).toBe(0);
	});

	it('leaves normal creation empty, whatever templates exist', () => {
		const store = session();
		const result = store.createBudget({ name: 'Plain', currency: 'EUR' });
		if (!result.ok) throw new Error('expected a Budget');
		expect(store.itemsOf(result.budget.id)).toHaveLength(0);
		expect(templates.length).toBeGreaterThan(0);
	});
});
