import { isSupportedCurrency } from './currencies';
import { createBudget, type Budget } from './model';

export interface BudgetFormInput {
	name: string;
	currency: string;
}

export interface BudgetFormErrors {
	name?: string;
	currency?: string;
}

export type CreateBudgetResult = { ok: true; budget: Budget } | { ok: false; errors: BudgetFormErrors };

export function validateBudgetForm({ name, currency }: BudgetFormInput): BudgetFormErrors {
	const errors: BudgetFormErrors = {};
	if (name.trim() === '') errors.name = 'Enter a name for the Budget.';
	if (currency === '') errors.currency = 'Choose a currency.';
	else if (!isSupportedCurrency(currency)) errors.currency = 'Choose a currency from the list.';
	return errors;
}

/**
 * The one way a normal (non-template) Budget is born: a root Budget document with a fresh UUID and
 * timestamps, trimmed name, and no Items. Starter Items belong only to the template flow.
 */
export function createBudgetDocument(
	input: BudgetFormInput,
	options: { id?: string; now?: Date } = {}
): CreateBudgetResult {
	const errors = validateBudgetForm(input);
	if (Object.keys(errors).length > 0) return { ok: false, errors };
	return { ok: true, budget: createBudget({ name: input.name.trim(), currency: input.currency, ...options }) };
}
