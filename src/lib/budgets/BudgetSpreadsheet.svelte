<script lang="ts">
	import { toString } from '../budget/numbers';
	import TableCell from '../components/TableCell.svelte';
	import type { BudgetRow } from '../state/budgets.svelte';

	let { rows }: { rows: readonly BudgetRow[] } = $props();
</script>

<!--
	Read-only rendering of the derived rows. Code, Total and a Group's Unit price are computed, so
	their cells are marked read-only and hold no controls. Amounts are shown as plain decimals;
	currency formatting is a separate adapter.
-->
<div class="scroll">
	<table aria-label="Budget Items">
		<thead>
			<tr>
				<TableCell header scope="col">Code</TableCell>
				<TableCell header scope="col">Description</TableCell>
				<TableCell header scope="col" numeric>Quantity</TableCell>
				<TableCell header scope="col">Unit</TableCell>
				<TableCell header scope="col" numeric>Unit price</TableCell>
				<TableCell header scope="col" numeric>Total</TableCell>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.id)}
				{@const group = row.kind === 'group'}
				<tr data-kind={row.kind} data-code={row.code}>
					<TableCell readonly><span class="code">{row.code}</span></TableCell>
					<TableCell depth={row.depth} strong={group}>{row.item.description}</TableCell>
					<TableCell numeric>{toString(row.amounts.quantity)}</TableCell>
					<TableCell>{row.item.unit ?? ''}</TableCell>
					<TableCell numeric readonly={group}>{toString(row.amounts.unitPrice)}</TableCell>
					<TableCell numeric readonly strong>{toString(row.amounts.total)}</TableCell>
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

	.code {
		color: var(--color-text-secondary);
		font-variant-numeric: tabular-nums;
	}

	tbody tr:last-child :global(.cell) {
		border-bottom: none;
	}
</style>
