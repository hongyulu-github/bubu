import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import '../styles/tokens.css';
import '../styles/base.css';
import { contrastRatio, effectiveBackground, resetTheme, setTheme, type Theme } from '../testing/theme';
import LandingPage from './LandingPage.svelte';

afterEach(resetTheme);

type Snippets = Partial<{ showcases: ReturnType<typeof createRawSnippet>; donate: ReturnType<typeof createRawSnippet> }>;
function setup(props: Snippets = {}) {
	const oncreate = vi.fn();
	const onopenbudgets = vi.fn();
	render(LandingPage, { oncreate, onopenbudgets, ...props });
	return { oncreate, onopenbudgets };
}
const text = () => document.body.innerText;
const occurrences = (pattern: RegExp) => (text().match(pattern) ?? []).length;

describe('the name', () => {
	it('is bubu: the mark at the top left and the page title, with no logo yet', async () => {
		setup();
		expect(document.querySelector('.brand')!.textContent).toBe('bubu');
		expect(document.title).toContain('bubu');
		expect(document.querySelector('header img, header svg')).toBeNull(); // text until a logo exists
	});
});

describe('explanatory content', () => {
	it('says what the tool is for in a headline and one line', async () => {
		setup();
		await expect.element(page.getByRole('heading', { level: 1, name: 'Build a Budget, one Item at a time' })).toBeVisible();
		expect(text()).toContain('Plan a Budget as a tree of Items. Every Total adds up on its own.');
	});

	it('gives What you get real weight: its text and headings are large enough to read beside the headline, yet smaller than the donation title', async () => {
		await page.viewport(1440, 900);
		setup();
		await expect.element(page.getByRole('heading', { level: 2, name: 'What you get' })).toBeVisible();
		const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
		expect(size('.grid p')).toBeGreaterThanOrEqual(15); // readable body, not small print
		expect(size('.grid h3')).toBeGreaterThanOrEqual(17);
		expect(size('.features h2')).toBeGreaterThanOrEqual(17);
		expect(size('.grid h3')).toBeLessThan(size('.support h2'));
		const cards = [...document.querySelectorAll('.grid article')].map((card) => card.getBoundingClientRect());
		expect(Math.min(...cards.map((card) => card.height))).toBeGreaterThanOrEqual(110); // cards with presence
		expect(document.querySelector('.features')!.getBoundingClientRect().height).toBeGreaterThan(document.querySelector('.hero')!.getBoundingClientRect().height * 0.6); // a real counterweight to the left column
	});

	it('shows what you get: nested Items, roll-up Totals, Budgets and Excel', async () => {
		setup();
		for (const heading of ['Unlimited nested Items', 'Automatic roll-up Totals', 'Budgets', 'Excel in and out']) {
			await expect.element(page.getByRole('heading', { level: 3, name: heading, exact: true })).toBeVisible();
		}
		expect(text()).toContain('An Item with Items inside it is a Group, otherwise a Line');
		expect(text()).toContain('Codes like 1.2.3 keep the order');
		expect(text()).toContain("A Line's Total is its Quantity times its Unit price");
		expect(text()).toContain('A Group adds up the Totals inside it');
	});

	it('states the two promises once, as the largest type after the headline: Free and Yours', async () => {
		setup();
		const promises = [...document.querySelectorAll('.promises dt')].map((term) => term.textContent);
		expect(promises).toEqual(['Free', 'Yours']);
		expect(text()).toContain('No plans, trials or limits.');
		expect(text()).toContain('Data stays on this device. No accounts, nothing sent to a server.');
		expect(text()).not.toMatch(/\bprivate\b/i);

		const size = (element: Element) => parseFloat(getComputedStyle(element).fontSize);
		const word = document.querySelector('.promises dt')!;
		const h1 = document.querySelector('h1')!;
		for (const other of document.querySelectorAll('.lead, dd, .grid p, .grid h3, .support p')) expect(size(word)).toBeGreaterThan(size(other)); // bigger than all the supporting text
		expect(size(word)).toBeLessThan(size(h1)); // second only to the headline
		expect(getComputedStyle(word).fontWeight).toBe('700');
		expect(getComputedStyle(word).color).toBe(getComputedStyle(document.querySelector('.heart')!).backgroundColor); // the accent colour, used for what matters
	});

	it('does not repeat itself: each idea appears once', async () => {
		setup();
		expect(occurrences(/\bfree\b/gi)).toBe(1);
		expect(occurrences(/\bno accounts?\b/gi)).toBe(1);
		expect(occurrences(/\b(browser|device|machine)\b/gi)).toBe(1);
		expect(occurrences(/server/gi)).toBe(1);
		expect(occurrences(/\bdonat/gi)).toBe(1);
		expect(occurrences(/\bnested\b/gi)).toBe(1);
		// short: the whole first screen is a handful of lines, not paragraphs
		expect(text().split(/\s+/).filter(Boolean).length).toBeLessThan(150);
	});

	it('uses the Budget vocabulary and no other names for the same things', async () => {
		setup();
		for (const term of ['Budget', 'Item', 'Group', 'Line', 'Code', 'Quantity', 'Unit price', 'Total']) expect(text()).toContain(term);
		expect(text()).not.toMatch(/\b(line items?|sub-?items?|folders?|categor(y|ies)|subtotals?)\b/i);
		expect(text()).not.toMatch(/\bunit cost\b|\bamount\b|\bqty\b/i);
	});

	it('starts nothing by itself: it shows the page and calls nobody', async () => {
		const { oncreate, onopenbudgets } = setup();
		await expect.element(page.getByRole('main')).toBeVisible();
		expect(oncreate).not.toHaveBeenCalled();
		expect(onopenbudgets).not.toHaveBeenCalled();
	});
});

