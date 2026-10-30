<script lang="ts">
	import TableCell from '../TableCell.svelte';
</script>

<table>
	<tbody>
		<tr>
			<TableCell>editable</TableCell>
			<TableCell readonly>computed</TableCell>
			<TableCell strong>heavy</TableCell>
			<TableCell depth={1}>depth 1</TableCell>
			<TableCell depth={20}>depth 20</TableCell>
			<TableCell depth={40}>depth 40</TableCell>
		</tr>
	</tbody>
</table>
