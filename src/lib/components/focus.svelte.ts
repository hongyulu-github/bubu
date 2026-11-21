/**
 * Give focus back to whatever opened an overlay, once the overlay has really closed.
 *
 * The browser does this for a native <dialog>, but Flowbite closes its dialog only after the fade or slide out has
 * finished, by which time the browser no longer does it. So: remember what had focus when `isOpen` turns true, and
 * call `closed()` from the dialog's `ontoggle` when its new state is "closed". Call this from a component's script.
 *
 * When what opened it is gone by then (a row that was deleted, with the menu button that asked), focus goes to the page's
 * `[data-focus-fallback]` element instead, so it never falls to the top of the page.
 */
export function focusReturn(isOpen: () => boolean, onReopened: () => void) {
  let opener: HTMLElement | null = null;

  $effect.pre(() => {
    if (isOpen() && !opener) {
      const active = document.activeElement;
      opener =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
    }
  });

  return {
    closed(event: ToggleEvent) {
      // The browser reports a modal dialog as open a moment after it was shown, and Flowbite then sets `open` back to
      // true. A close asked for in that moment (a quick Escape) would be undone, leaving the dialog open for good.
      if (event.newState === "open" && !isOpen())
        queueMicrotask(() => onReopened());
      if (event.newState !== "closed") return;
      const target = opener?.isConnected
        ? opener
        : document.querySelector<HTMLElement>("[data-focus-fallback]");
      target?.focus();
      opener = null;
    },
  };
}