describe('donations', () => {
	it('has its own visible band, with an icon and a heading, saying donations are welcome and optional', async () => {
		setup();
		const band = page.getByRole('complementary');
		await expect.element(band).toBeVisible();
		await expect.element(page.getByRole('heading', { level: 2, name: 'Like it? Support it.' })).toBeVisible();
		expect(text()).toContain('No ads and no paywall. Donations are welcome, and always optional.');
		expect(document.querySelector('.support .heart svg')).not.toBeNull();
	});

	it('is as prominent as the features: its heading is larger than any feature heading, and it spans the whole width', async () => {
		await page.viewport(1440, 900);
		setup();
		await expect.element(page.getByRole('complementary')).toBeVisible();
		const size = (selector: string) => parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize);
		expect(size('.support h2')).toBeGreaterThan(size('.grid h3'));
		const band = document.querySelector('.support')!.getBoundingClientRect();
		const main = document.querySelector('main')!.getBoundingClientRect();
		expect(band.width).toBeGreaterThanOrEqual(main.width - 2 * 48 - 2); // the full content width, under both columns
		expect(getComputedStyle(document.querySelector('.support')!).backgroundColor).not.toBe('rgba(0, 0, 0, 0)'); // a tinted block, not loose text
	});

	it('makes "Donations are welcome" the link to the GitHub Sponsors profile, in a new tab', async () => {
		setup();
		const link = page.getByRole('link', { name: 'Donations are welcome' });
		await expect.element(link).toHaveAttribute('href', 'https://github.com/sponsors/hongyulu-github');
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer');
		expect(getComputedStyle(link.element()).textDecorationLine).toBe('underline');
	});

	it('has no other donation link or button', async () => {
		setup();
		expect(document.querySelectorAll('main a[href]')).toHaveLength(1); // the sponsor link only
		expect(page.getByRole('button', { name: /donate/i }).elements()).toHaveLength(0);
	});

	it('has a place for the donation link or button, inside the band, shown only when given', async () => {
		setup({ donate: createRawSnippet(() => ({ render: () => '<a href="https://example.test/donate" data-donate>Donate</a>' })) });
		expect(document.querySelector('.support .donate [data-donate]')).not.toBeNull();
		await expect.element(page.getByRole('link', { name: 'Donate' })).toBeVisible();
	});
});

