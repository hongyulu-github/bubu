export type Theme = 'light' | 'dark';

export function setTheme(theme: Theme) {
	document.documentElement.dataset.theme = theme;
}

export function resetTheme() {
	delete document.documentElement.dataset.theme;
}

function parseRgb(value: string): [number, number, number] {
	const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
	if (!channels || channels.length < 3) throw new Error(`Cannot parse colour: ${value}`);
	return [channels[0], channels[1], channels[2]];
}

function luminance(value: string): number {
	const [r, g, b] = parseRgb(value).map((channel) => {
		const c = channel / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two computed `rgb(...)` colours. */
export function contrastRatio(foreground: string, background: string): number {
	const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Give the test iframe keyboard focus, starting from a known point before the rendered content,
 * so the next `userEvent.tab()` lands on the first focusable control.
 */
export async function focusDocument(page: typeof import('vitest/browser').page) {
	let anchor = document.getElementById('focus-anchor');
	if (!anchor) {
		anchor = document.createElement('span');
		anchor.id = 'focus-anchor';
		anchor.tabIndex = -1;
		anchor.style.cssText = 'display:inline-block;width:8px;height:8px';
		document.body.prepend(anchor);
	}
	await page.elementLocator(anchor).click();
}
