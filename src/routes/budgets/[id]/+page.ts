import type { PageLoad } from './$types';

// The id comes from browser-local data, so this route cannot be prerendered: the host serves the
// SPA fallback (200.html) and the page renders on the client once the store has hydrated.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ budgetId: params.id });
