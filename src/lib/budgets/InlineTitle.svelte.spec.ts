import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { createBudget } from '../budget/model';
import { CommandHistory } from '../history/commands';
import { BudgetStore } from '../state/budgets.svelte';
import InlineTitle from './InlineTitle.svelte';

const BUDGET = '11111111-1111-4111-8111-111111111111';

function open() {
	const store = new BudgetStore({ history: new CommandHistory(), now: () => new Date('2026-05-06T07:08:09.000Z') });
	store.hydrate();
	store.setBudget(createBudget({ id: BUDGET, name: 'Wedding', currency: 'EUR', now: new Date('2026-01-01T00:00:00.000Z') }), []);
	render(InlineTitle, { budgetId: BUDGET, store });
	return store;
}

const heading = (name = 'Wedding') => page.getByRole('heading', { name });
const field = () => page.getByLabelText('Budget name');
const pencil = () => page.getByRole('button', { name: 'Rename Budget' });
const name = (store: BudgetStore) => store.budgets[0].name;

describe('InlineTitle', () => {
	it('shows the name as a heading with a pencil button as the visible hint', async () => {
		open();
		await expect.element(heading()).toBeVisible();
		await expect.element(pencil()).toBeVisible();
		expect(pencil().element().textContent?.trim()).toBe('');
	});

	it('renames in place on double-click: Enter saves', async () => {
		const store = open();
		await heading().dblClick();
		await expect.element(field()).toHaveValue('Wedding');
		await expect.element(field()).toHaveFocus();
		await userEvent.fill(field(), '  Summer wedding ');
		await userEvent.keyboard('{Enter}');

		await expect.element(heading('Summer wedding')).toBeVisible();
		expect(name(store)).toBe('Summer wedding');
		expect(store.budgets[0].updatedAt).toBe('2026-05-06T07:08:09.000Z');
		await expect.element(pencil()).toHaveFocus();
	});

	it('is reachable from the keyboard through the pencil button', async () => {
		const store = open();
		pencil().element().focus();
		await userEvent.keyboard('{Enter}');
		await expect.element(field()).toHaveFocus();
		await userEvent.fill(field(), 'Via keyboard');
		await userEvent.keyboard('{Enter}');
		expect(name(store)).toBe('Via keyboard');
	});

	it('cancels with Escape and leaves the name alone', async () => {
		const store = open();
		await pencil().click();
		await userEvent.fill(field(), 'Not saved');
		await userEvent.keyboard('{Escape}');
		await expect.element(heading()).toBeVisible();
		expect(name(store)).toBe('Wedding');
		expect(store.budgets[0].updatedAt).toBe('2026-01-01T00:00:00.000Z');
	});

	it('saves when focus leaves the field', async () => {
		const store = open();
		await pencil().click();
		await userEvent.fill(field(), 'On blur');
		await userEvent.click(document.body);
		await expect.element(heading('On blur')).toBeVisible();
		expect(name(store)).toBe('On blur');
	});

	it('keeps an empty name editable with its message, and never saves it', async () => {
		const store = open();
		await pencil().click();
		await userEvent.fill(field(), '   ');
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByText('Enter a name for the Budget.')).toBeVisible();
		await expect.element(field()).toHaveAttribute('aria-invalid', 'true');
		await expect.element(field()).toHaveFocus();
		expect(name(store)).toBe('Wedding');

		await userEvent.fill(field(), 'Fixed');
		await expect.element(page.getByText('Enter a name for the Budget.')).not.toBeInTheDocument();
		await userEvent.keyboard('{Enter}');
		expect(name(store)).toBe('Fixed');
	});

	it('drops an invalid name when focus leaves, keeping the old one', async () => {
		const store = open();
		await pencil().click();
		await userEvent.fill(field(), '');
		await userEvent.click(document.body);
		await expect.element(heading()).toBeVisible();
		expect(name(store)).toBe('Wedding');
	});
});
