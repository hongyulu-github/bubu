import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

const baseUrl = inject('baseUrl');

let browser: Browser;
beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser.close();
});

describe('ExcelJS in the built static site', () => {
	it('writes and reads a workbook in the browser from the production bundle, with no request leaving the site', async () => {
		const page = await (await browser.newContext()).newPage();
		const requests: string[] = [];
		page.on('request', (request) => requests.push(request.url()));
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));

		await page.goto(`${baseUrl}/prototypes/excel`);
		await page.waitForLoadState('networkidle'); // hydrated: a click before that would be lost
		await page.getByRole('button', { name: 'Write and read a workbook' }).click();
		await page.getByText(/^OK:/).waitFor();

		const status = await page.getByRole('status').innerText();
		expect(status).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
		expect(status).toContain('A1 = BuBu');
		expect(errors).toEqual([]);
		expect(requests.every((url) => url.startsWith(baseUrl))).toBe(true); // static files only: no API, no CDN
		await page.context().close();
	});

	it('does not load ExcelJS until a workbook is needed', async () => {
		const page = await (await browser.newContext()).newPage();
		const sizes: Promise<number>[] = [];
		page.on('response', (response) => {
			if (response.url().endsWith('.js')) sizes.push(response.body().then((body) => body.length));
		});
		await page.goto(`${baseUrl}/budgets`);
		await page.waitForLoadState('networkidle');
		const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
		expect(bytes).toBeGreaterThan(0);
		expect(bytes).toBeLessThan(800_000); // the ~900 kB ExcelJS chunk is not among the app's start-up files
		await page.context().close();
	});

	it('ships the third-party notice with the site', async () => {
		const response = await fetch(`${baseUrl}/third-party-notices.txt`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('ExcelJS');
		expect(text).toContain('Permission is hereby granted, free of charge');
	});
});
