import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { contrastRatio, focusDocument, resetTheme, setTheme, type Theme } from '../testing/theme';
import Button from './Button.svelte';

afterEach(resetTheme);

describe('Button', () => {
	it('activates with Enter and Space from the keyboard', async () => {
		const onclick = vi.fn();
		render(Button, { children: textSnippet('Save'), onclick });

		await focusDocument(page);
		await userEvent.tab();
		await expect.element(page.getByRole('button', { name: 'Save' })).toHaveFocus();

		await userEvent.keyboard('{Enter}');
		await userEvent.keyboard(' ');
		expect(onclick).toHaveBeenCalledTimes(2);
	});

	it('does not activate when disabled', async () => {
		const onclick = vi.fn();
		render(Button, { children: textSnippet('Save'), onclick, disabled: true });

		const button = page.getByRole('button', { name: 'Save' });
		await expect.element(button).toBeDisabled();
		await button.click({ force: true }).catch(() => {});
		expect(onclick).not.toHaveBeenCalled();
	});

	it('shows a visible focus ring for keyboard focus', async () => {
		render(Button, { children: textSnippet('Save') });
		await focusDocument(page);
		await userEvent.tab();

		const style = getComputedStyle(page.getByRole('button', { name: 'Save' }).element());
		expect(style.outlineStyle).toBe('solid');
		expect(parseFloat(style.outlineWidth)).toBeGreaterThanOrEqual(2);
	});

	it.each<Theme>(['light', 'dark'])('keeps readable contrast for every variant in %s', async (theme) => {
		setTheme(theme);
		for (const variant of ['primary', 'secondary', 'destructive'] as const) {
			const { unmount } = render(Button, { variant, children: textSnippet(variant) });
			const style = getComputedStyle(page.getByRole('button', { name: variant }).element());
			expect(contrastRatio(style.color, style.backgroundColor), `${variant} (${theme})`).toBeGreaterThanOrEqual(4.5);
			unmount();
		}
	});
});

function textSnippet(text: string) {
	// Snippets are compiled by Svelte; a createRawSnippet keeps this test file plain TypeScript.
	return createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));
}
import { createRawSnippet } from 'svelte';
