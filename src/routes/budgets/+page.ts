import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// The standalone list is retired: the saved Budgets are a drawer on the main page. Old links land there.
// Not prerendered: the host serves the SPA fallback and the client follows the redirect, so no stray page is written.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = () => {
	redirect(307, '/?budgets');
};
