import { describe, expect, it } from 'vitest';
import { buildItemTree } from '../../budget/tree';
import { createFixture, uuid } from './fixture';
import { moveItem, rejectionFor } from './move';

const VENUE = uuid(1);
const DECORATION = uuid(3);
const FLOWERS = uuid(4);
const CATERING = uuid(6);
const FOOD = uuid(7);
const MUSIC = uuid(9);
const PHOTOGRAPHY = uuid(10);

const outline = (items: ReturnType<typeof createFixture>) =>
	buildItemTree(items).ordered.map((node) => `${node.code} ${node.item.description}`);

function move(dragId: string, targetId: string, operation: 'before' | 'after' | 'inside') {
	const result = moveItem(createFixture(), dragId, targetId, operation);
	if (!result.ok) throw new Error(`rejected: ${result.reason}`);
	return result;
}

describe('sibling ordering', () => {
	it('moves a root before another root', () => {
		const { items } = move(PHOTOGRAPHY, VENUE, 'before');
		expect(outline(items).filter((row) => !row.includes('.'))).toEqual([
			'1 Photography',
			'2 Venue',
			'3 Catering',
			'4 Music'
		]);
	});

	it('moves a root after another root', () => {
		const { items } = move(VENUE, MUSIC, 'after');
		expect(outline(items).filter((row) => !row.includes('.'))).toEqual([
			'1 Catering',
			'2 Music',
			'3 Venue',
			'4 Photography'
		]);
	});

	it('reorders within a parent', () => {
		const { items } = move(uuid(8), FOOD, 'before'); // Drinks before Food
		expect(outline(items)).toContain('2.1 Drinks');
		expect(outline(items)).toContain('2.2 Food');
	});
});

describe('reparenting', () => {
	it('moves an Item inside another, appended as the last child', () => {
		const { items, newParentId } = move(MUSIC, CATERING, 'inside');
		expect(newParentId).toBe(CATERING);
		expect(outline(items)).toContain('2.3 Music');
	});

	it('turns a Line into a Group when something is dropped inside it', () => {
		const { items } = move(PHOTOGRAPHY, MUSIC, 'inside');
		const music = buildItemTree(items).nodes.get(MUSIC)!;
		expect(music.kind).toBe('group');
		expect(outline(items)).toContain('3.1 Photography');
	});

	it('moves a nested Item next to a top-level Item (out of its parent)', () => {
		const { items } = move(FOOD, MUSIC, 'after');
		expect(buildItemTree(items).nodes.get(FOOD)!.parentId).toBeNull();
		expect(outline(items)).toContain('4 Food');
	});

	it('moves a parent together with all its descendants', () => {
		const result = move(DECORATION, CATERING, 'inside');
		expect(result.movedIds).toEqual([DECORATION, FLOWERS, uuid(5)]);
		const tree = buildItemTree(result.items);
		expect(tree.nodes.get(DECORATION)!.code).toBe('2.3');
		expect(tree.nodes.get(FLOWERS)!.code).toBe('2.3.1');
		expect(tree.nodes.get(FLOWERS)!.parentId).toBe(DECORATION); // children keep their own parentId
	});

	it('turns a Group back into a Line when its last child leaves', () => {
		const { items } = move(FOOD, MUSIC, 'after');
		const afterOneMove = moveItem(items, uuid(8), MUSIC, 'after');
		expect(afterOneMove.ok && buildItemTree(afterOneMove.items).nodes.get(CATERING)!.kind).toBe('line');
	});
});

describe('rejections', () => {
	it('rejects dropping an Item onto itself', () => {
		expect(rejectionFor(createFixture(), VENUE, VENUE)).toBe('onto-itself');
		expect(moveItem(createFixture(), VENUE, VENUE, 'inside')).toEqual({ ok: false, reason: 'onto-itself' });
	});

	it('rejects every drop onto a descendant, for each operation', () => {
		for (const operation of ['before', 'after', 'inside'] as const) {
			for (const descendant of [DECORATION, FLOWERS, uuid(2)]) {
				expect(moveItem(createFixture(), VENUE, descendant, operation), `${operation} ${descendant}`).toEqual({
					ok: false,
					reason: 'onto-own-descendant'
				});
			}
		}
	});

	it('allows dropping onto an ancestor or an unrelated Item', () => {
		expect(rejectionFor(createFixture(), FLOWERS, VENUE)).toBeNull();
		expect(rejectionFor(createFixture(), FLOWERS, MUSIC)).toBeNull();
	});

	it('rejects unknown Items', () => {
		expect(rejectionFor(createFixture(), 'nope', VENUE)).toBe('unknown-item');
	});
});

describe('purity', () => {
	it('never mutates the input and returns a result that is still a valid flat array', () => {
		const original = Object.freeze(createFixture().map((item) => Object.freeze({ ...item })));
		const result = moveItem(original, DECORATION, CATERING, 'inside');
		expect(result.ok).toBe(true);
		expect(original).toEqual(createFixture());
	});
});
