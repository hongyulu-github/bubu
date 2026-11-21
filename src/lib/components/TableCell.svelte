<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTdAttributes } from 'svelte/elements';
	import { TableBodyCell, TableHeadCell } from 'flowbite-svelte';

	interface Props extends Omit<HTMLTdAttributes, 'children' | 'class'> {
		/** Render a `<th>` (column or row header) instead of a `<td>`. */
		header?: boolean;
		scope?: 'col' | 'row';
		/** Right-align with tabular figures for amounts. */
		numeric?: boolean;
		selected?: boolean;
		invalid?: boolean;
		/** Computed or fixed value the user cannot edit: tinted background, no input controls. */
		readonly?: boolean;
		/** Semibold text, e.g. for Group rows. */
		strong?: boolean;
		/** Nesting depth; indents the content. Indentation stops growing at a fixed maximum. */
		depth?: number;
		children: Snippet;
	}

	let {
		header = false,
		scope,
		numeric = false,
		selected = false,
		invalid = false,
		readonly = false,
		strong = false,
		depth = 0,
		children,
		style = '',
		...rest
	}: Props = $props();

	const cellClass = $derived([
		'cell cursor-text border-b border-gray-200 px-3 py-1 whitespace-normal bg-(--row-tint) dark:border-gray-700',
		header && 'cursor-default',
		numeric && 'text-end tabular-nums',
		readonly && 'cursor-default text-gray-500 dark:text-gray-400',
		strong && 'font-semibold',
		selected && 'selected [background-image:linear-gradient(var(--color-selected),var(--color-selected))]',
		invalid && 'shadow-[inset_0_-2px_0] shadow-red-600',
		'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-600'
	]);
</script>

{#snippet content()}
	{@render children()}
{/snippet}

<!-- Flowbite's TableHeadCell and TableBodyCell are the <th> and <td>, with every attribute passed through (data-cell, tabindex, aria-*). -->
{#if header}
	<TableHeadCell
		{...rest as Record<string, unknown>}
		class={cellClass}
		style="padding-inline-start: calc(0.75rem + min({depth} * 1rem, 12rem));{style}"
		scope={scope ?? 'col'}
		data-readonly={readonly ? '' : undefined}
		aria-invalid={invalid ? 'true' : undefined}
	>
		{@render content()}
	</TableHeadCell>
{:else}
	<TableBodyCell
		{...rest as Record<string, unknown>}
		class={cellClass}
		style="padding-inline-start: calc(0.75rem + min({depth} * 1rem, 12rem));{style}"
		data-readonly={readonly ? '' : undefined}
		aria-selected={selected && rest.tabindex !== undefined ? true : undefined}
		aria-invalid={invalid ? 'true' : undefined}
	>
		{@render content()}
	</TableBodyCell>
{/if}
