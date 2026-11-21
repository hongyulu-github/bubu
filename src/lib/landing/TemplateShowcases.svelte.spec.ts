import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { deriveCodes } from '../budget/tree';
import { createItem } from '../budget/model';
import { homeRenovationTemplate, travelTemplate, weddingTemplate, type BudgetTemplate } from '../templates/templates';
import { DEMO_MOVES, EXAMPLE_AMOUNTS } from './showcase-demo';
import ShowcaseBelowFold from '../components/__fixtures__/ShowcaseBelowFold.svelte';
import TemplateShowcase from './TemplateShowcase.svelte';
import TemplateShowcases from './TemplateShowcases.svelte';

afterEach(() => vi.restoreAllMocks());

const rowsOf = () => [...document.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent!.trim()));
const expected = (template: BudgetTemplate) => {
	const codes = deriveCodes(template.items.map((item) => createItem({ ...item, budgetId: template.id })));
	return [...template.items].map((item) => [codes.get(item.id)!, item.description, item.unit ?? '']);
};

describe.each([weddingTemplate, homeRenovationTemplate, travelTemplate])('showcase of the $name template', (template) => {
	it('shows every Item with its Code, Description and Unit, and, with no example amounts, every Total as 0.00 (static)', async () => {
		render(TemplateShowcase, { template, onuse: vi.fn(), reducedMotion: true });
		await expect.element(page.getByRole('heading', { name: template.name })).toBeVisible();
		const rows = rowsOf();
		expect(rows).toHaveLength(template.items.length);
		expect(rows.map((cells) => cells.slice(0, 3)).sort()).toEqual(expected(template).sort());
		expect(rows.every((cells) => cells[3] === '1' && cells[4] === '0.00' && cells[5] === '0.00')).toBe(true);
	});

	it('emits its template identifier from the one Use template button', async () => {
		const onuse = vi.fn();
		render(TemplateShowcase, { template, onuse, reducedMotion: true });
		await page.getByRole('button', { name: `Use template: ${template.name}` }).click();
		expect(onuse).toHaveBeenCalledExactlyOnceWith(template.id);
		expect(page.getByRole('button', { name: /use template/i }).elements()).toHaveLength(1);
	});

	it('is read only: no fields, nothing saved, and the template is untouched', async () => {
		const save = vi.spyOn(Storage.prototype, 'setItem');
		const before = JSON.stringify(template);
		render(TemplateShowcase, { template, onuse: vi.fn(), reducedMotion: false });
		await vi.waitFor(() => expect(document.querySelector('[data-rolling]')).not.toBeNull(), { timeout: 8000 });
		expect(document.querySelectorAll('input, select, textarea, [contenteditable]')).toHaveLength(0);
		expect(save).not.toHaveBeenCalled();
		expect(JSON.stringify(template)).toBe(before);
	});
});

describe('the animation', () => {
	it('builds the hierarchy up Item by Item, then lights a Group with the Items it adds up', async () => {
		render(TemplateShowcase, { template: weddingTemplate, onuse: vi.fn(), reducedMotion: false });
		await vi.waitFor(() => expect(rowsOf().length).toBeGreaterThan(0));
		expect(rowsOf().length).toBeLessThan(weddingTemplate.items.length); // still revealing
		await vi.waitFor(() => expect(rowsOf()).toHaveLength(weddingTemplate.items.length), { timeout: 8000 });
		await vi.waitFor(() => expect(document.querySelector('[data-rolling="receives"]')).not.toBeNull(), { timeout: 3000 });
		expect(document.querySelectorAll('[data-rolling="feeds"]').length).toBeGreaterThan(0);
	});

	it('with reduced motion shows everything at once and never animates or highlights', async () => {
		render(TemplateShowcase, { template: homeRenovationTemplate, onuse: vi.fn(), reducedMotion: true });
		expect(rowsOf()).toHaveLength(homeRenovationTemplate.items.length); // on the first frame
		await new Promise((resolve) => setTimeout(resolve, 1200));
		expect(document.querySelector('[data-rolling]')).toBeNull();
		expect(rowsOf()).toHaveLength(homeRenovationTemplate.items.length);
	});
});

describe('the carousel', () => {
	it('shows the Wedding first, moves to Home renovation and back, each through the same showcase', async () => {
		const onuse = vi.fn();
		render(TemplateShowcases, { onuse, reducedMotion: true });
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await expect.element(page.getByText('1 of 3')).toBeVisible();

		await page.getByRole('button', { name: 'Next template' }).click();
		await expect.element(page.getByRole('heading', { name: 'Home renovation' })).toBeVisible();
		expect(page.getByRole('heading', { name: 'Wedding' }).elements()).toHaveLength(0);
		await page.getByRole('button', { name: 'Use template: Home renovation' }).click();
		expect(onuse).toHaveBeenLastCalledWith('home-renovation');

		await userEvent.keyboard('{Tab}');
		await page.getByRole('button', { name: 'Next template' }).click();
		await expect.element(page.getByRole('heading', { name: 'Travel' })).toBeVisible();
		await page.getByRole('button', { name: 'Use template: Travel' }).click();
		expect(onuse).toHaveBeenLastCalledWith('travel');

		await page.getByRole('button', { name: 'Next template' }).click(); // wraps round
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await page.getByRole('button', { name: 'Previous template' }).click();
		await page.getByRole('button', { name: 'Next template' }).click();
		await expect.element(page.getByRole('heading', { name: 'Wedding' })).toBeVisible();
		await page.getByRole('button', { name: 'Use template: Wedding' }).click();
		expect(onuse).toHaveBeenLastCalledWith('wedding');
	});

	it('is a labelled carousel region whose slide is announced as "n of 3"', async () => {
		render(TemplateShowcases, { onuse: vi.fn(), reducedMotion: true });
		await expect.element(page.getByRole('region', { name: 'Starter templates' })).toBeVisible();
		await expect.element(page.getByRole('group', { name: '1 of 3' })).toBeVisible();
	});
});

