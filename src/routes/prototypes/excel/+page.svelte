<script lang="ts">
	import Seo from '#lib/components/Seo.svelte';
	import { createWorkbook, readWorkbook, writeWorkbook } from '../../../lib/excel/workbook';

	// Smoke page for the built static site (LUL-33): proves ExcelJS loads and runs in the browser from the
	// production bundle, with no server. Not a product feature.
	let result = $state('Not run yet.');

	async function run() {
		try {
			const workbook = await createWorkbook();
			workbook.addWorksheet('Budget').getCell('A1').value = 'BuBu';
			const blob = await writeWorkbook(workbook);
			const again = await readWorkbook(await blob.arrayBuffer());
			result = `OK: ${blob.size} bytes, ${blob.type}, A1 = ${again.getWorksheet('Budget')?.getCell('A1').value}`;
		} catch (error) {
			result = `Failed: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
</script>

<Seo name="Excel prototype" noindex />

<main>
	<h1>Excel smoke test</h1>
	<button type="button" onclick={run}>Write and read a workbook</button>
	<p role="status">{result}</p>
</main>
