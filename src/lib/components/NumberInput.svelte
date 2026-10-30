<script lang="ts">
	import { untrack } from 'svelte';
	import Input from './Input.svelte';

	interface Props {
		label: string;
		/** Parsed number, or null while the field is empty or invalid. */
		value?: number | null;
		min?: number;
		max?: number;
		required?: boolean;
		disabled?: boolean;
		hint?: string;
		/** External validation message; takes precedence over built-in validation. */
		error?: string;
		/** Fires on every keystroke with the parsed value (null when empty or invalid). */
		oninput?: (value: number | null, text: string) => void;
		/** Fires when the user commits the field (blur or Enter) with the parsed value. */
		onchange?: (value: number | null, text: string) => void;
	}

	let {
		label,
		value = $bindable(null),
		min,
		max,
		required = false,
		disabled = false,
		hint,
		error,
		oninput,
		onchange
	}: Props = $props();

	// Plain decimal notation only; locale-aware parsing belongs with the arithmetic helpers.
	const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)$/;

	function parse(text: string): number | null {
		const trimmed = text.trim();
		return NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : null;
	}

	function validate(text: string): string | undefined {
		const trimmed = text.trim();
		if (trimmed === '') return required ? 'Enter a number.' : undefined;
		const parsed = parse(trimmed);
		if (parsed === null) return 'Enter a valid number.';
		if (min !== undefined && parsed < min) return `Must be at least ${min}.`;
		if (max !== undefined && parsed > max) return `Must be at most ${max}.`;
		return undefined;
	}

	let text = $state(untrack(() => (value === null ? '' : String(value))));
	// Only show built-in validation after the field was touched, so it does not start in error.
	let touched = $state(false);

	// Keep the text in sync when the bound value is changed from outside.
	$effect(() => {
		const external = value;
		if (external !== parse(untrack(() => text))) {
			text = external === null ? '' : String(external);
		}
	});

	const message = $derived(error ?? (touched ? validate(text) : undefined));

	function emit(handler: Props['oninput']) {
		const parsed = validate(text) ? null : parse(text);
		value = parsed;
		handler?.(parsed, text);
	}
</script>

<Input
	{label}
	{hint}
	{disabled}
	{required}
	error={message}
	bind:value={text}
	type="text"
	inputmode="decimal"
	autocomplete="off"
	oninput={() => emit(oninput)}
	onchange={() => {
		touched = true;
		emit(onchange);
	}}
	onblur={() => (touched = true)}
	onkeydown={(event) => {
		if (event.key === 'Enter') {
			touched = true;
			emit(onchange);
		}
	}}
/>
