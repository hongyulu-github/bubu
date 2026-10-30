import { describe, expect, it } from 'vitest';
import { add, fromString, multiply, toString } from './numbers';
import { currencyFractionDigits, formatMoney } from './currency';

const money = (amount: string, currency: string, locale?: string) => formatMoney(fromString(amount), currency, locale);

describe('currencyFractionDigits (minor units)', () => {
	it('is 2 for most currencies', () => {
		for (const currency of ['USD', 'EUR', 'GBP', 'DKK', 'SEK', 'CHF']) {
			expect(currencyFractionDigits(currency), currency).toBe(2);
		}
	});

	it('is 0 for currencies without minor units', () => {
		for (const currency of ['JPY', 'KRW']) expect(currencyFractionDigits(currency), currency).toBe(0);
	});

	it('is 3 for currencies with thousandths', () => {
		for (const currency of ['KWD', 'BHD', 'OMR']) expect(currencyFractionDigits(currency), currency).toBe(3);
	});

	it('falls back to 2 for a code the platform cannot format', () => {
		expect(currencyFractionDigits('EURO')).toBe(2);
		expect(currencyFractionDigits('')).toBe(2);
	});
});

// ICU separates a currency code from the number with a non-breaking space (U+00A0), written \u00a0 below.
describe('formatMoney: currency-specific decimal places', () => {
	it('shows two decimals for two-digit currencies', () => {
		expect(money('1234.5', 'USD')).toBe('$1,234.50');
		expect(money('1234.5', 'EUR')).toBe('€1,234.50');
		expect(money('1234.5', 'GBP')).toBe('£1,234.50');
		expect(money('1234.5', 'DKK')).toBe('DKK\u00a01,234.50');
	});

	it('shows no decimals for zero-digit currencies', () => {
		expect(money('1234', 'JPY')).toBe('¥1,234');
		expect(money('1234.5', 'JPY')).toBe('¥1,235');
		expect(money('1234.5', 'KRW')).toBe('₩1,235');
	});

	it('shows three decimals for three-digit currencies', () => {
		expect(money('1234.5', 'KWD')).toBe('KWD\u00a01,234.500');
		expect(money('0.001', 'BHD')).toBe('BHD\u00a00.001');
		expect(money('1.2345', 'KWD')).toBe('KWD\u00a01.235');
	});

	it('groups thousands', () => {
		expect(money('1000000', 'USD')).toBe('$1,000,000.00');
		expect(money('999', 'USD')).toBe('$999.00');
	});

	it('uses the same fixed locale unless one is given', () => {
		expect(money('1234.5', 'EUR')).toBe('€1,234.50');
		expect(money('1234.5', 'EUR', 'de-DE')).toBe('1.234,50 €');
	});
});

describe('formatMoney: negative, zero and fractional amounts', () => {
	it('renders negative amounts with the sign before the currency', () => {
		expect(money('-1234.5', 'USD')).toBe('-$1,234.50');
		expect(money('-250.25', 'EUR')).toBe('-€250.25');
		expect(money('-1234', 'JPY')).toBe('-¥1,234');
		expect(money('-1234.5', 'KWD')).toBe('-KWD\u00a01,234.500');
	});

	it('renders zero, in every spelling, without a sign', () => {
		expect(money('0', 'USD')).toBe('$0.00');
		expect(money('0.00', 'USD')).toBe('$0.00');
		expect(money('-0', 'USD')).toBe('$0.00');
		expect(money('0', 'JPY')).toBe('¥0');
		expect(money('0', 'KWD')).toBe('KWD\u00a00.000');
	});

	it('never prints a negative zero for a tiny negative amount', () => {
		expect(money('-0.001', 'USD')).toBe('$0.00');
		expect(money('-0.4', 'JPY')).toBe('¥0');
		expect(money('-0.0004', 'KWD')).toBe('KWD\u00a00.000');
	});

	it('renders fractional amounts', () => {
		expect(money('0.5', 'USD')).toBe('$0.50');
		expect(money('0.07', 'USD')).toBe('$0.07');
		expect(money('12.345', 'USD')).toBe('$12.35');
		expect(money('-0.005', 'USD')).toBe('-$0.01');
	});
});

describe('formatMoney: display rounding is exact and never feeds back', () => {
	it('rounds half away from zero on the exact decimal, not on a binary float', () => {
		// As doubles these misbehave (1.005 is stored as 1.00499999999999989...).
		expect(money('1.005', 'USD')).toBe('$1.01');
		expect(money('2.675', 'USD')).toBe('$2.68');
		expect(money('-1.005', 'USD')).toBe('-$1.01');
		expect(money('0.125', 'USD')).toBe('$0.13');
	});

	it('keeps every digit of large and long amounts until the final rounding', () => {
		expect(money('123456789012345678.995', 'USD')).toBe('$123,456,789,012,345,679.00');
		expect(money('9007199254740993', 'USD')).toBe('$9,007,199,254,740,993.00'); // beyond 2^53
		expect(money('0.1000000000000000055511151231257827', 'USD')).toBe('$0.10');
	});

	it('does not alter the value it was given or any calculation that uses it', () => {
		const value = fromString('9.995');
		const before = toString(value);
		expect(formatMoney(value, 'USD')).toBe('$10.00'); // shown rounded...
		expect(toString(value)).toBe(before); // ...but the value itself is untouched
		expect(value).toEqual({ coefficient: 9995n, scale: 3 });

		// Rounding for display twice in a row never compounds: the next sum uses the exact 9.995.
		formatMoney(value, 'USD');
		expect(toString(add(value, fromString('0.005')))).toBe('10.000');
		expect(toString(multiply(value, fromString('2')))).toBe('19.990');
	});

	it('shows amounts the same way however many trailing zeros the exact value carries', () => {
		for (const spelling of ['3', '3.0', '3.00', '3.000000']) expect(money(spelling, 'EUR'), spelling).toBe('€3.00');
	});

	it('shows the same amount identically wherever it is displayed', () => {
		const lineTotal = multiply(fromString('0.5'), fromString('19.99')); // 9.995
		const groupPrice = add(lineTotal, fromString('0'));
		expect(formatMoney(lineTotal, 'USD')).toBe(formatMoney(groupPrice, 'USD'));
	});
});

describe('formatMoney: unsupported currency codes', () => {
	it('falls back to the exact plain decimal followed by the code', () => {
		expect(money('5', 'EURO')).toBe('5 EURO');
		expect(money('-1234.5678', 'EURO')).toBe('-1234.5678 EURO');
	});

	it('still formats a well-formed code the platform does not know', () => {
		expect(money('5', 'ZZZ')).toBe('ZZZ\u00a05.00');
	});
});
