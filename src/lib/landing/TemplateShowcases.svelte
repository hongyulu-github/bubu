<script lang="ts">
	import { fly } from 'svelte/transition';
	import { prefersReducedMotion } from 'svelte/motion';
	import { Button } from 'flowbite-svelte';
	import Icon from '../components/Icon.svelte';
	import { templates, type BudgetTemplate } from '../templates/templates';
	import { DEMO_MOVES, EXAMPLE_AMOUNTS } from './showcase-demo';
	import TemplateShowcase from './TemplateShowcase.svelte';

	let {
		items = templates,
		onuse,
		reducedMotion = prefersReducedMotion.current
	}: {
		items?: readonly BudgetTemplate[];
		/** A "Use template" button was pressed; the opening flow is wired by the page. */
		onuse: (templateId: string) => void;
		reducedMotion?: boolean;
	} = $props();

	let index = $state(0);
	let direction = $state(1);

	function go(by: number) {
		direction = by;
		index = (index + by + items.length) % items.length;
	}
</script>

<!--
	A carousel of one showcase at a time. Flowbite's Carousel is built for images: it makes its whole frame a button that
	swallows mouse presses, which would swallow the "Use template" button and text selection, so this is a small region
	with Previous and Next beside the showcase instead.
-->
<section aria-roledescription="carousel" aria-label="Starter templates" class="flex flex-col gap-3">
	<p aria-live="polite" class="text-sm text-gray-500 dark:text-gray-400">{index + 1} of {items.length}</p>
	<div class="flex items-center gap-3">
		<Button class="sticky top-[45vh] shrink-0 self-start p-3!" color="alternative" aria-label="Previous template" onclick={() => go(-1)}><Icon name="previous" size={24} /></Button>
		<div class="min-w-0 flex-1 overflow-hidden">
			{#key items[index].id}
				<div role="group" aria-roledescription="slide" aria-label="{index + 1} of {items.length}" in:fly={{ x: reducedMotion ? 0 : direction * 48, duration: reducedMotion ? 0 : 300 }}>
					<TemplateShowcase template={items[index]} {onuse} {reducedMotion} amounts={EXAMPLE_AMOUNTS[items[index].id]} move={DEMO_MOVES[items[index].id]} />
				</div>
			{/key}
		</div>
		<Button class="sticky top-[45vh] shrink-0 self-start p-3!" color="alternative" aria-label="Next template" onclick={() => go(1)}><Icon name="next" size={24} /></Button>
	</div>
</section>
