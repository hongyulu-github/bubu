<script lang="ts">
	import { canEditField, type EditResult, type EditableField } from '../budget/edit';
	import {
		adjacentEditableCell,
		isEditableCell,
		moveCell,
		settleCell,
		COLUMNS,
		type Cell,
		type Column,
		type Direction
	} from '../budget/grid';
	import { formatMoney } from '../budget/currency';
	import { toString } from '../budget/numbers';
	import Button from '../components/Button.svelte';
	import TableCell from '../components/TableCell.svelte';
	import type { BudgetRow } from '../state/budgets.svelte';
	import ItemCellEditor from './ItemCellEditor.svelte';

	interface Props {
		rows: readonly BudgetRow[];
		/** The Budget currency: monetary cells are shown in it, rounded to its minor units for display only. */
		currency: string;
		/**
		 * Commit an edit. When omitted the table is read-only. Which cells are editable at all is
		 * decided here (see `canEditField`), not by the caller.
		 */
		onedit?: (itemId: string, field: EditableField, text: string) => EditResult;
		/** Add an Item directly after this one, under the same parent. Shows a row action when given. */
		onadd?: (siblingId: string) => void;
		/** Delete this Item (and anything beneath it). Shows a row action when given. */
		ondelete?: (itemId: string) => void;
		/** Add a child inside this Item (a Line becomes a Group). Shows a row action when given. */
		onaddchild?: (parentId: string) => void;
		/** Ids of collapsed Groups, for the toggles' state. The caller passes only the rows to show. */
		collapsed?: ReadonlySet<string>;
		/** Collapse or expand a Group. Shows a toggle on every Group row when given. */
		ontoggle?: (groupId: string) => void;
	}

	let { rows, currency, onedit, onadd, ondelete, onaddchild, collapsed = new Set<string>(), ontoggle }: Props = $props();

	// --- Keyboard: which cell is active, and whether it is being edited -----------------------------
	// Navigation focuses the cell itself; editing focuses the input inside it. Both are read from real
	// DOM focus, so clicking an input with the mouse works the same way. `rows` is only what is visible,
	// so collapsed descendants are skipped without any extra rule.
	let table: HTMLTableElement | undefined = $state();
	let active = $state.raw<(Cell & { index: number }) | null>(null);

	/** Attributes that make a data cell a focusable grid cell with a roving tab stop. */
	function cell(row: BudgetRow, column: Column) {
		const isTabStop = tabStop?.rowId === row.id && tabStop.column === column;
		return { tabindex: isTabStop ? 0 : -1, 'data-cell': `${row.id}|${column}` };
	}

	const ARROWS: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

	// The one cell that is a tab stop: the active cell, or the first Description if there is none yet.
	const tabStop = $derived.by<Cell | null>(() => {
		if (rows.length === 0) return null;
		const settled = active ? settleCell(rows, active, active.index) : null;
		return settled ?? { rowId: rows[0].id, column: 'description' };
	});

	function cellSelector(cell: Cell): string {
		return `[data-cell="${cell.rowId}|${cell.column}"]`;
	}

	function focusCell(cell: Cell) {
		table?.querySelector<HTMLElement>(cellSelector(cell))?.focus();
	}

	function startEditing(cell: Cell): boolean {
		const row = rows.find((candidate) => candidate.id === cell.rowId);
		if (!onedit || !row || !isEditableCell(row.kind, cell.column)) return false; // read-only never edits
		const input = table?.querySelector<HTMLElement>(cellSelector(cell))?.querySelector('input');
		if (!input) return false;
		input.focus();
		input.select();
		return true;
	}

	function cellOf(element: EventTarget | null): Cell | null {
		const td = element instanceof HTMLElement ? element.closest<HTMLElement>('[data-cell]') : null;
		if (!td?.dataset.cell) return null;
		const [rowId, column] = td.dataset.cell.split('|');
		return COLUMNS.includes(column as Column) ? { rowId, column: column as Column } : null;
	}

	function onfocusin(event: FocusEvent) {
		const cell = cellOf(event.target);
		if (cell) active = { ...cell, index: rows.findIndex((row) => row.id === cell.rowId) };
	}

	/** Keys on a focused cell (not on an input inside it: typing there is editing, never navigation). */
	function onkeydown(event: KeyboardEvent) {
		if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
		const target = event.target as HTMLElement;
		const cell = target.matches('[data-cell]') ? cellOf(target) : null;
		if (!cell) return;

		if (event.key in ARROWS) {
			event.preventDefault();
			focusCell(moveCell(rows, cell, ARROWS[event.key]));
		} else if (event.key === 'Enter' || event.key === 'F2') {
			if (startEditing(cell)) event.preventDefault();
		}
	}

	/** Where to go after an edit ends in `cell`. Returns whether focus moved. */
	function navigateFrom(cell: Cell, action: 'down' | 'next' | 'previous' | 'cancel'): boolean {
		if (action === 'cancel') {
			focusCell(cell);
			return true;
		}
		const target =
			action === 'down' ? moveCell(rows, cell, 'down') : adjacentEditableCell(rows, cell, action === 'next' ? 1 : -1);
		if (!target) return false; // past the last or before the first editable cell: Tab leaves the grid
		focusCell(target);
		return true;
	}

	// If a re-render takes away the element that had focus (a row deleted, a cell turned read-only), put
	// focus back on the nearest cell instead of letting it fall to the page. Whether focus was inside the
	// grid is noted just before the DOM updates, so clicking elsewhere is never mistaken for a removal.
	let hadFocus = false;
	$effect.pre(() => {
		void rows;
		hadFocus = table?.contains(document.activeElement) ?? false;
	});
	$effect(() => {
		void rows;
		if (hadFocus && active && !table?.contains(document.activeElement)) {
			const cell = settleCell(rows, active, active.index);
			if (cell) focusCell(cell);
		}
		hadFocus = false;
	});
	const hasActions = $derived(onadd !== undefined || ondelete !== undefined || onaddchild !== undefined);
