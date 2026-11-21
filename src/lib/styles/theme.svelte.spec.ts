import { describe, expect, it } from 'vitest';
import './tokens.css';

/**
 * The palette is the one the app has always had (the former stdf "Starbucks" theme). These are its exact values, as that
 * theme defined them, so a change to the theme file that drifts from them fails here.
 */
const STARBUCKS: Record<string, string> = {
	'--color-primary-50': 'oklch(97% .018 153)',
	'--color-primary-100': 'oklch(87.8% .035 155)',
	'--color-primary-200': 'oklch(78.7% .052 157)',
	'--color-primary-300': 'oklch(69.5% .069 159)',
	'--color-primary-400': 'oklch(60.3% .086 161)',
	'--color-primary-500': 'oklch(51.2% .103 163)',
	'--color-primary': 'oklch(42% .12 165)',
	'--color-primary-700': 'oklch(37.8% .132 167)',
	'--color-primary-800': 'oklch(33.5% .132 169)',
	'--color-primary-900': 'oklch(29.2% .132 171)',
	'--color-primary-950': 'oklch(25% .132 173)',
	'--color-dark-50': 'oklch(97% .012 67)',
	'--color-dark-100': 'oklch(93.3% .023 65)',
	'--color-dark-200': 'oklch(89.7% .035 63)',
	'--color-dark-300': 'oklch(86% .046 61)',
	'--color-dark-400': 'oklch(82.3% .057 59)',
	'--color-dark-500': 'oklch(78.7% .069 57)',
	'--color-dark': 'oklch(75% .08 55)',
	'--color-dark-700': 'oklch(62.5% .088 53)',
	'--color-dark-800': 'oklch(50% .088 51)',
	'--color-dark-900': 'oklch(37.5% .088 49)',
	'--color-dark-950': 'oklch(25% .088 47)',
	'--color-bg-base': 'oklch(96.7% .006 165)',
	'--color-bg-surface': 'oklch(98.5% .005 55)',
	'--color-bg-overlay': 'oklch(95.5% .005 55)',
	'--color-bg-highlight': 'oklch(98% .004 165)',
	'--color-bg-base-dark': 'oklch(15% .006 55)',
	'--color-bg-surface-dark': 'oklch(22% .005 70)',
	'--color-bg-overlay-dark': 'oklch(19% .004 55)',
	'--color-bg-highlight-dark': 'oklch(8% .003 55)',
	'--color-text-primary': 'oklch(14.4% .006 165)',
	'--color-text-dark': 'oklch(91.7% .02 55)',
	'--color-text-on-primary': 'oklch(88.3% .022 55)',
	'--color-text-on-dark': 'oklch(18.9% .02 165)',
	'--color-success': 'oklch(55% .16 160)',
	'--color-warning': 'oklch(70% .16 60)',
	'--color-error': 'oklch(55% .22 25)',
	'--color-info': 'oklch(55% .18 250)'
};

const root = () => getComputedStyle(document.documentElement);

describe('the theme', () => {
	it('defines every Starbucks colour, with exactly its original value', () => {
		for (const [name, value] of Object.entries(STARBUCKS)) expect(root().getPropertyValue(name).trim(), name).toBe(value);
	});

	it('gives Flowbite\'s primary scale the Starbucks green, step for step, and secondary the warm hue', () => {
		const steps = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
		const green = ['--color-primary-50', '--color-primary-100', '--color-primary-200', '--color-primary-300', '--color-primary-400', '--color-primary-500', '--color-primary', '--color-primary-700', '--color-primary-800', '--color-primary-900', '--color-primary-950'];
		const warm = ['--color-dark-50', '--color-dark-100', '--color-dark-200', '--color-dark-300', '--color-dark-400', '--color-dark-500', '--color-dark', '--color-dark-700', '--color-dark-800', '--color-dark-900', '--color-dark-950'];
		steps.forEach((step, i) => {
			expect(root().getPropertyValue(`--color-primary-${step}`).trim(), `primary-${step}`).toBe(STARBUCKS[green[i]]);
			expect(root().getPropertyValue(`--color-secondary-${step}`).trim(), `secondary-${step}`).toBe(STARBUCKS[warm[i]]);
		});
	});

	it('anchors the grey ramp on the palette\'s own surfaces and uses the error colour for red', () => {
		expect(root().getPropertyValue('--color-gray-50').trim()).toBe(STARBUCKS['--color-bg-surface']);
		expect(root().getPropertyValue('--color-gray-100').trim()).toBe(STARBUCKS['--color-bg-base']);
		expect(root().getPropertyValue('--color-gray-800').trim()).toBe(STARBUCKS['--color-bg-surface-dark']);
		expect(root().getPropertyValue('--color-gray-900').trim()).toBe(STARBUCKS['--color-bg-overlay-dark']);
		expect(root().getPropertyValue('--color-gray-950').trim()).toBe(STARBUCKS['--color-bg-base-dark']);
		expect(root().getPropertyValue('--color-red-600').trim()).toBe(STARBUCKS['--color-error']);
	});

	it('shows the same colours the app showed before: background, text and accent in light mode', () => {
		document.documentElement.dataset.appearance = 'light';
		const probe = (variable: string) => {
			const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
			const holder = document.createElement('div');
			holder.style.color = `var(${variable})`;
			document.body.append(holder);
			canvas.fillStyle = getComputedStyle(holder).color;
			holder.remove();
			canvas.fillRect(0, 0, 1, 1);
			const [r, g, b] = canvas.getImageData(0, 0, 1, 1).data;
			return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
		};
		expect(probe('--color-bg')).toBe('F1F5F3');
		expect(probe('--color-surface')).toBe('FDF9F7');
		expect(probe('--color-text')).toBe('080B09');
		expect(probe('--color-accent')).toBe('00603C');
		expect(probe('--color-on-accent')).toBe('E5D5CB');
		delete document.documentElement.dataset.appearance;
	});
});
