import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, resetTheme, setTheme, type Theme } from '../testing/theme';
import DialogHost from './__fixtures__/DialogHost.svelte';

afterEach(resetTheme);

describe('Dialog', () => {
	it('is hidden until opened, then moves focus inside', async () => {
		render(DialogHost);
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();

		await page.getByRole('button', { name: 'Open dialog' }).click();

		const dialog = page.getByRole('dialog', { name: 'Rename budget' });
		await expect.element(dialog).toBeVisible();
		await expect.element(dialog).toHaveAccessibleDescription('Choose a new name.');
		expect(dialog.element().contains(document.activeElement)).toBe(true);
	});

	it('closes on Escape, calls oncancel and returns focus to the opener', async () => {
		const oncancel = vi.fn();
		render(DialogHost, { oncancel });
		const opener = page.getByRole('button', { name: 'Open dialog' });
		await opener.click();
		await expect.element(page.getByRole('dialog')).toBeVisible();

		await userEvent.keyboard('{Escape}');

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		expect(oncancel).toHaveBeenCalledOnce();
		await expect.element(opener).toHaveFocus();
	});

	it('closes from the Cancel button and returns focus to the opener', async () => {
		render(DialogHost);
		const opener = page.getByRole('button', { name: 'Open dialog' });
		await opener.click();

		await page.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
		await expect.element(opener).toHaveFocus();
	});

	it('keeps keyboard focus away from the page behind while open', async () => {
		render(DialogHost);
		const opener = page.getByRole('button', { name: 'Open dialog' });
		await opener.click();
		const dialog = page.getByRole('dialog').element();

		const reached = new Set<string>();
		for (let i = 0; i < 6; i++) {
			await userEvent.tab();
			expect(document.activeElement).not.toBe(opener.element());
			if (dialog.contains(document.activeElement)) {
				reached.add(document.activeElement?.textContent?.trim() || document.activeElement?.tagName || '');
			}
		}
		// The dialog's own controls are reachable by keyboard.
		expect(reached.has('Cancel')).toBe(true);
		expect(reached.has('Save')).toBe(true);
	});

	it.each<Theme>(['light', 'dark'])('is readable in %s', async (theme) => {
		setTheme(theme);
		render(DialogHost);
		await page.getByRole('button', { name: 'Open dialog' }).click();
		const style = getComputedStyle(page.getByRole('dialog').element());
		expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
	});
});
