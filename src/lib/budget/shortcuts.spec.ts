import { describe, expect, it } from 'vitest';
import { parseHistoryShortcut, type KeyPress } from './shortcuts';

const press = (overrides: Partial<KeyPress> = {}): KeyPress => ({
	key: 'z',
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	...overrides
});

describe('parseHistoryShortcut', () => {
	it('reads Ctrl+Z and Cmd+Z as undo', () => {
		expect(parseHistoryShortcut(press({ ctrlKey: true }))).toBe('undo');
		expect(parseHistoryShortcut(press({ metaKey: true }))).toBe('undo');
	});

	it('reads Ctrl+Shift+Z and Cmd+Shift+Z as redo (the key arrives as an upper-case Z)', () => {
		expect(parseHistoryShortcut(press({ ctrlKey: true, shiftKey: true, key: 'Z' }))).toBe('redo');
		expect(parseHistoryShortcut(press({ metaKey: true, shiftKey: true, key: 'Z' }))).toBe('redo');
		expect(parseHistoryShortcut(press({ metaKey: true, shiftKey: true, key: 'z' }))).toBe('redo');
	});

	it('ignores a bare z, with or without Shift', () => {
		expect(parseHistoryShortcut(press())).toBeNull();
		expect(parseHistoryShortcut(press({ shiftKey: true, key: 'Z' }))).toBeNull();
	});

	it('ignores other keys with the modifier', () => {
		for (const key of ['y', 'a', 'x', 'c', 'v', 'Enter', 'ArrowDown', 'Escape']) {
			expect(parseHistoryShortcut(press({ ctrlKey: true, key })), key).toBeNull();
		}
	});

	it('ignores both platform modifiers together, and Alt combinations', () => {
		expect(parseHistoryShortcut(press({ ctrlKey: true, metaKey: true }))).toBeNull();
		expect(parseHistoryShortcut(press({ ctrlKey: true, altKey: true }))).toBeNull();
		expect(parseHistoryShortcut(press({ metaKey: true, altKey: true, shiftKey: true, key: 'Z' }))).toBeNull();
	});

	it('ignores keys pressed while an input method is composing', () => {
		expect(parseHistoryShortcut(press({ ctrlKey: true, isComposing: true }))).toBeNull();
	});
});
