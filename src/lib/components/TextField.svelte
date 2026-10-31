<script lang="ts">
	import { Input as StdfInput } from 'stdf';

	interface Props {
		/** Visible label; also the field's accessible name. */
		label: string;
		value?: string;
		/** Validation message. Marks the field invalid and shows it under the field. */
		error?: string;
		placeholder?: string;
		autocomplete?: 'on' | 'off';
		disabled?: boolean;
	}

	let { label, value = $bindable(''), error, placeholder = '', autocomplete = 'off', disabled = false }: Props = $props();

	// stdf's Input draws the field but does not expose validity or autocomplete on the native
	// <input>, so those are set on it directly to keep assistive technology informed.
	function forward(host: HTMLElement) {
		const input = host.querySelector('input');
		if (!input) return;
		if (error) input.setAttribute('aria-invalid', 'true');
		else input.removeAttribute('aria-invalid');
		input.setAttribute('autocomplete', autocomplete);
	}
</script>

<div class="host" {@attach forward}>
	<StdfInput
		title={label}
		{placeholder}
		{disabled}
		bind:value
		maxlength={1000}
		state={error ? 'error' : 'theme'}
	/>
	<!-- Outside stdf's <label>, so the message never becomes part of the field's name. -->
	<p class="error" aria-live="polite">{error ?? ''}</p>
</div>

<style>
	.host {
		width: 100%;
	}

	.error {
		min-height: 1.25rem;
		margin: var(--space-1) var(--space-4) 0;
		color: var(--color-danger);
		font-size: var(--font-size-footnote);
	}
</style>
