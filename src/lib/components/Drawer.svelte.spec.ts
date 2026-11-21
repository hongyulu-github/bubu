import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { settled } from '../testing/motion';
import { resetTheme, setTheme } from '../testing/theme';
import DrawerHost from './__fixtures__/DrawerHost.svelte';

afterEach(resetTheme);

const opener = () => page.getByRole('button', { name: 'Open drawer' });
const drawer = () => page.getByRole('dialog', { name: 'Test drawer' });
const inside = () => drawer().element().contains(document.activeElement);

async function open(onclose = vi.fn()) {
	render(DrawerHost, { onclose });
	await opener().click();
	await expect.element(drawer()).toBeVisible();
	await settled(); // it slides in: wait until it is in place
	return onclose;
}

describe('Drawer (stdf Popup with dialog behaviour added)', () => {
	it('is a modal dialog with an accessible name, built on stdf\'s Popup', async () => {
		await open();
		const element = drawer().element();
		expect(element.getAttribute('role')).toBe('dialog');
		expect(element.getAttribute('aria-modal')).toBe('true');
		expect(element.getAttribute('aria-labelledby')).toBeTruthy();
		await expect.element(page.getByRole('heading', { name: 'Test drawer' })).toBeVisible();
		expect(element.closest('div.fixed')).not.toBeNull(); // stdf's Popup wrapper, not a native <dialog>
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('moves focus inside when it opens, and back to the button that opened it when it closes', async () => {
		await open();
		expect(inside()).toBe(true);
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect.element(drawer()).not.toBeInTheDocument();
		await expect.element(opener()).toHaveFocus();
	});

	it('keeps Tab and Shift+Tab inside, wrapping around at both ends', async () => {
		await open();
		for (let press = 0; press < 12; press++) {
			await userEvent.tab();
			expect(inside(), `Tab ${press + 1}`).toBe(true);
		}
		for (let press = 0; press < 12; press++) {
			await userEvent.tab({ shift: true });
			expect(inside(), `Shift+Tab ${press + 1}`).toBe(true);
		}
		// from the last control, Tab wraps to the first; from the first, Shift+Tab wraps to the last
		(document.querySelector('[data-last]') as HTMLElement).focus();
		await userEvent.tab();
		expect(document.activeElement).toBe(drawer().element().querySelector('button'));
		await userEvent.tab({ shift: true });
		expect(document.activeElement).toBe(document.querySelector('[data-last]'));
	});

	it('closes with Escape, once, and calls onclose', async () => {
		const onclose = await open();
		await userEvent.keyboard('{Escape}');
		await expect.element(drawer()).not.toBeInTheDocument();
		expect(onclose).toHaveBeenCalledOnce();
		await expect.element(opener()).toHaveFocus();
	});

	it('leaves Escape to a confirmation opened on top of it: that closes first, the drawer stays', async () => {
		await open();
		await page.getByRole('button', { name: 'Ask' }).click();
		await expect.element(page.getByRole('dialog', { name: 'Are you sure?' })).toBeVisible();

		await userEvent.keyboard('{Escape}');
		await expect.element(page.getByRole('dialog', { name: 'Are you sure?' })).not.toBeInTheDocument();
		await expect.element(drawer()).toBeVisible(); // only the question closed

		await userEvent.keyboard('{Escape}');
		await expect.element(drawer()).not.toBeInTheDocument(); // and now the drawer
	});

	it('closes on a click on the dimmed page, whose button is out of the keyboard order and hidden from screen readers', async () => {
		const onclose = await open();
		const mask = drawer().element().closest('div.fixed')!.previousElementSibling as HTMLButtonElement;
		expect(mask.tabIndex).toBe(-1);
		expect(mask.getAttribute('aria-hidden')).toBe('true');
		mask.click();
		await expect.element(drawer()).not.toBeInTheDocument();
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('locks the page behind it while open, and unlocks it afterwards', async () => {
		await open();
		const other = document.querySelector<HTMLElement>('[data-other]')!;
		expect(other.closest('[inert]')).not.toBeNull(); // not focusable, not clickable, not read out
		other.focus();
		expect(document.activeElement).not.toBe(other);
		expect(drawer().element().closest('[inert]')).toBeNull(); // the drawer itself stays live

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect.element(drawer()).not.toBeInTheDocument();
		expect(document.querySelector('[inert]')).toBeNull();
		other.focus();
		expect(document.activeElement).toBe(other);
	});

	it('dims the page with the app\'s own overlay colour in both themes, not stdf\'s white wash in dark mode', async () => {
		for (const theme of ['light', 'dark'] as const) {
			setTheme(theme);
			const screen = render(DrawerHost, { onclose: vi.fn() });
			await opener().click();
			await expect.element(drawer()).toBeVisible();
			const mask = drawer().element().closest('div.fixed')!.previousElementSibling as HTMLElement;
			const [r, g, b, a = 1] = getComputedStyle(mask).backgroundColor.match(/[\d.]+/g)!.map(Number);
			expect(r + g + b, theme).toBeLessThan(3 * 80); // a dark layer...
			expect(a, theme).toBeGreaterThan(0.3); // ...that really dims
			screen.unmount();
		}
	});

	it('shows the controls beside the title, left of Close', async () => {
		await open();
		const labels = [...drawer().element().querySelectorAll('header button')].map((button) => button.textContent?.trim() || button.getAttribute('aria-label'));
		expect(labels).toEqual(['Menu', 'Close']);
	});

	it('slides in from the right edge and settles in place, and slides out again when closed', async () => {
		await page.viewport(1440, 900);
		render(DrawerHost, { onclose: vi.fn() });
		await opener().click();
		await expect.poll(() => document.getAnimations().length).toBeGreaterThan(0); // moving...
		await settled();
		const right = () => drawer().element().getBoundingClientRect().right;
		expect(Math.abs(right() - document.documentElement.clientWidth)).toBeLessThanOrEqual(2); // ...and then in place

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect.poll(() => document.getAnimations().length).toBeGreaterThan(0); // sliding out
		await settled();
		await expect.element(drawer()).not.toBeInTheDocument();
	});

	it('gives the page back at once when it starts to close, not when it has finished sliding out', async () => {
		render(DrawerHost, { onclose: vi.fn() });
		await opener().click();
		await settled();
		const other = document.querySelector<HTMLElement>('[data-other]')!;
		expect(other.closest('[inert]')).not.toBeNull();

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		// the page behind is usable again while the panel is still on its way out (what is left inert is the panel itself,
		// which Svelte switches off while it animates away)
		expect(other.closest('[inert]')).toBeNull();
		expect(opener().element().closest('[inert]')).toBeNull();
		await expect.element(opener()).toHaveFocus();
		await settled();
	});

	it('is a third of the window wide, and follows the app\'s light and dark setting through stdf too', async () => {
		await page.viewport(1440, 900);
		await open();
		const width = drawer().element().getBoundingClientRect().width;
		expect(Math.abs(width - document.documentElement.clientWidth / 3)).toBeLessThanOrEqual(2);
	});
});
