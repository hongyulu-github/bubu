<script lang="ts" module>
	import type { Component } from 'svelte';
	import {
		ArrowDownToBracketOutline,
		ArrowRightToBracketOutline,
		CheckOutline,
		ChevronDoubleDownOutline,
		ChevronLeftOutline,
		ChevronRightOutline,
		ChevronDoubleUpOutline,
		CloseOutline,
		DotsHorizontalOutline,
		DownloadOutline,
		EditOutline,
		FileCopyOutline,
		HeartOutline,
		PlusOutline,
		RedoOutline,
		TrashBinOutline,
		UndoOutline
	} from 'flowbite-svelte-icons';

	/** Every icon is from Flowbite's own outline set (24px grid, 2px strokes, in currentColor). */
	const LIBRARY = {
		undo: UndoOutline,
		redo: RedoOutline,
		plus: PlusOutline,
		more: DotsHorizontalOutline,
		pencil: EditOutline,
		trash: TrashBinOutline,
		copy: FileCopyOutline,
		check: CheckOutline,
		download: DownloadOutline,
		close: CloseOutline,
		heart: HeartOutline,
		addBelow: ArrowDownToBracketOutline,
		addChild: ArrowRightToBracketOutline,
		expandAll: ChevronDoubleDownOutline,
		collapseAll: ChevronDoubleUpOutline,
		previous: ChevronLeftOutline,
		next: ChevronRightOutline
	} as const satisfies Record<string, Component<any>>;

	export type IconName = keyof typeof LIBRARY;
</script>

<script lang="ts">
	let { name, size = 16 }: { name: IconName; size?: number } = $props();

	const Library = $derived(LIBRARY[name]);
</script>

<Library width={size} height={size} aria-hidden="true" focusable="false" />
