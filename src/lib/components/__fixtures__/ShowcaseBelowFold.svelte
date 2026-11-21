<script lang="ts">
	import TemplateShowcase from '../../landing/TemplateShowcase.svelte';
	import { weddingTemplate } from '../../templates/templates';
</script>

<div style="height: 3000px">A page that scrolls before the showcase</div>
<TemplateShowcase template={weddingTemplate} onuse={() => {}} reducedMotion={false} />
