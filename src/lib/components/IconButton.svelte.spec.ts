import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { focusDocument } from '../testing/theme';
import IconButton from './IconButton.svelte';

const button = (name = 'Undo') => page.getByRole('button', { name });
const tip = () => document.querySelector<HTMLElement>('.tip')!;
const tipShown = () => tip().matches(':popover-open');

describe('IconButton', () => {
	it('is an icon with an accessible name, not a text button', async () => {
		render(IconButton, { icon: 'undo', label: 'Undo' });
		await expect.element(button()).toBeVisible();
		expect(button().element().textContent?.trim()).toBe('');
		expect(button().element().querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
	});

	it('activates from the keyboard and not when disabled', async () => {
		const onclick = vi.fn();
		const { rerender } = render(IconButton, { icon: 'undo', label: 'Undo', onclick });
		await focusDocument(page);
		await userEvent.tab();
		await expect.element(button()).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		await userEvent.keyboard(' ');
		expect(onclick).toHaveBeenCalledTimes(2);

		await rerender({ icon: 'undo', label: 'Undo', onclick, disabled: true });
		await expect.element(button()).toBeDisabled();
	});

	it('passes other attributes to the real button, such as the keyboard shortcut', async () => {
		render(IconButton, { icon: 'undo', label: 'Undo', 'aria-keyshortcuts': 'Control+Z Meta+Z' });
		await expect.element(button()).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
	});

	it('shows a tooltip with the label and shortcut on keyboard focus, and Escape dismisses it', async () => {
		render(IconButton, { icon: 'undo', label: 'Undo', shortcut: '⌘Z' });
		expect(tipShown()).toBe(false);
		await focusDocument(page);
		await userEvent.tab();
		await vi.waitFor(() => expect(tipShown()).toBe(true));
		expect(tip().textContent).toContain('Undo');
		expect(tip().textContent).toContain('⌘Z');
		expect(tip().getAttribute('aria-hidden')).toBe('true'); // the name is on the button: no double announcement

		await userEvent.keyboard('{Escape}');
		expect(tipShown()).toBe(false);
	});

	it('shows the tooltip on hover after a short delay and hides it on leaving', async () => {
		render(IconButton, { icon: 'trash', label: 'Delete 1', destructive: true });
		await button('Delete 1').hover();
		expect(tipShown()).toBe(false); // not instantly: hovering across a toolbar stays quiet
		await vi.waitFor(() => expect(tipShown()).toBe(true));
		await page.getByRole('button', { name: 'Delete 1' }).unhover?.();
		await userEvent.hover(document.body);
		await vi.waitFor(() => expect(tipShown()).toBe(false));
	});

	it('keeps the tooltip on screen next to the button', async () => {
		render(IconButton, { icon: 'undo', label: 'Undo' });
		await button().hover();
		await vi.waitFor(() => expect(tipShown()).toBe(true));
		const box = tip().getBoundingClientRect();
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.right).toBeLessThanOrEqual(window.innerWidth);
		expect(box.top).toBeGreaterThanOrEqual(0);
	});
});
