<script lang="ts">
	import { greet } from './greet';

	let { name = 'bubu' }: { name?: string } = $props();
	let clicks = $state(0);
</script>

<h1>{greet(name)}</h1>
<button onclick={() => clicks++}>Clicked {clicks} times</button>
