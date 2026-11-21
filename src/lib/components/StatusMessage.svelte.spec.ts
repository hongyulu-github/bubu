import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import '../styles/theme.css';
import '../styles/tokens.css';
import '../styles/base.css';
import { contrastRatio, effectiveBackground, resetTheme, setTheme, type Theme } from '../testing/theme';
import StatusMessage from './StatusMessage.svelte';

afterEach(resetTheme);
const text = (value: string) => createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

describe('StatusMessage', () => {
	it.each([['error', 'alert'], ['warning', 'alert'], ['success', 'status'], ['info', 'status']] as const)('announces a %s as a %s', async (kind, role) => {
		render(StatusMessage, { kind, title: 'Something happened', children: text('Details here') });
		await expect.element(page.getByRole(role)).toBeVisible();
		await expect.element(page.getByRole(role)).toHaveTextContent('Something happened');
		await expect.element(page.getByRole(role)).toHaveTextContent('Details here');
	});

	it('can be pointed at by a control through its id, and offers actions beside the message', async () => {
		render(StatusMessage, { id: 'why', title: 'Failed', actions: text('Try again') });
		expect(document.getElementById('why')).not.toBeNull();
		await expect.element(page.getByRole('alert')).toHaveTextContent('Try again');
	});

	it.each(['light', 'dark'] as Theme[])('is readable in %s, for every kind', async (theme) => {
		setTheme(theme);
		for (const kind of ['error', 'warning', 'success', 'info'] as const) {
			const screen = render(StatusMessage, { kind, title: 'Title', children: text('Body') });
			const box = document.querySelector(`[data-kind="${kind}"]`)!;
			expect(contrastRatio(getComputedStyle(box).color, effectiveBackground(box)), `${kind} ${theme}`).toBeGreaterThanOrEqual(4.5);
			screen.unmount();
		}
	});
});
