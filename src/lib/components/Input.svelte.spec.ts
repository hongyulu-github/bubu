import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
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
		await focusDocument(page);
		await userEvent.tab();
		const input = page.getByLabelText('Name');
		await expect.element(input).toHaveFocus();
		const style = getComputedStyle(input.element());
		expect(style.outlineStyle).toBe('solid');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it.each<Theme>(['light', 'dark'])('has readable text and a visible border in %s', async (theme) => {
		setTheme(theme);
		render(Input, { label: 'Name' });
		const style = getComputedStyle(page.getByLabelText('Name').element());
		expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(style.borderTopColor, style.backgroundColor)).toBeGreaterThanOrEqual(3);
	});
});