</script>

<!--
	The derived rows. Code, Total and a Group's Unit price are computed, so their cells are marked
	read-only and hold no controls; the other cells are inputs when `onedit` is given. Read-only money
	is formatted in the Budget currency for display; inputs keep the exact value, and nothing here
	rounds what is stored or calculated.
-->
{#snippet editor(row: BudgetRow, field: EditableField, column: string, value: string)}
	{#if canEditField(row.kind, field)}
		<ItemCellEditor
			{field}
			label="{column} {row.code}"
			{value}
			oncommit={(text) => onedit!(row.id, field, text)}
			onnavigate={(action) => navigateFrom({ rowId: row.id, column: field }, action)}
		/>
	{/if}
{/snippet}

<div class="scroll">
	<table role="grid" aria-label="Budget Items" bind:this={table} {onfocusin} {onkeydown}>
		<colgroup>
			<col style="width: 5rem" />
			<col />
			<col style="width: 6.5rem" />
			<col style="width: 6.5rem" />
			<col style="width: 8rem" />
			<col style="width: 8rem" />
			{#if hasActions}<col style="width: 19rem" />{/if}
		</colgroup>
		<thead>
			<tr>
				<TableCell header scope="col">Code</TableCell>
				<TableCell header scope="col">Description</TableCell>
				<TableCell header scope="col" numeric>Quantity</TableCell>
				<TableCell header scope="col">Unit</TableCell>
				<TableCell header scope="col" numeric>Unit price</TableCell>
				<TableCell header scope="col" numeric>Total</TableCell>
				{#if hasActions}
					<TableCell header scope="col"><span class="visually-hidden">Actions</span></TableCell>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				{@const group = row.kind === 'group'}
				<tr data-kind={row.kind} data-code={row.code} data-item-id={row.id}>
					<TableCell readonly {...cell(row, 'code')}><span class="code">{row.code}</span></TableCell>
					<TableCell depth={row.depth} strong={group} {...cell(row, 'description')}>
						<div class="description">
							{#if ontoggle}
								{#if group}
									{@const open = !collapsed.has(row.id)}
									<button
										type="button"
										class="toggle"
										aria-expanded={open}
										aria-label="{open ? 'Collapse' : 'Expand'} {row.code}"
										onclick={() => ontoggle(row.id)}
									>
										<span aria-hidden="true" class="chevron" class:open></span>
									</button>
								{:else}
									<span class="toggle-space" aria-hidden="true"></span>
								{/if}
							{/if}
							{#if onedit}
								{@render editor(row, 'description', 'Description', row.item.description)}
							{:else}
								{row.item.description}
							{/if}
						</div>
					</TableCell>
					<TableCell numeric {...cell(row, 'quantity')}>
						{#if onedit}
							{@render editor(row, 'quantity', 'Quantity', row.item.quantity)}
						{:else}
							{toString(row.amounts.quantity)}
						{/if}
					</TableCell>
					<TableCell {...cell(row, 'unit')}>
						{#if onedit}
							{@render editor(row, 'unit', 'Unit', row.item.unit ?? '')}
						{:else}
							{row.item.unit ?? ''}
						{/if}
					</TableCell>
					<TableCell numeric readonly={group} {...cell(row, 'unitPrice')}>
						{#if onedit && !group}
							{@render editor(row, 'unitPrice', 'Unit price', row.item.unitPrice)}
						{:else}
							{formatMoney(row.amounts.unitPrice, currency)}
						{/if}
					</TableCell>
					<TableCell numeric readonly strong {...cell(row, 'total')}>{formatMoney(row.amounts.total, currency)}</TableCell>
					{#if hasActions}
						<TableCell>
							<div class="actions">
								{#if onadd}
									<Button compact aria-label="Add item below {row.code}" onclick={() => onadd(row.id)}>Add below</Button>
								{/if}
								{#if onaddchild}
									<Button compact aria-label="Add child to {row.code}" onclick={() => onaddchild(row.id)}>Add child</Button>
								{/if}
								{#if ondelete}
									<Button compact aria-label="Delete {row.code}" onclick={() => ondelete(row.id)}>Delete</Button>
								{/if}
							</div>
						</TableCell>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.scroll {
		overflow-x: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	table {
		width: 100%;
		min-width: 40rem;
		border-collapse: collapse;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.description {
		display: flex;
		align-items: center;
		gap: var(--space-1);
	}

	.toggle,
	.toggle-space {
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
	}

	.toggle:hover {
		background: var(--color-readonly-bg);
		color: var(--color-text);
	}

	.toggle:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: var(--focus-ring-offset);
	}

	.chevron {
		width: 0.5rem;
		height: 0.5rem;
		border-right: 2px solid currentColor;
		border-bottom: 2px solid currentColor;
		transform: rotate(-45deg); /* points right: collapsed */
		transition: transform var(--duration-fast);
	}

	.chevron.open {
		transform: rotate(45deg); /* points down: expanded */
	}

	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}

	.actions {
		display: flex;
		gap: var(--space-2);
	}

	.code {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	tbody tr:last-child :global(.cell) {
		border-bottom: none;
	}
</style>
