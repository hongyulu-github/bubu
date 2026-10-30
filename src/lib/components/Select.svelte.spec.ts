import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
import Select from './Select.svelte';

afterEach(resetTheme);

const options = [
	{ value: 'EUR', label: 'Euro' },
	{ value: 'USD', label: 'US dollar' }
];

describe('Select', () => {
	it('is labelled, offers a placeholder and lets the user choose', async () => {
		render(Select, { label: 'Currency', options, placeholder: 'Choose a currency' });
		const select = page.getByLabelText('Currency');
		await expect.element(select).toHaveValue('');
		await select.selectOptions('USD');
		await expect.element(select).toHaveValue('USD');
	});

	it('exposes hint, error and invalid state to assistive technology', async () => {
		render(Select, { label: 'Currency', options, hint: 'Used for totals', error: 'Choose a currency.' });
		const select = page.getByLabelText('Currency');
		await expect.element(select).toHaveAttribute('aria-invalid', 'true');
		await expect.element(select).toHaveAccessibleDescription('Used for totals Choose a currency.');
	});

	it('can be disabled', async () => {
		render(Select, { label: 'Currency', options, disabled: true });
		await expect.element(page.getByLabelText('Currency')).toBeDisabled();
	});

	it('shows a visible focus ring for keyboard focus', async () => {
		render(Select, { label: 'Currency', options });
		await focusDocument(page);
		await userEvent.tab();
		const select = page.getByLabelText('Currency');
		await expect.element(select).toHaveFocus();
		const style = getComputedStyle(select.element());
		expect(style.outlineStyle).toBe('solid');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it.each<Theme>(['light', 'dark'])('has readable text and a visible border in %s', async (theme) => {
		setTheme(theme);
		render(Select, { label: 'Currency', options });
		const style = getComputedStyle(page.getByLabelText('Currency').element());
		expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio(style.borderTopColor, style.backgroundColor)).toBeGreaterThanOrEqual(3);
	});
});
