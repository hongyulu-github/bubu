import { page, userEvent } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import BudgetSpreadsheet from '../budgets/BudgetSpreadsheet.svelte';
import { createBudget, createItem, type Item } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import { resetTheme, setTheme, type Theme } from '../testing/theme';

const BUDGET = '11111111-1111-4111-8111-111111111111';
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const item = (n: number, parent: number | null): Item =>
	createItem({ id: uuid(n), budgetId: BUDGET, parentId: parent === null ? null : uuid(parent), sortIndex: n, description: `Item ${n}`, unitPrice: '5', quantity: '1' });

// 1 (Group) > 1.1 (Line), 1.2 (Group) > 1.2.1 (Line); 5 and 6 are Lines.
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
const rowNumber = (tr: Element) => Number(tr.getAttribute('data-item-id')!.slice(-12));

interface Seen {
	row: number;
	kind: string;
	depth: string;
	/** Drawn with the level-change arrow instead of the dot. */
	out: boolean;
	/** What the marker looks like: enough to tell kinds apart, in the current theme. */
	look: string;
}

/** Record every drop marker that appears while a drag runs: the drag itself is too quick to sample. */
function watchMarkers() {
	const seen: Seen[] = [];
	const observer = new MutationObserver(() => {
		for (const tr of document.querySelectorAll<HTMLElement>('tbody tr[data-drop]')) {
			const cell = getComputedStyle(tr.querySelector('td')!);
			const look = [cell.backgroundImage, cell.backgroundSize, cell.backgroundPosition, cell.boxShadow, getComputedStyle(tr).outlineStyle, getComputedStyle(tr).opacity].join('|');
			seen.push({ row: rowNumber(tr), kind: tr.dataset.drop!, depth: tr.style.getPropertyValue('--drop-depth'), out: tr.hasAttribute('data-drop-out'), look });
		}
	});
	observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-drop', 'style'] });
	return { seen, stop: () => observer.disconnect() };
}

async function drag(from: number, onto: number, fraction: number, x = 300) {
	await userEvent.dragAndDrop(page.elementLocator(row(from).querySelector('[data-drag-handle]')!), page.elementLocator(row(onto)), {
		targetPosition: { x, y: row(onto).getBoundingClientRect().height * fraction }
	});
}
const markers = () => document.querySelectorAll('[data-drop]');

beforeEach(() => localStorage.clear());
afterEach(() => {
	localStorage.clear();
	resetTheme();
});

describe('drop indicators', () => {
	it('draw a before line, an after line and an inside box on the target row, then clear', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: vi.fn() });
		const watch = watchMarkers();

		await drag(ID.l3, ID.l2, 0.05);
		await drag(ID.l3, ID.l2, 0.5);
		await drag(ID.l3, ID.l2, 0.85);
		watch.stop();

		for (const kind of ['before', 'inside', 'after']) {
			expect(watch.seen.some((s) => s.kind === kind && s.row === ID.l2)).toBe(true);
		}
		expect(watch.seen.every((s) => s.row === ID.l2)).toBe(true); // never on another row
		expect(markers()).toHaveLength(0);
	});

	it('are told apart by more than colour, in light and dark mode', async () => {
		for (const theme of ['light', 'dark'] as Theme[]) {
			setTheme(theme);
			const screen = render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: vi.fn() });
			const watch = watchMarkers();
			await drag(ID.l3, ID.l2, 0.05);
			await drag(ID.l3, ID.l2, 0.5);
			await drag(ID.l3, ID.l2, 0.85);
			await drag(ID.g1, ID.g1_1, 0.5); // not allowed
			watch.stop();

			const looks = new Map(watch.seen.map((s) => [s.kind, s.look]));
			expect([...looks.keys()].sort()).toEqual(['after', 'before', 'blocked', 'inside']);
			expect(new Set(looks.values()).size).toBe(4); // four different looks
			screen.unmount();
		}
	});

	it('put the line at the indent of the level the Item would land on', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: vi.fn() });
		const watch = watchMarkers();

		// 1.2.1 is the last row of Groups 1.2 and 1: left of it means after one of them.
		await drag(ID.l3, ID.g1_2_1, 0.85, 8); // after Group 1 (level 0)
		await drag(ID.l3, ID.g1_2_1, 0.85, 40); // after Group 1.2 (level 1)
		watch.stop();

		// Both lines sit below the Group's last visible row, at the Group's own depth.
		const after = watch.seen.filter((s) => s.kind === 'after');
		expect(after.map((s) => [s.row, s.depth])).toEqual(expect.arrayContaining([[ID.g1_2_1, '0'], [ID.g1_2_1, '1']]));
		expect(markers()).toHaveLength(0);
	});

	it('use a level-change arrow only for a drop that steps out past deeper rows', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: vi.fn() });
		const watch = watchMarkers();

		await drag(ID.l3, ID.g1_2_1, 0.85, 8); // after Group 1, below its subtree: a level change
		const stepOut = watch.seen.filter((s) => s.kind === 'after');
		await drag(ID.l3, ID.l2, 0.85); // a plain sibling drop
		await drag(ID.l3, ID.l2, 0.05);
		watch.stop();

		expect(stepOut.length).toBeGreaterThan(0);
		expect(stepOut.every((s) => s.out)).toBe(true);
		expect(watch.seen.filter((s) => s.row === ID.l2).every((s) => !s.out)).toBe(true);
	});

	it('mark a drop on the dragged row\'s own descendant as not allowed, never as a valid drop', async () => {
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove: vi.fn() });
		const watch = watchMarkers();

		for (const fraction of [0.05, 0.5, 0.85]) {
			await drag(ID.g1, ID.g1_1, fraction);
			await drag(ID.g1, ID.g1_2_1, fraction, 300);
		}
		watch.stop();

		expect(watch.seen.length).toBeGreaterThan(0);
		expect(watch.seen.every((s) => s.kind === 'blocked')).toBe(true);
		expect(markers()).toHaveLength(0);
	});

	it('show nothing over the dragged row itself or outside the rows, and leave nothing behind', async () => {
		const onmove = vi.fn();
		render(BudgetSpreadsheet, { rows: openStore(tree()).rows, currency: 'EUR', onmove });
		const watch = watchMarkers();

		await drag(ID.l3, ID.l3, 0.5);
		await userEvent.dragAndDrop(page.elementLocator(row(ID.l3).querySelector('[data-drag-handle]')!), page.elementLocator(document.body), {
			targetPosition: { x: 2, y: 2 }
		});
		watch.stop();

		expect(watch.seen).toEqual([]);
		expect(onmove).not.toHaveBeenCalled();
		expect(markers()).toHaveLength(0);
	});

	it('do not survive the table being replaced or no longer accepting moves', async () => {
		const store = openStore(tree());
		const screen = render(BudgetSpreadsheet, { rows: store.rows, currency: 'EUR', onmove: vi.fn() });
		await drag(ID.l3, ID.l2, 0.5);
		await screen.rerender({ rows: openStore([item(1, null), item(5, null)]).rows });
		await screen.rerender({ onmove: undefined });
		expect(markers()).toHaveLength(0);
		screen.unmount();
		expect(markers()).toHaveLength(0);
	});
});
