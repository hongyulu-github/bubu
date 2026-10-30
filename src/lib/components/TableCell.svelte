<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLTdAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLTdAttributes, 'children'> {
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
		...rest
	}: Props = $props();
</script>

<svelte:element
	this={header ? 'th' : 'td'}
	class="cell"
	class:numeric
	class:selected
	class:invalid
	class:readonly
	class:strong
	data-readonly={readonly ? '' : undefined}
	style:--cell-depth={depth}
	scope={header ? (scope ?? 'col') : undefined}
	aria-selected={selected && rest.tabindex !== undefined ? true : undefined}
	aria-invalid={invalid ? 'true' : undefined}
	{...rest}
>
	{@render children()}
</svelte:element>

<style>
	.cell {
		padding: var(--space-3) var(--space-4);
		padding-inline-start: calc(var(--space-4) + min(var(--cell-depth, 0) * var(--space-5), 12rem));
		border-bottom: 1px solid var(--color-border);
		text-align: start;
		font-weight: var(--font-weight-regular);
		color: var(--color-text);
	}

	th.cell {
		font-size: var(--font-size-footnote);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}

	.numeric {
		text-align: end;
		font-variant-numeric: tabular-nums;
	}

	.readonly {
		background: var(--color-readonly-bg);
	}

	.strong {
		font-weight: var(--font-weight-semibold);
	}

	.selected {
		background: var(--color-selected);
	}

	.invalid {
		box-shadow: inset 0 -2px 0 var(--color-danger);
	}

	.cell:focus-visible {
		outline: var(--focus-ring-width) solid var(--color-focus-ring);
		outline-offset: calc(var(--focus-ring-width) * -1);
	}
</style>
