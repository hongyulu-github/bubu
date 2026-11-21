import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import ConfirmConversionDialog from './ConfirmConversionDialog.svelte';

const impact = { parentId: 'p', description: 'Music', unitPrice: '-250.5', quantity: '3', unit: 'days' };

describe('ConfirmConversionDialog', () => {
	it('names the Line, the manual price that is replaced and what is kept', async () => {
		render(ConfirmConversionDialog, { impact, open: true, onconfirm: vi.fn() });
		await expect.element(page.getByRole('dialog', { name: /Turn “Music” into a group\?/ })).toBeVisible();
		await expect.element(page.getByRole('dialog').getByText('-250.5', { exact: true })).toBeVisible();
		await expect.element(page.getByText('is replaced by the total of its items')).toBeVisible();
		await expect.element(page.getByText('3 is kept')).toBeVisible();
		await expect.element(page.getByText('days is kept')).toBeVisible();
	});

	it('confirms with the primary button and does not on Cancel', async () => {
		const onconfirm = vi.fn();
		render(ConfirmConversionDialog, { impact, open: true, onconfirm });
		await page.getByRole('button', { name: 'Cancel' }).click();
		expect(onconfirm).not.toHaveBeenCalled();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('calls onconfirm and closes on Convert and move item', async () => {
		const onconfirm = vi.fn();
		render(ConfirmConversionDialog, { impact, open: true, onconfirm });
		await page.getByRole('button', { name: 'Convert and move item' }).click();
		expect(onconfirm).toHaveBeenCalledOnce();
		await expect.element(page.getByRole('dialog')).not.toBeInTheDocument();
	});
});
