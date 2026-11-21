import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import BudgetSpreadsheet from '../budgets/BudgetSpreadsheet.svelte';
import { BudgetStore } from '../state/budgets.svelte';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function item(n: number, parent: number | null): Item {
	return createItem({
		id: uuid(n),
		budgetId: BUDGET,
		parentId: parent === null ? null : uuid(parent),
		sortIndex: n,
		description: `Item ${n}`,
		unitPrice: '5',
		quantity: '1'
	});
}

// 1 (Group) > 1.1 (Line), 1.2 (Group) > 1.2.1 (Line); 2 and 3 are Lines.
const tree = () => [item(1, null), item(2, 1), item(3, 1), item(4, 3), item(5, null), item(6, null)];
const ID = { g1: 1, g1_1: 2, g1_2: 3, g1_2_1: 4, l2: 5, l3: 6 } as const;

function openStore(items: Item[]) {
	const store = new BudgetStore({ history: new CommandHistory() });
	store.hydrate();
	store.setBudget(createBudget({ id: BUDGET, name: 'Wedding', currency: 'EUR' }), items);
	store.select(BUDGET);
	return store;
}

const row = (n: number) => document.querySelector<HTMLElement>(`tr[data-item-id="${uuid(n)}"]`)!;
const handle = (n: number) => page.elementLocator(row(n).querySelector('[data-drag-handle]')!);
const at = (n: number, fraction: number) => ({
	target: page.elementLocator(row(n)),
	targetPosition: { x: 20, y: row(n).getBoundingClientRect().height * fraction }
});
async function drag(from: number, onto: number, fraction: number) {
	const { target, targetPosition } = at(onto, fraction);
	await userEvent.dragAndDrop(handle(from), target, { targetPosition });
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('row drag and drop', () => {
	it('reports the dragged Item, the target Item and before / inside / after', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });

		await drag(ID.l3, ID.l2, 0.05);
		await drag(ID.l3, ID.l2, 0.5);
		await drag(ID.l3, ID.l2, 0.85);

		expect(onmove.mock.calls.map(([request]) => request)).toEqual([
			{ dragId: uuid(ID.l3), targetId: uuid(ID.l2), intent: 'before' },
			{ dragId: uuid(ID.l3), targetId: uuid(ID.l2), intent: 'inside' },
			{ dragId: uuid(ID.l3), targetId: uuid(ID.l2), intent: 'after' }
		]);
	});

	it('every visible row can start a drag, at any depth', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });

		for (const n of Object.values(ID).filter((n) => n !== ID.l2)) {
			onmove.mockClear();
			await drag(n, ID.l2, 0.5);
			expect(onmove).toHaveBeenCalledExactlyOnceWith({ dragId: uuid(n), targetId: uuid(ID.l2), intent: 'inside' });
		}
	});

	it('hit-tests the nested row that is under the pointer, not an ancestor', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });

		await drag(ID.l3, ID.g1_2_1, 0.5); // three levels deep, inside Groups 1 and 1.2
		expect(onmove).toHaveBeenCalledExactlyOnceWith({ dragId: uuid(ID.l3), targetId: uuid(ID.g1_2_1), intent: 'inside' });
	});

	it('an expanded Group offers before and inside only: its bottom edge is inside', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });

		await drag(ID.l3, ID.g1, 0.85);
		expect(onmove).toHaveBeenCalledExactlyOnceWith({ dragId: uuid(ID.l3), targetId: uuid(ID.g1), intent: 'inside' });
	});

	it('a collapsed Group offers after again, and its hidden descendants are not targets', async () => {
		const onmove = vi.fn();
		const rows = openStore(tree()).rows.filter((r) => r.id !== uuid(ID.g1_1) && r.id !== uuid(ID.g1_2) && r.id !== uuid(ID.g1_2_1));
		render(BudgetSpreadsheet, { rows, currency: 'EUR', collapsed: new Set([uuid(ID.g1)]), onmove });

		expect(document.querySelectorAll('tbody tr')).toHaveLength(3);
		await drag(ID.l3, ID.g1, 0.85);
		expect(onmove).toHaveBeenCalledExactlyOnceWith({ dragId: uuid(ID.l3), targetId: uuid(ID.g1), intent: 'after' });
	});

	it('reports nothing when dropped outside the rows or on the dragged row itself', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });

		await userEvent.dragAndDrop(handle(ID.l3), page.elementLocator(document.body), { targetPosition: { x: 2, y: 2 } });
		await drag(ID.l3, ID.l3, 0.5);
		expect(onmove).not.toHaveBeenCalled();
	});

	it('never changes the Items itself', async () => {
		const store = openStore(tree());
		const items = store.items;
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: store.rows, currency: 'EUR', onmove });

		await drag(ID.l3, ID.g1_1, 0.5);
		expect(onmove).toHaveBeenCalledOnce();
		expect(store.items).toBe(items);
		expect(document.querySelectorAll('tbody tr')).toHaveLength(6);
	});

	it('is not draggable when no handler is given', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR' });
		expect(document.querySelector('tbody tr[draggable="true"], tbody td[draggable="true"]')).toBeNull();
	});

	it('does not duplicate listeners across rerenders, collapsing and Budget changes', async () => {
		const onmove = vi.fn();
		const store = openStore(tree());
		const screen = render(BudgetSpreadsheet, { rows: store.rows, currency: 'EUR', onmove });

		const visible = store.rows.filter((r) => r.id !== uuid(ID.g1_1) && r.id !== uuid(ID.g1_2) && r.id !== uuid(ID.g1_2_1));
		for (let i = 0; i < 3; i++) {
			await screen.rerender({ rows: visible, collapsed: new Set([uuid(ID.g1)]) }); // collapse
			await screen.rerender({ rows: store.rows, collapsed: new Set() }); // expand
		}
		const other = openStore([item(1, null), item(2, null)]).rows; // another Budget
		await screen.rerender({ rows: other });
		await screen.rerender({ rows: store.rows });

		await drag(ID.l3, ID.l2, 0.5);
		expect(onmove).toHaveBeenCalledOnce();
	});

	it('stops reporting after the editor is left', async () => {
		const first = vi.fn();
		const screen = render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: first });
		screen.unmount();

		const second = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: second });
		await drag(ID.l3, ID.l2, 0.5);

		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
	});
});
