<script lang="ts">
	import { goto } from '$app/navigation';
	import LandingPage from '#lib/landing/LandingPage.svelte';
</script>

<!--
	The main page for new and returning users alike. "Create a budget" starts the normal creation flow (an empty
	Budget, no Items). "My budgets" is meant to open the saved-Budgets side drawer (LUL-73); until that exists it
	opens the standalone list.
-->
<LandingPage oncreate={() => goto('/budgets/new')} onopenbudgets={() => goto('/budgets')} />
