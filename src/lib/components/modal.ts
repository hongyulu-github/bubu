/**
 * The behaviour of a modal dialog that stdf's overlays (Popup, Mask) do not have: stdf draws the panel and the
 * dimming, but it has no focus handling, no Escape key and no way for the page behind to be locked. This adds
 * exactly that, so a stdf overlay behaves like the native modal dialog it replaces:
 *
 * - focus moves inside when it opens, stays inside while Tab is pressed, and returns to what opened it;
 * - Escape closes it, but only the topmost one: a confirmation opened over a drawer answers Escape first;
 * Call it from an `$effect` in the component that owns the overlay (not from an attachment inside it): Svelte pauses
 * effects inside a block that is animating out, which would keep the page locked until the slide-out finished. In the
 * component's own effect, the lock is released the moment `open` turns false.
 *
 * - everything else on the page is made `inert` (not focusable, not clickable, hidden from screen readers), except
 *   what stdf lays over the page itself (the dimming button), which stays clickable but is out of the tab order.
 */
/** The modals that are open, in the order they opened: only the last is answerable by the keyboard. */
const open: symbol[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function lockModal(node: HTMLElement, onclose: () => void): () => void {
	{
		const me = Symbol('modal');
		open.push(me);
		const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const focusable = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0);
		(focusable()[0] ?? node).focus();

		// Lock the page behind: every sibling along the path up to <body>, apart from stdf's own fixed layers.
		const locked: HTMLElement[] = [];
		for (let current: HTMLElement | null = node; current && current !== document.body; current = current.parentElement) {
			for (const sibling of current.parentElement?.children ?? []) {
				if (!(sibling instanceof HTMLElement) || sibling === current || sibling.inert) continue;
				if (getComputedStyle(sibling).position === 'fixed') {
					// the dimming layer: click to close, but not a stop for the keyboard or a screen reader. stdf dims
					// dark mode with a white wash, so give it the app's own overlay colour (dark in both themes).
					if (sibling instanceof HTMLButtonElement) {
						sibling.tabIndex = -1;
						sibling.setAttribute('aria-hidden', 'true');
						sibling.style.backgroundColor = 'var(--color-overlay)';
					}
					continue;
				}
				sibling.inert = true;
				locked.push(sibling);
			}
		}

		const onkeydown = (event: KeyboardEvent) => {
			if (open[open.length - 1] !== me) return; // another modal is on top of this one and owns the keyboard
			if (event.key === 'Escape' && !event.defaultPrevented) {
				event.preventDefault();
				onclose();
			} else if (event.key === 'Tab') {
				const stops = focusable();
				if (stops.length === 0) return event.preventDefault();
				const first = stops[0];
				const last = stops[stops.length - 1];
				const outside = !node.contains(document.activeElement);
				if (outside || (event.shiftKey && document.activeElement === first)) {
					event.preventDefault();
					(event.shiftKey ? last : first).focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}
		};
		document.addEventListener('keydown', onkeydown);

		return () => {
			document.removeEventListener('keydown', onkeydown);
			open.splice(open.indexOf(me), 1);
			for (const element of locked) element.inert = false;
			returnTo?.focus();
		};
	}
}
