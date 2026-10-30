<script lang="ts">
	import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
	import {
		draggable,
		dropTargetForElements,
		monitorForElements
	} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
	import {
		attachInstruction,
		extractInstruction,
		type Instruction
	} from '@atlaskit/pragmatic-drag-and-drop-hitbox/list-item';
	import type { Attachment } from 'svelte/attachments';
	import { buildItemTree } from '../../budget/tree';
	import { createFixture } from './fixture';
	import { moveItem, rejectionFor, type DropOperation } from './move';

	// Isolated demo state: a local copy of the fixture, never the production Budget store.
	let items = $state.raw(createFixture());
	let draggingId = $state<string | null>(null);
	let indicator = $state<{ targetId: string; kind: DropOperation | 'blocked' } | null>(null);
	let message = $state('Drag a row onto another row: before, inside, or after.');

	const tree = $derived(buildItemTree(items));
	const description = (id: string) => tree.nodes.get(id)?.item.description ?? id;

	const OPERATION_NAMES: Record<Instruction['operation'], DropOperation> = {
		'reorder-before': 'before',
		'reorder-after': 'after',
		combine: 'inside'
	};

	function describeRejection(reason: string, dragId: string, targetId: string): string {
		return reason === 'onto-own-descendant'
			? `Rejected: "${description(dragId)}" cannot be dropped into its own descendant "${description(targetId)}".`
			: `Rejected: "${description(dragId)}" cannot be dropped onto itself.`;
	}

	/** Make one row both draggable and a drop target (Pragmatic works on plain DOM elements). */
	function rowDnd(id: string, hasChildren: boolean): Attachment<HTMLElement> {
		return (node) =>
			combine(
				draggable({
					element: node,
					getInitialData: () => ({ type: 'tree-row', id }),
					onDragStart: () => {
						draggingId = id;
					},
					onDrop: () => {
						draggingId = null;
						indicator = null;
					}
				}),
				dropTargetForElements({
					element: node,
					canDrop: ({ source }) => source.data.type === 'tree-row',
					getData: ({ input, element, source }) => {
						const dragId = source.data.id as string;
						const rejection = rejectionFor(items, dragId, id);
						// Dropping on itself gives no feedback; dropping into a descendant is shown as blocked.
						const operations =
							rejection === 'onto-itself'
								? {}
								: rejection
									? ({ 'reorder-before': 'blocked', 'reorder-after': 'blocked', combine: 'blocked' } as const)
									: ({
											'reorder-before': 'available',
											// After an item that shows its children is visually inside it; use the last child.
											'reorder-after': hasChildren ? 'not-available' : 'available',
											combine: 'available'
										} as const);
						return attachInstruction({ id }, { input, element, operations });
					},
					onDrag: ({ self }) => showIndicator(id, extractInstruction(self.data)),
					onDragEnter: ({ self }) => showIndicator(id, extractInstruction(self.data)),
					onDragLeave: () => {
						if (indicator?.targetId === id) indicator = null;
					}
				})
			);
	}

	function showIndicator(targetId: string, instruction: Instruction | null) {
		if (!instruction) {
			if (indicator?.targetId === targetId) indicator = null;
			return;
		}
		const kind = instruction.blocked ? 'blocked' : OPERATION_NAMES[instruction.operation];
		if (indicator?.targetId !== targetId || indicator.kind !== kind) indicator = { targetId, kind };
	}

	$effect(() =>
		monitorForElements({
			canMonitor: ({ source }) => source.data.type === 'tree-row',
			onDrop({ source, location }) {
				const target = location.current.dropTargets[0];
				if (!target) {
					message = 'Dropped outside the tree: nothing changed.';
					return;
				}
				const dragId = source.data.id as string;
				const targetId = target.data.id as string;
				const instruction = extractInstruction(target.data);
				if (!instruction) return;

				if (instruction.blocked) {
					message = describeRejection(rejectionFor(items, dragId, targetId) ?? 'onto-itself', dragId, targetId);
					return;
				}
				const operation = OPERATION_NAMES[instruction.operation];
				const result = moveItem(items, dragId, targetId, operation);
				if (!result.ok) {
					message = describeRejection(result.reason, dragId, targetId);
					return;
				}
				items = result.items;
				const descendants = result.movedIds.length - 1;
				message =
					`Moved "${description(dragId)}"` +
					(descendants > 0 ? ` with ${descendants} descendant${descendants === 1 ? '' : 's'}` : '') +
					` ${operation} "${description(targetId)}".`;
			}
		})
	);

	function reset() {
		items = createFixture();
		message = 'Reset to the original fixture.';
	}
