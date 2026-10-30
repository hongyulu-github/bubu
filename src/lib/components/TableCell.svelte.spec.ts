import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
import ReadonlyHost from './__fixtures__/ReadonlyHost.svelte';
import TableHost from './__fixtures__/TableHost.svelte';

afterEach(resetTheme);

describe('TableCell read-only, strong and depth', () => {
	it('tints read-only cells and flags them, leaving editable cells untinted', async () => {
		render(ReadonlyHost);
		const cells = [...document.querySelectorAll('td')];
		const [editable, readonly] = cells;
		expect(readonly.hasAttribute('data-readonly')).toBe(true);
		expect(editable.hasAttribute('data-readonly')).toBe(false);
		expect(getComputedStyle(editable).backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(getComputedStyle(readonly).backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
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
			const style = getComputedStyle(page.getByRole('cell', { name }).element());
			const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim();
			expect(surface).not.toBe('');
			expect(contrastRatio(style.color, resolveSurface(surface))).toBeGreaterThanOrEqual(4.5);
		}
	});
});

// Token values are hex strings; convert to rgb() for the contrast helper.
function resolveSurface(hex: string): string {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
