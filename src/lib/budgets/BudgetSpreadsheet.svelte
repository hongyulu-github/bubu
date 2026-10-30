<script lang="ts">
	import { canEditField, type EditResult, type EditableField } from '../budget/edit';
	import { toString } from '../budget/numbers';
	import Button from '../components/Button.svelte';
	import TableCell from '../components/TableCell.svelte';
	import type { BudgetRow } from '../state/budgets.svelte';
	import ItemCellEditor from './ItemCellEditor.svelte';

	interface Props {
		rows: readonly BudgetRow[];
		/**
		 * Commit an edit. When omitted the table is read-only. Which cells are editable at all is
		 * decided here (see `canEditField`), not by the caller.
		 */
		onedit?: (itemId: string, field: EditableField, text: string) => EditResult;
		/** Add an Item directly after this one, under the same parent. Shows a row action when given. */
		onadd?: (siblingId: string) => void;
	}

	let { rows, onedit, onadd }: Props = $props();
</script>

<!--
	The derived rows. Code, Total and a Group's Unit price are computed, so their cells are marked
	read-only and hold no controls; the other cells are inputs when `onedit` is given. Amounts are
	shown as plain decimals; currency formatting is a separate adapter.
-->
{#snippet editor(row: BudgetRow, field: EditableField, column: string, value: string)}
	{#if canEditField(row.kind, field)}
		<ItemCellEditor
			{field}
			label="{column} {row.code}"
			{value}
			oncommit={(text) => onedit!(row.id, field, text)}
		/>
	{/if}
{/snippet}

<div class="scroll">
	<table aria-label="Budget Items">
		<colgroup>
			<col style="width: 5rem" />
			<col />
			<col style="width: 7.5rem" />
			<col style="width: 7.5rem" />
			<col style="width: 9rem" />
			<col style="width: 9rem" />
			{#if onadd}<col style="width: 8.5rem" />{/if}
		</colgroup>
		<thead>
			<tr>
				<TableCell header scope="col">Code</TableCell>
				<TableCell header scope="col">Description</TableCell>
				<TableCell header scope="col" numeric>Quantity</TableCell>
				<TableCell header scope="col">Unit</TableCell>
				<TableCell header scope="col" numeric>Unit price</TableCell>
				<TableCell header scope="col" numeric>Total</TableCell>
				{#if onadd}
					<TableCell header scope="col"><span class="visually-hidden">Actions</span></TableCell>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				{@const group = row.kind === 'group'}
				<tr data-kind={row.kind} data-code={row.code} data-item-id={row.id}>
					<TableCell readonly><span class="code">{row.code}</span></TableCell>
					<TableCell depth={row.depth} strong={group}>
						{#if onedit}
							{@render editor(row, 'description', 'Description', row.item.description)}
						{:else}
							{row.item.description}
						{/if}
					</TableCell>
					<TableCell numeric>
						{#if onedit}
							{@render editor(row, 'quantity', 'Quantity', row.item.quantity)}
						{:else}
							{toString(row.amounts.quantity)}
						{/if}
					</TableCell>
					<TableCell>
						{#if onedit}
							{@render editor(row, 'unit', 'Unit', row.item.unit ?? '')}
						{:else}
							{row.item.unit ?? ''}
						{/if}
					</TableCell>
					<TableCell numeric readonly={group}>
						{#if onedit && !group}
							{@render editor(row, 'unitPrice', 'Unit price', row.item.unitPrice)}
						{:else}
							{toString(row.amounts.unitPrice)}
						{/if}
					</TableCell>
					<TableCell numeric readonly strong>{toString(row.amounts.total)}</TableCell>
					{#if onadd}
						<TableCell>
							<Button compact aria-label="Add item below {row.code}" onclick={() => onadd(row.id)}>Add below</Button>
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

	.code {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	tbody tr:last-child :global(.cell) {
		border-bottom: none;
	}
</style>
