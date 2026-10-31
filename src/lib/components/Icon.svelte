<script lang="ts" module>
	/** Line icons on a 24px grid, drawn with currentColor so they follow text and state colours. */
	const PATHS = {
		undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
		redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
		plus: 'M12 5v14M5 12h14',
		more: 'M5 12h1M12 12h1M19 12h1',
		pencil: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
		trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
		addBelow: 'M4 6h16M4 11h16M12 15v6M9 18h6',
		addChild: 'M5 4v8a3 3 0 0 0 3 3h10M14 11l4 4-4 4',
		copy: 'M9 9h11v11H9zM5 15V5h10',
		expandAll: 'm7 8 5-4 5 4M7 16l5 4 5-4',
		collapseAll: 'm7 4 5 4 5-4M7 20l5-4 5 4',
		check: 'm5 12 5 5 9-10'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	<path d={PATHS[name]} />
</svg>
