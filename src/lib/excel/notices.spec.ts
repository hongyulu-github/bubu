import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('third-party notices', () => {
	const notices = read('static/third-party-notices.txt');

	it('include the ExcelJS name, version and its MIT licence text exactly as shipped by the package', () => {
		expect(notices).toContain('ExcelJS 4.4.0');
		expect(notices).toContain(read('node_modules/exceljs/LICENSE').trim());
		expect(notices).toContain('Copyright (c) 2014-2019 Guyon Roche');
	});

	it('name the installed ExcelJS version, so the notice cannot go stale on an upgrade', () => {
		const { version } = JSON.parse(read('node_modules/exceljs/package.json'));
		expect(notices).toContain(`ExcelJS ${version}`);
	});
});

describe('no backend dependency', () => {
	it('ExcelJS is a regular dependency and nothing server-side was added', () => {
		const pkg = JSON.parse(read('package.json'));
		expect(pkg.dependencies.exceljs).toBeDefined();
		expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toEqual(
			expect.arrayContaining(['express', 'fastify', 'koa', '@sveltejs/adapter-node'])
		);
	});
});
