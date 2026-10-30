import { page, userEvent } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../../styles/tokens.css';
import '../../styles/base.css';
import TreeDndDemo from './TreeDndDemo.svelte';

const row = (name: string) => page.getByRole('treeitem', { name });
const labels = () =>
	[...document.querySelectorAll('[role="treeitem"]')].map((el) => el.getAttribute('aria-label'));

describe('TreeDndDemo', () => {
	it('mounts with the fixture as an outline', async () => {
		render(TreeDndDemo);
		await expect.element(page.getByRole('heading', { name: 'Tree drag and drop prototype' })).toBeVisible();
		await expect.element(page.getByRole('tree')).toBeVisible();
		expect(labels()).toEqual([
			'1 Venue',
			'1.1 Hall rental',
			'1.2 Decoration',
			'1.2.1 Flowers',
			'1.2.2 Lights',
			'2 Catering',
			'2.1 Food',
			'2.2 Drinks',
			'3 Music',
			'4 Photography'
		]);
	});

	it('moves a parent with its descendants when dropped inside another row', async () => {
		render(TreeDndDemo);
		const target = row('2 Catering');
		const box = target.element().getBoundingClientRect();

		// Middle of the row = "inside".
		await userEvent.dragAndDrop(row('1.2 Decoration'), target, {
			targetPosition: { x: box.width / 2, y: box.height / 2 }
		});

		await expect.element(page.getByRole('status')).toHaveTextContent(
			'Moved "Decoration" with 2 descendants inside "Catering".'
		);
		expect(labels()).toEqual([
			'1 Venue',
			'1.1 Hall rental',
			'2 Catering',
			'2.1 Food',
			'2.2 Drinks',
			'2.3 Decoration',
			'2.3.1 Flowers',
			'2.3.2 Lights',
			'3 Music',
			'4 Photography'
		]);
	});

	it('reorders siblings when dropped on the top or bottom edge', async () => {
		render(TreeDndDemo);
		const target = row('3 Music');
		const box = target.element().getBoundingClientRect();

		await userEvent.dragAndDrop(row('4 Photography'), target, {
			targetPosition: { x: box.width / 2, y: 3 }
		});

		await expect.element(page.getByRole('status')).toHaveTextContent('Moved "Photography" before "Music".');
		expect(labels().slice(-2)).toEqual(['3 Photography', '4 Music']);
	});

	it('rejects dropping a parent into its own descendant and changes nothing', async () => {
		render(TreeDndDemo);
		const before = labels();
		const target = row('1.2.1 Flowers');
		const box = target.element().getBoundingClientRect();

		await userEvent.dragAndDrop(row('1 Venue'), target, {
			targetPosition: { x: box.width / 2, y: box.height / 2 }
		});

		await expect.element(page.getByRole('status')).toHaveTextContent(
			'Rejected: "Venue" cannot be dropped into its own descendant "Flowers".'
		);
		expect(labels()).toEqual(before);
	});

	it('resets to the fixture', async () => {
		render(TreeDndDemo);
		const target = row('3 Music');
		const box = target.element().getBoundingClientRect();
		await userEvent.dragAndDrop(row('4 Photography'), target, { targetPosition: { x: box.width / 2, y: 3 } });
		await page.getByRole('button', { name: 'Reset' }).click();
		expect(labels().slice(-2)).toEqual(['3 Music', '4 Photography']);
	});
});
