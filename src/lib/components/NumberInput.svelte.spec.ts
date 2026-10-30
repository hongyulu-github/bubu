import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, resetTheme, setTheme, type Theme } from '../testing/theme';
import NumberInput from './NumberInput.svelte';

afterEach(resetTheme);

describe('NumberInput', () => {
	it('emits the text on every keystroke and the parse result on change', async () => {
		const oninput = vi.fn();
		const onchange = vi.fn();
		render(NumberInput, { label: 'Amount', oninput, onchange });

		const input = page.getByLabelText('Amount');
		await input.fill('12.50');
		expect(oninput).toHaveBeenLastCalledWith('12.50');

		input.element().blur();
		expect(onchange).toHaveBeenCalledOnce();
		expect(onchange.mock.calls[0][0]).toBe('12.50');
		expect(onchange.mock.calls[0][1]).toEqual({ ok: true, value: { coefficient: 1250n, scale: 2 } });
	});

	it('keeps every digit: precision beyond a double survives as text', async () => {
		const onchange = vi.fn();
		render(NumberInput, { label: 'Amount', onchange });
		await page.getByLabelText('Amount').fill('0.1000000000000000055511151231257827');
		page.getByLabelText('Amount').element().blur();
		expect(onchange.mock.calls[0][0]).toBe('0.1000000000000000055511151231257827');
	});

	it('shows an error for text that is not a number', async () => {
		render(NumberInput, { label: 'Amount' });
		const input = page.getByLabelText('Amount');
		await input.fill('abc');
		input.element().blur();
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(page.getByText('Enter a valid number.')).toBeVisible();
	});

	it('rejects a blank value', async () => {
		render(NumberInput, { label: 'Amount', value: '5' });
		const input = page.getByLabelText('Amount');
		await input.fill('');
		input.element().blur();
		await expect.element(page.getByText('Enter a number.')).toBeVisible();
	});

	it('accepts negatives as an amount and rejects them as a quantity', async () => {
		render(NumberInput, { label: 'Amount' });
		const amount = page.getByLabelText('Amount');
		await amount.fill('-12.5');
		amount.element().blur();
		await expect.element(amount).not.toHaveAttribute('aria-invalid');

		render(NumberInput, { label: 'Quantity', kind: 'quantity' });
		const quantity = page.getByLabelText('Quantity');
		await quantity.fill('-1');
		quantity.element().blur();
		await expect.element(quantity).toHaveAttribute('aria-invalid', 'true');
		await expect.element(page.getByText('Quantity cannot be negative.')).toBeVisible();
	});

	it('does not start in an error state', async () => {
		render(NumberInput, { label: 'Amount', value: '' });
		await expect.element(page.getByLabelText('Amount')).not.toHaveAttribute('aria-invalid');
	});

	it('shows the initial value and an external error', async () => {
		render(NumberInput, { label: 'Amount', value: '42', error: 'Total does not match' });
		const input = page.getByLabelText('Amount');
		await expect.element(input).toHaveValue('42');
		await expect.element(input).toHaveAttribute('aria-invalid', 'true');
		await expect.element(page.getByText('Total does not match')).toBeVisible();
	});

	it('right-aligns the value', async () => {
		render(NumberInput, { label: 'Amount', value: '1' });
		expect(getComputedStyle(page.getByLabelText('Amount').element()).textAlign).toBe('end');
	});

	it('can hide its label visually while keeping the accessible name', async () => {
		render(NumberInput, { label: 'Quantity 1.2', hideLabel: true, compact: true });
		const label = document.querySelector('label')!;
		expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(1);
		await expect.element(page.getByLabelText('Quantity 1.2')).toBeVisible();
	});

	it.each<Theme>(['light', 'dark'])('is readable in %s', async (theme) => {
		setTheme(theme);
		render(NumberInput, { label: 'Amount', value: '1' });
		const style = getComputedStyle(page.getByLabelText('Amount').element());
		expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
	});
});
