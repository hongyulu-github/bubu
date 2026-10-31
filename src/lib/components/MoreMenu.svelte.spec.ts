import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import { focusDocument } from '../testing/theme';
import MoreMenu from './MoreMenu.svelte';

function items(onselect = vi.fn()) {
	return [
		{ id: 'rename', label: 'Rename', icon: 'pencil' as const, onselect },
		{ id: 'copy', label: 'Duplicate', icon: 'copy' as const, onselect: vi.fn() },
		{ id: 'delete', label: 'Delete', icon: 'trash' as const, destructive: true, separatorBefore: true, onselect: vi.fn() }
	];
}

const trigger = () => page.getByRole('button', { name: 'Actions for Wedding' });
const menu = () => page.getByRole('menu', { name: 'Actions for Wedding' });

describe('MoreMenu', () => {
	it('is one icon button with an accessible name that announces a menu', async () => {
		render(MoreMenu, { label: 'Actions for Wedding', items: items() });
		await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu');
		await expect.element(trigger()).toHaveAttribute('aria-expanded', 'false');
		expect(trigger().element().textContent?.trim()).toBe(''); // an icon, not a text button
	});

	it('opens a menu with focus on the first item, and runs the chosen action', async () => {
		const onselect = vi.fn();
		render(MoreMenu, { label: 'Actions for Wedding', items: items(onselect) });
		await trigger().click();
		await expect.element(menu()).toBeVisible();
		await expect.element(trigger()).toHaveAttribute('aria-expanded', 'true');
		await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();

		await page.getByRole('menuitem', { name: 'Rename' }).click();
		expect(onselect).toHaveBeenCalledOnce();
		await expect.element(menu()).not.toBeInTheDocument();
	});

	it('is fully keyboard operable: arrows move, Enter chooses, Escape closes and returns focus', async () => {
		const list = items();
		render(MoreMenu, { label: 'Actions for Wedding', items: list });
		await focusDocument(page);
		await userEvent.tab();
		await expect.element(trigger()).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();

		await userEvent.keyboard('{ArrowDown}');
		await expect.element(page.getByRole('menuitem', { name: 'Duplicate' })).toHaveFocus();
		await userEvent.keyboard('{ArrowDown}{ArrowDown}'); // wraps around
		await expect.element(page.getByRole('menuitem', { name: 'Rename' })).toHaveFocus();
		await userEvent.keyboard('{End}');
		await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
		await userEvent.keyboard('{Home}{ArrowUp}');
		await expect.element(page.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();

		await userEvent.keyboard('{Escape}');
		await expect.element(menu()).not.toBeInTheDocument();
		await expect.element(trigger()).toHaveFocus();

		await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
		expect(list[1].onselect).toHaveBeenCalledOnce();
	});

	it('closes when the button is pressed again, and when clicking elsewhere', async () => {
		render(MoreMenu, { label: 'Actions for Wedding', items: items() });
		await trigger().click();
		await expect.element(menu()).toBeVisible();
		await trigger().click();
		await expect.element(menu()).not.toBeInTheDocument();

		await trigger().click();
		await expect.element(menu()).toBeVisible();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await userEvent.click(document.body);
		await expect.element(menu()).not.toBeInTheDocument();
	});

	it('marks the destructive item and separates it from the others', async () => {
		render(MoreMenu, { label: 'Actions for Wedding', items: items() });
		await trigger().click();
		expect(menu().element().querySelectorAll('[role="separator"]')).toHaveLength(1);
		const del = page.getByRole('menuitem', { name: 'Delete' }).element();
		const normal = page.getByRole('menuitem', { name: 'Rename' }).element();
		expect(getComputedStyle(del).color).not.toBe(getComputedStyle(normal).color);
	});
});
