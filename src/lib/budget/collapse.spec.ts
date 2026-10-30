import { describe, expect, it } from 'vitest';
import { collapseAll, expandAll, toggleCollapsed, visibleRows } from './collapse';

interface Row {
	id: string;
	depth: number;
	kind: 'group' | 'line';
	code: string;
}

const row = (code: string, kind: 'group' | 'line'): Row => ({ id: `id-${code}`, depth: code.split('.').length - 1, kind, code });

/**
 * 1 Venue (group)
 *   1.1 Hall (line)
 *   1.2 Decoration (group)
 *     1.2.1 Flowers (line)
 *     1.2.2 Lights (group)
 *       1.2.2.1 Bulbs (line)
 * 2 Catering (line)
 * 3 Music (group)
 *   3.1 Band (line)
 */
const rows = (): Row[] => [
	row('1', 'group'),
	row('1.1', 'line'),
	row('1.2', 'group'),
	row('1.2.1', 'line'),
	row('1.2.2', 'group'),
	row('1.2.2.1', 'line'),
	row('2', 'line'),
	row('3', 'group'),
	row('3.1', 'line')
];

const codes = (list: Row[]) => list.map((r) => r.code);
const ids = (...c: string[]) => new Set(c.map((code) => `id-${code}`));

describe('visibleRows', () => {
	it('shows every row when nothing is collapsed', () => {
		expect(codes(visibleRows(rows(), new Set()))).toEqual(codes(rows()));
	});

	it('hides the descendants of a collapsed Group but keeps the Group itself', () => {
		expect(codes(visibleRows(rows(), ids('1.2')))).toEqual(['1', '1.1', '1.2', '2', '3', '3.1']);
		expect(codes(visibleRows(rows(), ids('3')))).toEqual(['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.2.1', '2', '3']);
	});

	it('hides everything below a collapsed top-level Group, at every depth', () => {
		expect(codes(visibleRows(rows(), ids('1')))).toEqual(['1', '2', '3', '3.1']);
	});

	it('handles a nested Group at the deepest level', () => {
		expect(codes(visibleRows(rows(), ids('1.2.2')))).toEqual(['1', '1.1', '1.2', '1.2.1', '1.2.2', '2', '3', '3.1']);
	});

	it('remembers a collapsed inner Group while an outer one is collapsed', () => {
		const inner = ids('1.2.2');
		expect(codes(visibleRows(rows(), new Set([...inner, ...ids('1')])))).toEqual(['1', '2', '3', '3.1']);
		// Expanding only the outer Group shows the inner one still collapsed.
		expect(codes(visibleRows(rows(), inner))).toEqual(['1', '1.1', '1.2', '1.2.1', '1.2.2', '2', '3', '3.1']);
	});

	it('collapses several Groups independently', () => {
		expect(codes(visibleRows(rows(), ids('1.2', '3')))).toEqual(['1', '1.1', '1.2', '2', '3']);
	});

	it('ignores ids that are Lines or that no longer exist', () => {
		expect(codes(visibleRows(rows(), ids('1.1', '2', '9.9', '3.1')))).toEqual(codes(rows()));
	});

	it('never changes the rows it is given, their order or their values', () => {
		const original = Object.freeze(rows().map((r) => Object.freeze(r)));
		const shown = visibleRows(original as Row[], ids('1'));
		expect(original).toEqual(rows());
		shown.forEach((r) => expect(original).toContain(r)); // the very same row objects
		expect(shown.map((r) => r.code)).toEqual(['1', '2', '3', '3.1']); // Codes are untouched, not renumbered
	});

	it('works for an empty list and for a very deep chain', () => {
		expect(visibleRows([], ids('x'))).toEqual([]);
		const chain: Row[] = Array.from({ length: 20_000 }, (_, i) => ({ id: `n${i}`, depth: i, kind: i < 19_999 ? 'group' : 'line', code: String(i) }));
		expect(visibleRows(chain, new Set(['n10'])).length).toBe(11);
		expect(visibleRows(chain, new Set()).length).toBe(20_000);
	});
});

describe('toggleCollapsed', () => {
	it('adds a Group, then removes it, without touching the set it was given', () => {
		const none = new Set<string>();
		const one = toggleCollapsed(none, 'a');
		expect([...one]).toEqual(['a']);
		expect(none.size).toBe(0);
		expect([...toggleCollapsed(one, 'a')]).toEqual([]);
		expect([...one]).toEqual(['a']);
	});

	it('keeps the other collapsed Groups', () => {
		expect([...toggleCollapsed(new Set(['a', 'b']), 'c')].sort()).toEqual(['a', 'b', 'c']);
		expect([...toggleCollapsed(new Set(['a', 'b']), 'a')]).toEqual(['b']);
	});
});

describe('collapseAll and expandAll', () => {
	it('collapses every Group at every depth, and no Line', () => {
		const all = collapseAll(rows());
		expect([...all].sort()).toEqual(['id-1', 'id-1.2', 'id-1.2.2', 'id-3']);
		expect(codes(visibleRows(rows(), all))).toEqual(['1', '2', '3']);
	});

	it('expands everything', () => {
		expect(expandAll().size).toBe(0);
		expect(codes(visibleRows(rows(), expandAll()))).toEqual(codes(rows()));
	});

	it('collapses nothing when there are no Groups', () => {
		expect(collapseAll([row('1', 'line'), row('2', 'line')]).size).toBe(0);
	});
});
