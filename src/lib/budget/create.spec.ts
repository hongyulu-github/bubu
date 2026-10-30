import { describe, expect, it } from 'vitest';
import { CURRENCIES, isSupportedCurrency } from './currencies';
import { createBudgetDocument, validateBudgetForm } from './create';
import { isUuid, validateBudgetData } from './validation';

const NOW = new Date('2026-04-05T06:07:08.090Z');

describe('createBudgetDocument', () => {
	it('creates one root Budget with a UUID, timestamps and the chosen currency', () => {
		const result = createBudgetDocument({ name: 'Wedding', currency: 'EUR' }, { now: NOW });
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(isUuid(result.budget.id)).toBe(true);
		expect(result.budget).toMatchObject({
			name: 'Wedding',
			currency: 'EUR',
			createdAt: '2026-04-05T06:07:08.090Z',
			updatedAt: '2026-04-05T06:07:08.090Z'
		});
		expect(validateBudgetData(result.budget, [])).toEqual([]);
	});

	it('trims the name', () => {
		const result = createBudgetDocument({ name: '  Home renovation \n', currency: 'USD' });
		expect(result.ok && result.budget.name).toBe('Home renovation');
	});

	it('gives every Budget its own id', () => {
		const ids = new Set(
			Array.from({ length: 20 }, () => {
				const result = createBudgetDocument({ name: 'x', currency: 'EUR' });
				return result.ok ? result.budget.id : '';
			})
		);
		expect(ids.size).toBe(20);
	});

	it('rejects an empty or whitespace-only name', () => {
		for (const name of ['', ' ', '\t\n  ']) {
			const result = createBudgetDocument({ name, currency: 'EUR' });
			expect(result, JSON.stringify(name)).toEqual({ ok: false, errors: { name: 'Enter a name for the Budget.' } });
		}
	});

	it('rejects a missing or unsupported currency', () => {
		expect(createBudgetDocument({ name: 'x', currency: '' })).toEqual({
			ok: false,
			errors: { currency: 'Choose a currency.' }
		});
		for (const currency of ['eur', 'EURO', 'XXX', 'Euro']) {
			expect(createBudgetDocument({ name: 'x', currency }), currency).toEqual({
				ok: false,
				errors: { currency: 'Choose a currency from the list.' }
			});
		}
	});

	it('reports every problem at once', () => {
		expect(validateBudgetForm({ name: ' ', currency: '' })).toEqual({
			name: 'Enter a name for the Budget.',
			currency: 'Choose a currency.'
		});
		expect(validateBudgetForm({ name: 'ok', currency: 'GBP' })).toEqual({});
	});
});

describe('currencies', () => {
	it('are unique, valid three-letter codes, and sorted', () => {
		const codes = CURRENCIES.map((currency) => currency.code);
		expect(new Set(codes).size).toBe(codes.length);
		expect(codes.every((code) => /^[A-Z]{3}$/.test(code))).toBe(true);
		expect(codes).toEqual([...codes].sort());
		expect(isSupportedCurrency('EUR')).toBe(true);
		expect(isSupportedCurrency('ZZZ')).toBe(false);
	});
});
