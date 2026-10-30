import { describe, expect, it } from 'vitest';
import { createBudget } from './model';
import { renameBudgetDocument } from './rename';
import { validateBudget } from './validation';

const budget = createBudget({
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Wedding',
	currency: 'EUR',
	now: new Date('2026-01-02T03:04:05.000Z')
});
const LATER = new Date('2026-06-07T08:09:10.000Z');

describe('renameBudgetDocument', () => {
	it('changes only the name and updatedAt', () => {
		const result = renameBudgetDocument(budget, 'Summer wedding', LATER);
		expect(result.ok && result.changed).toBe(true);
		if (!result.ok) return;
		expect(result.budget).toEqual({
			id: budget.id,
			name: 'Summer wedding',
			currency: 'EUR',
			createdAt: '2026-01-02T03:04:05.000Z',
			updatedAt: '2026-06-07T08:09:10.000Z'
		});
		expect(validateBudget(result.budget)).toEqual([]);
	});

	it('trims the name', () => {
		const result = renameBudgetDocument(budget, '  Trip \n', LATER);
		expect(result.ok && result.budget.name).toBe('Trip');
	});

	it('rejects an empty or whitespace-only name', () => {
		for (const name of ['', ' ', '\t\n  ']) {
			expect(renameBudgetDocument(budget, name, LATER), JSON.stringify(name)).toEqual({
				ok: false,
				errors: { name: 'Enter a name for the Budget.' }
			});
		}
	});

	it('is a no-op for the same name and leaves updatedAt alone', () => {
		for (const name of ['Wedding', '  Wedding  ']) {
			const result = renameBudgetDocument(budget, name, LATER);
			expect(result).toEqual({ ok: true, changed: false, budget });
			expect(result.ok && result.budget).toBe(budget);
		}
	});

	it('does not mutate the Budget it was given', () => {
		const frozen = Object.freeze({ ...budget });
		expect(() => renameBudgetDocument(frozen, 'New name', LATER)).not.toThrow();
		expect(frozen.name).toBe('Wedding');
	});

	it('does not accept a currency or id change (only a name is taken)', () => {
		const result = renameBudgetDocument(budget, 'Renamed', LATER);
		expect(result.ok && result.budget.currency).toBe('EUR');
		expect(result.ok && result.budget.id).toBe(budget.id);
	});
});
