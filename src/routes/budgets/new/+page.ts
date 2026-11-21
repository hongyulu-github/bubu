import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

// The standalone form is retired: creating a Budget is a form in the drawer on the main page. Old links land there.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = () => {
	redirect(307, '/?new');
};