describe('the two buttons', () => {
	it('have exactly the labels "Create a budget" and "My budgets", one of each, and are buttons', async () => {
		setup();
		const create = page.getByRole('button', { name: 'Create a budget', exact: true });
		const mine = page.getByRole('button', { name: 'My budgets', exact: true });
		await expect.element(create).toBeVisible();
		await expect.element(mine).toBeVisible();
		expect(create.elements()).toHaveLength(1);
		expect(mine.elements()).toHaveLength(1);
		expect(document.querySelectorAll('main a[href]')).toHaveLength(1); // the sponsor link only, no link beside the buttons
	});

	it('"Create a budget" calls the creation callback once and does not open the drawer', async () => {
		const { oncreate, onopenbudgets } = setup();
		await page.getByRole('button', { name: 'Create a budget', exact: true }).click();
		expect(oncreate).toHaveBeenCalledOnce();
		expect(onopenbudgets).not.toHaveBeenCalled();
	});

	it('"My budgets" calls the drawer callback once and does not start creation', async () => {
		const { oncreate, onopenbudgets } = setup();
		await page.getByRole('button', { name: 'My budgets', exact: true }).click();
		expect(onopenbudgets).toHaveBeenCalledOnce();
		expect(oncreate).not.toHaveBeenCalled();
	});

	it('"Create a budget" is the one prominent button, and the donation band adds no second one', async () => {
		setup();
		const fill = (name: string) => getComputedStyle(page.getByRole('button', { name, exact: true }).element()).backgroundColor;
		expect(fill('Create a budget')).not.toBe(fill('My budgets'));
		expect(document.querySelectorAll('.support button')).toHaveLength(0);
	});
});

describe('use-case showcases', () => {
	it('leaves room for them: a slot shown under "See it in use" when given', async () => {
		setup({ showcases: createRawSnippet(() => ({ render: () => '<p data-showcase>A wedding Budget</p>' })) });
		await expect.element(page.getByRole('heading', { name: 'See it in use' })).toBeVisible();
		await expect.element(page.getByText('A wedding Budget')).toBeVisible();
	});

	it('shows no empty section when there are none yet', async () => {
		setup();
		expect(text()).not.toContain('See it in use');
	});
});

describe('layout', () => {
	const onOneScreen = async (width: number, height: number) => {
		await page.viewport(width, height);
		setup();
		await expect.element(page.getByRole('button', { name: 'Create a budget', exact: true })).toBeVisible();
		const root = document.documentElement;
		expect(root.scrollHeight, `${width}x${height}`).toBeLessThanOrEqual(root.clientHeight); // nothing to scroll
		for (const selector of ['.brand', 'h1', '.actions', '.promises', '.grid', '.support']) {
			const box = document.querySelector(selector)!.getBoundingClientRect();
			expect(box.top, `${selector} ${width}x${height}`).toBeGreaterThanOrEqual(0);
			expect(box.bottom, `${selector} ${width}x${height}`).toBeLessThanOrEqual(height);
		}
	};

	it('shows everything important on one screen, with no scrolling, on common laptop and desktop windows', async () => {
		for (const [width, height] of [[1280, 720], [1366, 768], [1440, 900], [1920, 1080]]) {
			await onOneScreen(width, height);
			document.body.innerHTML = '';
		}
	});

	it('follows a reading path: name, headline, one line, buttons, promises, then features beside them and the band last', async () => {
		await page.viewport(1440, 900);
		setup();
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		const top = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().top;
		expect([top('.brand'), top('h1'), top('.lead'), top('.actions'), top('.promises')]).toEqual([...[top('.brand'), top('h1'), top('.lead'), top('.actions'), top('.promises')]].sort((a, b) => a - b));
		expect(document.querySelector('.features')!.getBoundingClientRect().left).toBeGreaterThan(document.querySelector('.hero')!.getBoundingClientRect().right);
		expect(top('.support')).toBeGreaterThan(document.querySelector('.promises')!.getBoundingClientRect().bottom);
		expect(top('.support')).toBeGreaterThan(document.querySelector('.grid')!.getBoundingClientRect().bottom);
	});

	it('uses the width: the pitch and the features sit side by side and fill most of a wide window', async () => {
		await page.viewport(1440, 900);
		setup();
		await expect.element(page.getByRole('button', { name: 'Create a budget', exact: true })).toBeVisible();
		const hero = document.querySelector('.hero')!.getBoundingClientRect();
		const features = document.querySelector('.features')!.getBoundingClientRect();
		expect(features.left).toBeGreaterThan(hero.right);
		expect(Math.abs(hero.top + hero.height / 2 - (features.top + features.height / 2))).toBeLessThan(60);
		expect(features.right - hero.left).toBeGreaterThanOrEqual(1440 * 0.85);
	});

	it('puts the hero text at the left edge of its column, not centred', async () => {
		await page.viewport(1440, 900);
		setup();
		await expect.element(page.getByRole('heading', { level: 1 })).toBeVisible();
		expect(getComputedStyle(document.querySelector('h1')!).textAlign).toMatch(/start|left/);
	});

	it('lets the page scroll only when something is added below the first screen', async () => {
		await page.viewport(1280, 720);
		setup({ showcases: createRawSnippet(() => ({ render: () => '<div style="height: 600px">A showcase</div>' })) });
		await expect.element(page.getByText('A showcase')).toBeVisible();
		const root = document.documentElement;
		expect(root.scrollHeight).toBeGreaterThan(root.clientHeight);
		expect(document.querySelector('.below')!.getBoundingClientRect().top).toBeGreaterThanOrEqual(document.querySelector('main')!.getBoundingClientRect().bottom - 1);
	});
});

