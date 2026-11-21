import { afterEach } from 'vitest';
// Runs before every browser component test: load the app's theme, as the layout does.
import '../styles/theme.css';

// Tall pages from one test must not leave the next one scrolled: Home/End then scroll instead of moving the caret.
afterEach(() => window.scrollTo(0, 0));

// A test can end with a dialog still open (it only wanted to see it). Flowbite fades a dialog out when it is removed, and
// until that finishes the leftover modal would block focus and keys in the next test, so close any that remain.
afterEach(() => {
	for (const dialog of document.querySelectorAll<HTMLDialogElement>('dialog[open]')) dialog.close();
});
