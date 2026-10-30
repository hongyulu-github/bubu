// Shared application code lives under src/lib and is imported through the `#lib` alias.
export * from './components/index';
export { BudgetStore, budgetStore } from './state/budgets.svelte';
