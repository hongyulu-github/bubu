/**
 * Which key presses mean undo or redo of Item commands. Pure, so it can be tested without a DOM.
 *
 * Cmd+Z / Ctrl+Z undo and Cmd+Shift+Z / Ctrl+Shift+Z redo: exactly one platform modifier (Cmd on
 * macOS, Ctrl on Windows and Linux, both accepted everywhere), no Alt, and not while an input method
 * is composing text. Whether the keystroke should instead stay with the browser's own text undo is
 * decided where the event happens, because it depends on what has focus.
 */
export type HistoryShortcut = 'undo' | 'redo';

export interface KeyPress {
	readonly key: string;
	readonly ctrlKey: boolean;
	readonly metaKey: boolean;
	readonly shiftKey: boolean;
	readonly altKey: boolean;
	readonly isComposing?: boolean;
}

export function parseHistoryShortcut(press: KeyPress): HistoryShortcut | null {
	if (press.isComposing || press.altKey) return null;
	if (press.ctrlKey === press.metaKey) return null; // neither, or both: not a platform shortcut
	if (press.key.toLowerCase() !== 'z') return null;
	return press.shiftKey ? 'redo' : 'undo';
}
