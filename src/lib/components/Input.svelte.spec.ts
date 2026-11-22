import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css'; // the page background the input sits on, so a transparent input is measured against it
import { contrastRatio, effectiveBackground, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
import Input from './Input.svelte';

afterEach(resetTheme);

describe('Input', () => {
	it('is labelled and accepts typing', async () => {
		render(Input, { label: 'Name' });
		const input = page.getByLabelText('Name');
		await input.fill('Groceries');
		await expect.element(input).toHaveValue('Groceries');
	});

	it('exposes hint, error and invalid state to assistive technology', async () => {
		render(Input, { label: 'Name', hint: 'Shown in the list', error: 'Name is required' });
		const input = page.getByLabelText('Name');
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(input).toHaveAccessibleDescription('Shown in the list Name is required');
	});

	it('can be disabled', async () => {
		render(Input, { label: 'Name', disabled: true });
		await expect.element(page.getByLabelText('Name')).toBeDisabled();
	});

	it('shows a visible focus ring for keyboard focus', async () => {
		render(Input, { label: 'Name' });
		const idle = getComputedStyle(page.getByLabelText('Name').element()).borderTopColor;
		await focusDocument(page);
		await userEvent.tab();
		const input = page.getByLabelText('Name');
		await expect.element(input).toHaveFocus();
		const style = getComputedStyle(input.element());
		// Flowbite shows focus as a ring or a change of border colour, not an outline.
		expect(style.boxShadow !== 'none' || style.borderTopColor !== idle).toBe(true);
	});

	it.each<Theme>(['light', 'dark'])('has readable text and a visible border in %s', async (theme) => {
		setTheme(theme);
		render(Input, { label: 'Name' });
		const element = page.getByLabelText('Name').element();
		const style = getComputedStyle(element);
		const behind = effectiveBackground(element);
		expect(contrastRatio(style.color, behind)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(style.borderTopColor, behind)).toBeGreaterThanOrEqual(3);
	});

	it.each<Theme>(['light', 'dark'])('a compact input shows its border only on hover in %s', async (theme) => {
		setTheme(theme);
		render(Input, { label: 'Cell', compact: true });
		const locator = page.getByLabelText('Cell');
		expect(getComputedStyle(locator.element()).borderTopColor).toBe('rgba(0, 0, 0, 0)');
		await locator.hover();
		expect(getComputedStyle(locator.element()).borderTopColor).not.toBe('rgba(0, 0, 0, 0)');
	});

	it('has no background of its own in dark mode', async () => {
		setTheme('dark');
		render(Input, { label: 'Name' });
		expect(getComputedStyle(page.getByLabelText('Name').element()).backgroundColor).toBe('rgba(0, 0, 0, 0)');
	});
});
