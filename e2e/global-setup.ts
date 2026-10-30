import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';
import type { TestProject } from 'vitest/node';

const BUILD_DIR = join(process.cwd(), 'build');

const TYPES: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.txt': 'text/plain; charset=utf-8',
	'.png': 'image/png',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2'
};

function fileFor(pathname: string): string | null {
	const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
	for (const candidate of [safe, `${safe}.html`, join(safe, 'index.html')]) {
		const full = join(BUILD_DIR, candidate);
		if (existsSync(full) && statSync(full).isFile()) return full;
	}
	// Like a static host with an SPA rewrite: unknown extension-less URLs get the fallback page.
	return extname(safe) === '' ? join(BUILD_DIR, '200.html') : null;
}

/** Build the static site, then serve `build/` the way production hosting will (clean URLs + SPA fallback). */
export default async function setup(project: TestProject) {
	try {
		execFileSync('npm', ['run', 'build'], { stdio: 'pipe' });
	} catch (error) {
		// Show the build's own output: a bare "Command failed" says nothing about why.
		const output = error as { stdout?: Buffer; stderr?: Buffer };
		throw new Error(`The site failed to build for the e2e tests:\n${output.stdout ?? ''}\n${output.stderr ?? ''}`);
	}

	const server: Server = createServer((request, response) => {
		const file = fileFor(new URL(request.url ?? '/', 'http://localhost').pathname);
		if (!file) {
			response.writeHead(404).end('Not found');
			return;
		}
		response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
		response.end(readFileSync(file));
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const { port } = server.address() as { port: number };
	project.provide('baseUrl', `http://127.0.0.1:${port}`);

	return () => new Promise<void>((resolve) => server.close(() => resolve()));
}

declare module 'vitest' {
	export interface ProvidedContext {
		baseUrl: string;
	}
}
