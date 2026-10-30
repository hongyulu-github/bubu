<script lang="ts">
	import { parseQuantity, parseUnitPrice, parseErrorMessage, type ParseResult } from '../budget/numbers';
	import Input from './Input.svelte';

	interface Props {
		label: string;
		/** The text in the field. Numbers stay strings so no digit is ever lost to floating point. */
		value?: string;
		/** `quantity` rejects negatives; `amount` (the default) accepts any decimal, including negatives. */
		kind?: 'quantity' | 'amount';
		disabled?: boolean;
		hint?: string;
		/** External validation message; takes precedence over the built-in one. */
		error?: string;
		hideLabel?: boolean;
		compact?: boolean;
		/** Pass -1 to take the field out of the Tab order (e.g. a cell in a grid that has its own tab stop). */
		tabindex?: number;
		/** Fires on every keystroke with the current text. */
		oninput?: (text: string) => void;
		/** Fires when the user commits the field (blur or Enter), with the text and how it parsed. */
		onchange?: (text: string, result: ParseResult) => void;
	}

	let {
		label,
		value = $bindable(''),
		kind = 'amount',
		disabled = false,
		hint,
		error,
		hideLabel = false,
		compact = false,
		tabindex,
		oninput,
		onchange
	}: Props = $props();

	const parse = (text: string) => (kind === 'quantity' ? parseQuantity(text) : parseUnitPrice(text));
	const parsed = $derived(parse(value));

	// Show built-in validation only after the field was touched, so it does not start in error.
	let touched = $state(false);
	const message = $derived(error ?? (touched && !parsed.ok ? parseErrorMessage(parsed.error) : undefined));
</script>

<Input
	{label}
	{hint}
	{disabled}
	{hideLabel}
	{compact}
	numeric
	{tabindex}
	error={message}
	bind:value
	type="text"
	inputmode="decimal"
	autocomplete="off"
	oninput={() => oninput?.(value)}
	onchange={() => {
		touched = true;
		onchange?.(value, parsed);
	}}
	onblur={() => (touched = true)}
	onkeydown={(event) => {
		if (event.key === 'Enter') touched = true;
	}}
/>