describe('look', () => {
	it('uses the shared system font stack and bundles no font', async () => {
		setup();
		const stack = getComputedStyle(document.querySelector('h1')!).fontFamily;
		const source = await fetch(new URL('./LandingPage.svelte?raw', import.meta.url)).then((response) => response.text());
		expect(source.slice(source.indexOf('<style>'))).not.toContain('font-family'); // the page never picks a font itself
		expect(stack).toBe(getComputedStyle(document.body).fontFamily);
		expect(stack).toContain('-apple-system');
		const fontFaces = [...document.styleSheets].flatMap((sheet) => {
			try {
				return [...sheet.cssRules].filter((rule) => rule instanceof CSSFontFaceRule);
			} catch {
				return [];
			}
		});
		expect(fontFaces).toHaveLength(0);
		expect(document.querySelector('link[rel="preload"][as="font"]')).toBeNull();
	});

	it('colours text only from the shared tokens, so light and dark change it and stay readable', async () => {
		const seen = new Map<Theme, string>();
		for (const theme of ['light', 'dark'] as Theme[]) {
			setTheme(theme);
			const screen = render(LandingPage, { oncreate: vi.fn(), onopenbudgets: vi.fn() });
			const check = (selector: string, minimum: number) => {
				const element = document.querySelector(selector)!;
				expect(contrastRatio(getComputedStyle(element).color, effectiveBackground(element)), `${selector} ${theme}`).toBeGreaterThanOrEqual(minimum);
			};
			check('.brand', 4.5);
			check('h1', 4.5);
			check('.lead', 4.5);
			check('.promises dt', 4.5); // the accent word on the page background
			check('.promises dd', 4.5);
			check('article h3', 4.5);
			check('article p', 4.5);
			check('.support h2', 4.5);
			check('.support p', 4.5); // on the tinted band
			seen.set(theme, effectiveBackground(document.querySelector('article')!));
			screen.unmount();
		}
		expect(seen.get('light')).not.toBe(seen.get('dark'));
	});

	it('writes no colour of its own: every colour comes from a token', async () => {
		const source = await fetch(new URL('./LandingPage.svelte?raw', import.meta.url)).then((response) => response.text());
		const styles = source.slice(source.indexOf('<style>'));
		expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(styles).not.toMatch(/\brgba?\(|\bhsla?\(/);
	});
});