</script>

<section class="demo">
	<header>
		<h1>Tree drag and drop prototype</h1>
		<p>
			Isolated demo of Pragmatic drag and drop in Svelte 5. It uses its own fixture and is not connected
			to the editor.
		</p>
		<button type="button" onclick={reset}>Reset</button>
	</header>

	<p class="status" role="status" aria-live="polite">{message}</p>

	<ul class="tree" role="tree" aria-label="Budget Items">
		{#each tree.ordered as node (node.item.id)}
			<li
				role="treeitem"
				aria-selected="false"
				aria-level={node.depth + 1}
				aria-label="{node.code} {node.item.description}"
				class="row"
				class:dragging={draggingId === node.item.id}
				data-drop={indicator?.targetId === node.item.id ? indicator.kind : undefined}
				style:--depth={node.depth}
				{@attach rowDnd(node.item.id, node.kind === 'group')}
			>
				<span class="code">{node.code}</span>
				<span class="label">{node.item.description}</span>
				<span class="kind">{node.kind}</span>
			</li>
		{/each}
	</ul>

	<details>
		<summary>Flat Items (what a move actually changes)</summary>
		<pre>{JSON.stringify(
				items.map((i) => ({ item: i.description, parent: i.parentId ? description(i.parentId) : null, sortIndex: i.sortIndex })),
				null,
				1
			)}</pre>
	</details>
</section>

<style>
	.demo {
		max-width: 38rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h1 {
		margin: 0 0 var(--space-2);
		font-size: var(--font-size-title);
	}

	header p {
		margin: 0 0 var(--space-3);
		color: var(--color-text-secondary);
		font-size: var(--font-size-callout);
	}

	button {
		min-height: var(--control-height);
		padding: 0 var(--space-4);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		color: var(--color-text);
		font: inherit;
		cursor: pointer;
	}

	button:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.status {
		margin: 0;
		min-height: 3em;
		font-size: var(--font-size-callout);
	}

	.tree {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--control-height);
		padding: 0 var(--space-4) 0 calc(var(--space-4) + var(--depth) * var(--space-5));
		border-bottom: 1px solid var(--color-border);
		cursor: grab;
		user-select: none;
	}

	.row:last-child {
		border-bottom: none;
	}

	.row.dragging {
		opacity: 0.45;
	}

	.code {
		min-width: 3.5rem;
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	.label {
		flex: 1;
	}

	.kind {
		color: var(--color-text-secondary);
		font-size: var(--font-size-caption);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	/* Drop feedback: a line above, a line below, or a box around the row. Blocked is red. */
	.row[data-drop='before']::before,
	.row[data-drop='after']::after {
		content: '';
		position: absolute;
		left: calc(var(--space-4) + var(--depth) * var(--space-5));
		right: 0;
		height: 3px;
		border-radius: 2px;
		background: var(--color-accent);
		pointer-events: none;
	}

	.row[data-drop='before']::before {
		top: -2px;
	}

	.row[data-drop='after']::after {
		bottom: -2px;
	}

	.row[data-drop='inside'] {
		background: var(--color-selected);
		outline: 2px solid var(--color-accent);
		outline-offset: -2px;
	}

	.row[data-drop='blocked'] {
		background: color-mix(in srgb, var(--color-danger) 14%, transparent);
		outline: 2px solid var(--color-danger);
		outline-offset: -2px;
		cursor: not-allowed;
	}

	pre {
		margin: var(--space-2) 0 0;
		padding: var(--space-3);
		overflow: auto;
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		font-size: var(--font-size-footnote);
	}
</style>
