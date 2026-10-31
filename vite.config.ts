import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	ssr: {
		// Atlaskit's Pragmatic packages expose subpaths as directories (no `exports` map), which Node's
		// ESM loader cannot resolve while prerendering. Let Vite bundle them for SSR instead.
		noExternal: ['@atlaskit/pragmatic-drag-and-drop', '@atlaskit/pragmatic-drag-and-drop-hitbox', 'stdf', '@any-tdf/common']
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Budget editor URLs (/budgets/<uuid>) depend on browser-local data, so they cannot be
			// prerendered. The host serves 200.html for any URL it has no file for (an SPA rewrite).
			adapter: adapter({ fallback: '200.html' })
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					setupFiles: ['./src/lib/testing/setup.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				// End-to-end checks against the built static site (real router, reloads, SPA fallback).
				test: {
					name: 'e2e',
					environment: 'node',
					include: ['e2e/**/*.e2e.ts'],
					globalSetup: ['./e2e/global-setup.ts'],
					testTimeout: 30_000,
					hookTimeout: 120_000
				}
			}
		]
	}
});
