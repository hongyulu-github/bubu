import { afterEach } from 'vitest';
// Runs before every browser component test: load the stdf styles and select its theme, as app.html does.
import '../styles/stdf.css';

document.documentElement.dataset.theme = 'Starbucks';

// Tall pages from one test must not leave the next one scrolled: Home/End then scroll instead of moving the caret.
afterEach(() => window.scrollTo(0, 0));
