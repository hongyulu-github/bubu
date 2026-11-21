import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The deploy host reads vercel.json; these checks keep it pointing at what the build really writes (the build
// ran once for the e2e tests, so `build/` is the adapter's real output).
const config = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('vercel.json', () => {
	it('names the directory the static adapter writes, not the host default "public"', () => {
		expect(config.outputDirectory).toBe('build');
		expect(existsSync('build/index.html')).toBe(true);
		expect(existsSync('public')).toBe(false);
	});

	it('sends addresses with no file of their own (an editor route) to the single-page fallback the build wrote', () => {
		const fallback = config.rewrites.find((rewrite: { source: string }) => rewrite.source === '/(.*)');
		expect(fallback.destination).toBe('/200.html');
		expect(existsSync('build/200.html')).toBe(true);
	});

	it('serves prerendered pages at clean addresses, and builds with the project script', () => {
		expect(config.cleanUrls).toBe(true);
		expect(existsSync('build/design.html')).toBe(true); // /design
		expect(config.buildCommand).toBe('npm run build');
	});
});
