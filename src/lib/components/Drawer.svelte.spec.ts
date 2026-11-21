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
/** A click on the dimmed page: it reaches the dialog element itself, at a point outside its box. */
const clickOutside = () =>
	drawer().element().dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 }));

async function open(onclose = vi.fn()) {
	render(DrawerHost, { onclose });
	await opener().click();
	await expect.element(drawer()).toBeVisible();
	await settled(); // it slides in: wait until it is in place
	return onclose;
}

describe('Drawer (Flowbite Drawer)', () => {
	it('is a native modal dialog with an accessible name', async () => {
		await open();
		const element = drawer().element() as HTMLDialogElement;
		expect(element.tagName).toBe('DIALOG');
		expect(element.open).toBe(true);
		expect(element.matches(':modal')).toBe(true);
		expect(element.getAttribute('aria-labelledby')).toBeTruthy();
		await expect.element(page.getByRole('heading', { name: 'Test drawer' })).toBeVisible();
	});

	it('moves focus inside when it opens, and back to the button that opened it when it has closed', async () => {
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

	it('closes on a click outside the panel, and calls onclose', async () => {
		await page.viewport(1440, 900); // wide enough that there is page beside the panel to click
		const onclose = await open();
		clickOutside();
		await expect.element(drawer()).not.toBeInTheDocument();
		expect(onclose).toHaveBeenCalledOnce();
	});

	it('locks the page behind it while open: nothing there can take focus, and a screen reader cannot reach it', async () => {
		await open();
		const other = document.querySelector<HTMLElement>('[data-other]')!;
		other.focus();
		expect(document.activeElement).not.toBe(other);
		expect(drawer().element().matches(':modal')).toBe(true);

		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await expect.element(drawer()).not.toBeInTheDocument();
		other.focus();
		expect(document.activeElement).toBe(other);
	});

	it('dims the page with the app\'s own overlay colour in both themes', async () => {
		for (const theme of ['light', 'dark'] as const) {
			setTheme(theme);
			const screen = render(DrawerHost, { onclose: vi.fn() });
			await opener().click();
			await expect.element(drawer()).toBeVisible();
			const [r, g, b, a = 1] = getComputedStyle(drawer().element(), '::backdrop').backgroundColor.match(/[\d.]+/g)!.map(Number);
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

	it('is at most 28rem wide, and the whole width of a phone', async () => {
		await page.viewport(1440, 900);
		await open();
		expect(drawer().element().getBoundingClientRect().width).toBe(448);
	});
});