describe('example amounts and the drag demonstration', () => {
	const amountsOf = (template: BudgetTemplate) => EXAMPLE_AMOUNTS[template.id];
	const totalOf = (description: string) => {
		const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.querySelectorAll('td')[1].textContent!.trim() === description)!;
		return Number(row.querySelectorAll('td')[5].textContent!.replace(/,/g, ''));
	};

	it('has example amounts for every Line of every template, and none for Groups', () => {
		for (const template of [weddingTemplate, homeRenovationTemplate, travelTemplate]) {
			const parents = new Set(template.items.map((item) => item.parentId));
			const lines = template.items.filter((item) => !parents.has(item.id)).map((item) => item.id);
			expect(Object.keys(amountsOf(template)).sort()).toEqual([...lines].sort());
			expect(DEMO_MOVES[template.id]).toBeDefined();
		}
	});

	it('rolls the example amounts up: a Group is the sum of what is inside it', async () => {
		render(TemplateShowcase, { template: weddingTemplate, onuse: vi.fn(), amounts: amountsOf(weddingTemplate), reducedMotion: true });
		expect(totalOf('Venue hire')).toBe(2500);
		expect(totalOf('Tables and chairs')).toBe(240);
		expect(totalOf('Venue')).toBe(2500 + 800 + 240);
		expect(totalOf('Main course')).toBe(28 * 80);
		await expect.element(page.getByText('Example amounts, for illustration only.')).toBeVisible();
	});

	it('acts out one drag and drop: a copy of the row lifts, a line shows the drop, then the Item sits in its new Group', async () => {
		const save = vi.spyOn(Storage.prototype, 'setItem');
		const before = JSON.stringify(weddingTemplate);
		render(TemplateShowcase, { template: weddingTemplate, onuse: vi.fn(), amounts: amountsOf(weddingTemplate), move: DEMO_MOVES.wedding, reducedMotion: false });
		await vi.waitFor(() => expect(document.querySelector('[data-drag-ghost]')).not.toBeNull(), { timeout: 12000 });
		expect(document.querySelector('[data-drag-ghost]')!.textContent).toContain('Invitations');
		await vi.waitFor(() => expect(document.querySelector('[data-drop-line]')).not.toBeNull());
		const venueBefore = totalOf('Venue');
		await vi.waitFor(() => expect(document.querySelector('[data-landed]')).not.toBeNull(), { timeout: 4000 });
		const landed = document.querySelector('[data-landed]')!;
		expect(landed.querySelectorAll('td')[0].textContent!.trim()).toBe('1.4'); // now the fourth Item inside Venue
		expect(totalOf('Venue')).toBe(venueBefore + 270); // and Venue adds it up
		expect(document.querySelector('[data-drag-ghost]')).toBeNull();
		expect(save).not.toHaveBeenCalled();
		expect(JSON.stringify(weddingTemplate)).toBe(before);
	});

	it('with reduced motion there is no dragged copy and the original order stays', async () => {
		render(TemplateShowcase, { template: weddingTemplate, onuse: vi.fn(), amounts: amountsOf(weddingTemplate), move: DEMO_MOVES.wedding, reducedMotion: true });
		await new Promise((resolve) => setTimeout(resolve, 1500));
		expect(document.querySelector('[data-drag-ghost], [data-drop-line], [data-landed]')).toBeNull();
		expect(rowsOf().at(-1)![1]).toBe('Invitations');
	});
});

describe('lazy start and following the reveal', () => {
	it('draws and times nothing until the showcase is on screen, then starts', async () => {
		await page.viewport(1000, 500);
		render(ShowcaseBelowFold);
		await new Promise((resolve) => setTimeout(resolve, 800));
		expect(rowsOf()).toHaveLength(0); // below the fold: not drawn, not animating
		expect(document.getAnimations()).toHaveLength(0);
		window.scrollTo(0, document.documentElement.scrollHeight);
		await vi.waitFor(() => expect(rowsOf().length).toBeGreaterThan(0), { timeout: 4000 });
	});

	it('scrolls the page down after the newest row while the rows are being generated', async () => {
		await page.viewport(1000, 400); // far shorter than the table, so it must follow
		render(TemplateShowcase, { template: homeRenovationTemplate, onuse: vi.fn(), reducedMotion: false });
		await vi.waitFor(() => expect(rowsOf()).toHaveLength(homeRenovationTemplate.items.length), { timeout: 8000 });
		await vi.waitFor(() => expect(window.scrollY).toBeGreaterThan(0));
		await vi.waitFor(() => expect([...document.querySelectorAll('tbody tr')].at(-1)!.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 2));
	});

	it('leaves the page alone for static presentation', async () => {
		await page.viewport(1000, 400);
		render(TemplateShowcase, { template: homeRenovationTemplate, onuse: vi.fn(), reducedMotion: true });
		await new Promise((resolve) => setTimeout(resolve, 600));
		expect(window.scrollY).toBe(0);
	});
});
