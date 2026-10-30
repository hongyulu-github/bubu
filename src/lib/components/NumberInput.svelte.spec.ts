import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, resetTheme, setTheme, type Theme } from '../testing/theme';
import NumberInput from './NumberInput.svelte';

afterEach(resetTheme);

describe('NumberInput', () => {
	it('emits the parsed number on input and on change', async () => {
		const oninput = vi.fn();
		const onchange = vi.fn();
		render(NumberInput, { label: 'Amount', oninput, onchange });

		const input = page.getByLabelText('Amount');
		await input.fill('12.5');
		expect(oninput).toHaveBeenLastCalledWith(12.5, '12.5');

		await input.element().blur();
		expect(onchange).toHaveBeenLastCalledWith(12.5, '12.5');
	});

	it('emits null and shows an error for text that is not a number', async () => {
		const oninput = vi.fn();
		render(NumberInput, { label: 'Amount', oninput });

		const input = page.getByLabelText('Amount');
		await input.fill('abc');
		input.element().blur();

		expect(oninput).toHaveBeenLastCalledWith(null, 'abc');
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
	});

	it('validates min and max', async () => {
		render(NumberInput, { label: 'Amount', min: 0, max: 100 });
		const input = page.getByLabelText('Amount');

		await input.fill('-1');
		input.element().blur();
		await expect.element(page.getByText('Must be at least 0.')).toBeVisible();

		await input.fill('101');
		await expect.element(page.getByText('Must be at most 100.')).toBeVisible();

		await input.fill('50');
		await expect.element(input).not.toHaveAttribute('aria-invalid');
	});

	it('requires a value only when required', async () => {
		render(NumberInput, { label: 'Amount', required: true });
		const input = page.getByLabelText('Amount');
		await input.fill('5');
		await input.fill('');
		input.element().blur();
		await expect.element(page.getByText('Enter a number.')).toBeVisible();
	});

	it('does not start in an error state', async () => {
		render(NumberInput, { label: 'Amount', required: true });
		await expect.element(page.getByLabelText('Amount')).not.toHaveAttribute('aria-invalid');
	});

	it('shows the initial value and an external error', async () => {
		render(NumberInput, { label: 'Amount', value: 42, error: 'Total does not match' });
		const input = page.getByLabelText('Amount');
		await expect.element(input).toHaveValue('42');
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
	});

	it.each<Theme>(['light', 'dark'])('is readable in %s', async (theme) => {
		setTheme(theme);
		render(NumberInput, { label: 'Amount', value: 1 });
		const style = getComputedStyle(page.getByLabelText('Amount').element());
		expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
	});
});
