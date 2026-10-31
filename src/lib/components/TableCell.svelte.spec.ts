import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { contrastRatio, effectiveBackground, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
import ReadonlyHost from './__fixtures__/ReadonlyHost.svelte';
import TableHost from './__fixtures__/TableHost.svelte';

afterEach(resetTheme);

describe('TableCell read-only, strong and depth', () => {
	it('flags read-only cells without any fill: a muted colour and a plain cursor tell them apart', async () => {
		render(ReadonlyHost);
		const [editable, readonly] = [...document.querySelectorAll('td')];
		expect(readonly.hasAttribute('data-readonly')).toBe(true);
		expect(editable.hasAttribute('data-readonly')).toBe(false);
		expect(getComputedStyle(editable).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(getComputedStyle(readonly).backgroundColor).toBe('rgba(0, 0, 0, 0)'); // the same background as every cell
		expect(getComputedStyle(readonly).color).not.toBe(getComputedStyle(editable).color);
		expect(getComputedStyle(editable).cursor).toBe('text');
		expect(getComputedStyle(readonly).cursor).toBe('default');
		expect(readonly.querySelector('input, button, select, textarea')).toBeNull();
	});

	it('makes strong cells heavier and indents by depth up to a maximum', async () => {
		render(ReadonlyHost);
		const [plain, , strongCell, shallow, deep, deeper] = [...document.querySelectorAll('td')];
		expect(parseInt(getComputedStyle(strongCell).fontWeight)).toBeGreaterThan(parseInt(getComputedStyle(plain).fontWeight));
		const indent = (cell: Element) => parseFloat(getComputedStyle(cell).paddingInlineStart);
		expect(indent(deep)).toBeGreaterThan(indent(shallow));
		expect(indent(deeper)).toBe(indent(deep)); // depth 40 is indented no further than depth 20
	});
});

describe('TableCell', () => {
	it('renders headers and data cells with table semantics', async () => {
		render(TableHost);
		await expect.element(page.getByRole('columnheader', { name: 'Item' })).toBeVisible();
		await expect.element(page.getByRole('cell', { name: 'Rent' })).toBeVisible();
		await expect.element(page.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('scope', 'col');
	});

	it('right-aligns numeric cells and flags invalid ones', async () => {
		render(TableHost);
		const amount = page.getByRole('cell', { name: '1200.50' }).element();
		expect(getComputedStyle(amount).textAlign).toBe('end');
		await expect.element(page.getByRole('cell', { name: 'abc' })).toHaveAttribute('aria-invalid', 'true');
	});

	it('shows a visible focus ring on focusable cells', async () => {
		render(TableHost);
		await focusDocument(page);
		await userEvent.tab();
		const cell = page.getByRole('cell', { name: '1200.50' });
		await expect.element(cell).toHaveFocus();
		expect(getComputedStyle(cell.element()).outlineStyle).toBe('solid');
	});

	it.each<Theme>(['light', 'dark'])('is readable in %s', async (theme) => {
		setTheme(theme);
		render(TableHost);
		for (const name of ['Rent', '1200.50']) {
			const cell = page.getByRole('cell', { name }).element();
			expect(contrastRatio(getComputedStyle(cell).color, effectiveBackground(cell))).toBeGreaterThanOrEqual(4.5);
		}
	});
});
