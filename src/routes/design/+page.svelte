<script lang="ts">
	import { Button, Dialog, Input, NumberInput, TableCell } from '#lib';

	let open = $state(false);
	let name = $state('');
	let amount = $state('1200.50');
	let theme = $state<'system' | 'light' | 'dark'>('system');

	// Preview-only override so both themes can be compared without changing the OS setting.
	$effect(() => {
		if (theme === 'system') delete document.documentElement.dataset.theme;
		else document.documentElement.dataset.theme = theme;
	});
</script>

<main>
	<h1>Design foundation</h1>
	<p class="lead">Preview of tokens and base components.</p>

	<div class="row" role="group" aria-label="Preview theme">
		{#each ['system', 'light', 'dark'] as const as option}
			<Button variant={theme === option ? 'primary' : 'secondary'} onclick={() => (theme = option)}>
				{option}
			</Button>
		{/each}
	</div>

	<section>
		<h2>Buttons</h2>
		<div class="row">
			<Button variant="primary">Primary</Button>
			<Button>Secondary</Button>
			<Button variant="destructive">Delete</Button>
			<Button disabled>Disabled</Button>
		</div>
	</section>

	<section>
		<h2>Inputs</h2>
		<div class="stack">
			<Input label="Budget name" hint="Shown in your list" bind:value={name} />
			<Input label="With error" value="Oops" error="This name is already used." />
			<NumberInput label="Amount" bind:value={amount} hint="Plain decimal, e.g. 1200.50; negatives allowed" />
			<Input label="Disabled" value="Read only" disabled />
		</div>
	</section>

	<section>
		<h2>Table</h2>
		<table>
			<thead>
				<tr>
					<TableCell header>Item</TableCell>
					<TableCell header numeric>Amount</TableCell>
				</tr>
			</thead>
			<tbody>
				<tr>
					<TableCell>Rent</TableCell>
					<TableCell numeric tabindex={0}>1,200.50</TableCell>
				</tr>
				<tr>
					<TableCell>Food</TableCell>
					<TableCell numeric tabindex={0} selected>320.00</TableCell>
				</tr>
				<tr>
					<TableCell>Transport</TableCell>
					<TableCell numeric tabindex={0} invalid>abc</TableCell>
				</tr>
			</tbody>
		</table>
	</section>

	<section>
		<h2>Dialog</h2>
		<Button variant="primary" onclick={() => (open = true)}>Open dialog</Button>
		<Dialog bind:open title="Delete budget?" description="This cannot be undone.">
			{#snippet footer()}
				<Button onclick={() => (open = false)}>Cancel</Button>
				<Button variant="destructive" onclick={() => (open = false)}>Delete</Button>
			{/snippet}
		</Dialog>
	</section>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: var(--space-6) var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	h1 {
		margin: 0;
		font-size: var(--font-size-display);
		line-height: var(--line-height-tight);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--font-size-title);
	}

	.lead {
		margin: calc(var(--space-4) * -1) 0 0;
		color: var(--color-text-secondary);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--color-surface);
		border-radius: var(--radius-md);
	}
</style>
