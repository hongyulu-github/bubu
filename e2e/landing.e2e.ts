import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

const baseUrl = inject('baseUrl');
const WEDDING = '11111111-1111-4111-8111-111111111111';

let browser: Browser;
let page: Page;
let requests: string[];

beforeAll(async () => {
	browser = await chromium.launch();
});
afterAll(async () => {
	await browser.close();
});
beforeEach(async () => {
	page = await (await browser.newContext()).newPage();
	requests = [];
	page.on('request', (request) => requests.push(request.url()));
});
afterEach(async () => {
	await page.context().close();
});

const create = () => page.getByRole('button', { name: 'Create a budget', exact: true });
const mine = () => page.getByRole('button', { name: 'My budgets', exact: true });
const stored = () =>
	page.evaluate(() =>
		Object.fromEntries(
			Object.keys(localStorage)
				.filter((key) => key.startsWith('bubu:'))
				.map((key) => [key, JSON.parse(localStorage.getItem(key) ?? 'null')])
		)
	);

describe('the landing page (built static site)', () => {
	it('is the main page for a new user, with both buttons and the free, local, no-account promise', async () => {
		await page.goto(`${baseUrl}/`);
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();
		await create().waitFor();
		await mine().waitFor();
		const text = await page.locator('main').innerText();
		expect(text).toContain('No plans, trials or limits.'); // Free
		expect(text).toContain('Data stays on this device. No accounts, nothing sent to a server.'); // Yours
		expect(text).toContain('Donations are welcome, and always optional.');
		expect(await page.title()).toContain('BuBu');
		expect(await page.locator('.brand').innerText()).toBe('BuBu');
	});

	/** One saved Budget (with two Items) written straight into browser storage. */
	async function seedWedding() {
		await page.goto(`${baseUrl}/`);
		await page.evaluate(
			([budgetId, saved]) => {
				localStorage.setItem(`bubu:budget:${budgetId}`, JSON.stringify({ version: 1, data: { id: budgetId, name: 'Wedding', currency: 'EUR', createdAt: saved, updatedAt: saved } }));
				localStorage.setItem(
					`bubu:items:${budgetId}`,
					JSON.stringify({
						version: 1,
						data: [
							{ id: '00000000-0000-4000-8000-000000000001', budgetId, parentId: null, sortIndex: 0, description: 'Venue', unitPrice: '100', quantity: '2' },
							{ id: '00000000-0000-4000-8000-000000000002', budgetId, parentId: null, sortIndex: 1, description: 'Music', unitPrice: '50', quantity: '1' }
						]
					})
				);
			},
			[WEDDING, '2026-02-01T00:00:00.000Z'] as const
		);
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');
	}
	const drawer = (name: string) => page.getByRole('dialog', { name, exact: true });
	const budgetIds = async () => Object.keys(await stored()).filter((key) => key.startsWith('bubu:budget:')).sort();

	it('is still the main page when saved Budgets already exist, with "My budgets" opening them in a side drawer', async () => {
		await seedWedding();
		expect(page.url()).toBe(`${baseUrl}/`); // not redirected to a list
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();

		await mine().click();
		await drawer('My budgets').waitFor();
		expect(await page.getByRole('link', { name: /Wedding/ }).innerText()).toContain('EUR');
		expect(page.url()).toBe(`${baseUrl}/`); // the URL did not change: it is a drawer, not a page
		expect(await page.getByLabel('Name').count()).toBe(0); // no creation started
		expect(await budgetIds()).toEqual([`bubu:budget:${WEDDING}`]);
	});

	it('closes the drawer back to the landing page without changing anything', async () => {
		await seedWedding();
		const before = JSON.stringify(await stored());
		await mine().click();
		await drawer('My budgets').waitFor();
		await page.getByRole('button', { name: 'Close', exact: true }).click();
		await drawer('My budgets').waitFor({ state: 'detached' });
		await mine().click();
		await drawer('My budgets').waitFor(); // Escape before it has opened would do nothing
		await page.keyboard.press('Escape');
		await drawer('My budgets').waitFor({ state: 'detached' });

		expect(page.url()).toBe(`${baseUrl}/`);
		await page.getByRole('heading', { level: 1 }).waitFor();
		expect(JSON.stringify(await stored())).toBe(before);
	});

	it('opens the unchanged editor for the Budget you select, with its Items, and survives a reload and a direct link', async () => {
		await seedWedding();
		await mine().click();
		await page.getByRole('link', { name: /Wedding/ }).click();

		await page.waitForURL(`${baseUrl}/budgets/${WEDDING}`);
		await page.getByRole('heading', { level: 1, name: 'Wedding' }).waitFor();
		expect(await page.getByLabel('Description 1', { exact: true }).inputValue()).toBe('Venue');
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toBe('€250.00'); // 100 x 2 + 50

		await page.reload(); // reload keeps working
		await page.getByLabel('Description 2', { exact: true }).waitFor();
		expect(await page.getByLabel('Description 2', { exact: true }).inputValue()).toBe('Music');

		await page.goto(`${baseUrl}/budgets/${WEDDING}`); // and so does a direct link
		await page.getByLabel('Grand total', { exact: true }).waitFor();
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toBe('€250.00');
	});

	it('moves between saved Budgets through the drawer', async () => {
		await seedWedding();
		const other = '33333333-3333-4333-8333-333333333333';
		await page.evaluate(
			([budgetId, saved]) => {
				localStorage.setItem(`bubu:budget:${budgetId}`, JSON.stringify({ version: 1, data: { id: budgetId, name: 'Renovation', currency: 'USD', createdAt: saved, updatedAt: saved } }));
				localStorage.setItem(`bubu:items:${budgetId}`, JSON.stringify({ version: 1, data: [] }));
			},
			[other, '2026-03-01T00:00:00.000Z'] as const
		);
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');

		await mine().click();
		await page.getByRole('link', { name: /Renovation/ }).click();
		await page.waitForURL(`${baseUrl}/budgets/${other}`);
		await page.getByRole('heading', { name: 'Renovation' }).waitFor();
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toBe('$0.00');

		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');
		await mine().click();
		await page.getByRole('link', { name: /Wedding/ }).click();
		await page.waitForURL(`${baseUrl}/budgets/${WEDDING}`);
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toBe('€250.00');
	});

	/** Fill the new-Budget form in the drawer and submit it. */
	async function createNamed(name: string, currency: string) {
		await drawer('New budget').waitFor();
		await page.getByLabel('Name').fill(name);
		await page.getByLabel('Currency').selectOption(currency);
		await page.getByRole('button', { name: 'Create Budget', exact: true }).click();
		await page.waitForURL(/\/budgets\/[0-9a-f-]{36}$/);
		await page.getByRole('heading', { name }).waitFor();
		return page.url().split('/').pop()!;
	}
	const expectEmpty = async (id: string) => {
		expect(await page.getByLabel('Grand total', { exact: true }).innerText()).toMatch(/0\.00$/);
		expect(await page.locator('table[aria-label="Budget Items"] tbody tr').count()).toBe(0);
		const saved = await stored();
		expect((saved[`bubu:items:${id}`] as { data: unknown[] }).data).toEqual([]); // an empty Item array, no starter template
	};

	it('"Create a budget" opens the form in the drawer and makes an empty Budget: no Items, a zero grand total', async () => {
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle'); // hydrated: a click before that would be lost
		await create().click();
		expect(page.url()).toBe(`${baseUrl}/`); // the form is in the drawer, not on its own page
		const id = await createNamed('From the page button', 'EUR');
		await expectEmpty(id);
		expect(Object.keys(await stored()).sort()).toEqual([`bubu:budget:${id}`, `bubu:items:${id}`]);
	});

	it('retires the old list and form addresses: they land on the main page with the drawer open', async () => {
		await seedWedding();
		await page.goto(`${baseUrl}/budgets`);
		await drawer('My budgets').waitFor();
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		await page.waitForURL(`${baseUrl}/`);

		await page.goto(`${baseUrl}/budgets/new`);
		await drawer('New budget').waitFor();
		await page.getByLabel('Name').waitFor();
		await page.waitForURL(`${baseUrl}/`);
	});

	it('the editor\'s back link returns to the main page with the saved Budgets drawer open', async () => {
		await seedWedding();
		await page.goto(`${baseUrl}/budgets/${WEDDING}`);
		await page.getByRole('heading', { level: 1, name: 'Wedding' }).waitFor();

		await page.getByRole('link', { name: /All Budgets/ }).click();
		await drawer('My budgets').waitFor();
		await page.getByRole('link', { name: /Wedding/ }).waitFor();
		await page.waitForURL(`${baseUrl}/`); // the main page, with a clean address
		await page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' }).waitFor();

		await page.reload(); // a reload does not reopen it
		await page.getByRole('heading', { level: 1 }).waitFor();
		expect(await drawer('My budgets').count()).toBe(0);
	});

	it('fits its first screen without scrolling at common window sizes, with both buttons in view', async () => {
		for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
			await page.setViewportSize({ width, height });
			await page.goto(`${baseUrl}/`);
			await create().waitFor();
			// The first screen is the main block; the template showcases sit below it, so the page itself may scroll.
			const mainHeight = await page.evaluate(() => document.querySelector('main')!.getBoundingClientRect().height);
			expect(mainHeight, `${width}x${height}`).toBeLessThanOrEqual(height);
			for (const button of [create(), mine()]) expect(await button.boundingBox()).toMatchObject({ y: expect.any(Number) });
			expect(await create().isVisible()).toBe(true);
			expect((await page.locator('.support').boundingBox())!.y + (await page.locator('.support').boundingBox())!.height).toBeLessThanOrEqual(height);
		}
	});

	it('needs no backend and loads no font: only static files from the site are requested', async () => {
		await page.goto(`${baseUrl}/`);
		await page.waitForLoadState('networkidle');
		expect(requests.filter((url) => !url.startsWith(baseUrl) && !url.startsWith('data:'))).toEqual([]);
		expect(requests.filter((url) => /\.(woff2?|ttf|otf|eot)(\?|$)/i.test(url))).toEqual([]);
	});
});
