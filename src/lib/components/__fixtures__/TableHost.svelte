<script lang="ts">
	import TableCell from '../TableCell.svelte';
</script>

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
			<TableCell numeric tabindex={0} selected>1200.50</TableCell>
		</tr>
		<tr>
			<TableCell>Food</TableCell>
			<TableCell numeric invalid>abc</TableCell>
		</tr>
	</tbody>
</table>
