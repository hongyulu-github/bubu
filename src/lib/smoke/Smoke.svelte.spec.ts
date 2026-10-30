import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Smoke from './Smoke.svelte';

describe('Smoke.svelte', () => {
	it('renders in a real browser and reacts to clicks', async () => {
		render(Smoke, { name: 'BuBu' });

		await expect.element(page.getByRole('heading', { level: 1 })).toHaveTextContent('Hello, BuBu!');

		await page.getByRole('button').click();
		await expect.element(page.getByRole('button')).toHaveTextContent('Clicked 1 times');
	});
});
