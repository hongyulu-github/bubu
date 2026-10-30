import { describe, expect, it } from 'vitest';
import {
	add,
	compare,
	equals,
	fromString,
	isNegative,
	isZero,
	multiply,
	parseDecimal,
	parseQuantity,
	parseUnitPrice,
	toString,
	type Decimal
} from './numbers';

function dec(text: string): Decimal {
	return fromString(text);
}

describe('parsing', () => {
	it('accepts zero, integers and fractional quantities', () => {
		for (const text of ['0', '0.0', '1', '2.5', '.5', '5.', '+3', '007.50']) {
			expect(parseQuantity(text).ok, text).toBe(true);
		}
		expect(parseQuantity('-0')).toMatchObject({ ok: true });
	});

	it('accepts negative unit prices', () => {
		const result = parseUnitPrice('-12.50');
		expect(result).toEqual({ ok: true, value: { coefficient: -1250n, scale: 2 } });
	});

	it('rejects negative quantities', () => {
		expect(parseQuantity('-1')).toEqual({ ok: false, error: 'negative-quantity' });
		expect(parseQuantity('-0.001')).toEqual({ ok: false, error: 'negative-quantity' });
	});

	it('rejects blank input', () => {
		for (const text of ['', ' ', '\t\n']) {
			expect(parseDecimal(text), JSON.stringify(text)).toEqual({ ok: false, error: 'blank' });
			expect(parseQuantity(text).ok).toBe(false);
			expect(parseUnitPrice(text).ok).toBe(false);
		}
	});

	it('rejects non-numeric and non-finite input', () => {
		for (const text of [
			'abc',
			'1,000',
			'1 000',
			'1e3',
			'0x10',
			'NaN',
			'Infinity',
			'-Infinity',
			'.',
			'-',
			'+',
			'1.2.3',
			'--1',
			'1-',
			'€5'
		]) {
			expect(parseDecimal(text), text).toEqual({ ok: false, error: 'not-a-number' });
		}
	});

	it('trims surrounding whitespace', () => {
		expect(parseDecimal('  3.5 ')).toMatchObject({ ok: true });
	});

	it('keeps every typed digit, including beyond double precision', () => {
		expect(toString(dec('0.1000000000000000055511151231257827'))).toBe(
			'0.1000000000000000055511151231257827'
		);
		expect(toString(dec('9007199254740993'))).toBe('9007199254740993');
	});
});

describe('addition', () => {
	it('does not show binary floating-point artifacts (0.1 + 0.2)', () => {
		expect(0.1 + 0.2).not.toBe(0.3);
		const sum = add(dec('0.1'), dec('0.2'));
		expect(toString(sum)).toBe('0.3');
		expect(equals(sum, dec('0.3'))).toBe(true);
	});

	it('adds numbers with different scales without rounding', () => {
		expect(toString(add(dec('1.005'), dec('2.5')))).toBe('3.505');
		expect(toString(add(dec('100'), dec('0.0001')))).toBe('100.0001');
	});

	it('handles negative amounts and cancellation', () => {
		expect(toString(add(dec('10.50'), dec('-2.25')))).toBe('8.25');
		expect(toString(add(dec('-0.1'), dec('-0.2')))).toBe('-0.3');
		expect(isZero(add(dec('0.3'), dec('-0.3')))).toBe(true);
		expect(toString(add(dec('0.3'), dec('-0.3')))).toBe('0.0');
	});

	it('accumulates many small values exactly', () => {
		let total = dec('0');
		for (let i = 0; i < 10; i++) total = add(total, dec('0.1'));
		expect(equals(total, dec('1'))).toBe(true);
		expect(toString(total)).toBe('1.0');
	});

	it('treats zero as the identity', () => {
		expect(equals(add(dec('0'), dec('4.2')), dec('4.2'))).toBe(true);
	});
});

describe('multiplication', () => {
	it('multiplies fractions exactly', () => {
		expect(toString(multiply(dec('0.1'), dec('3')))).toBe('0.3');
		expect(toString(multiply(dec('1.005'), dec('3')))).toBe('3.015');
		expect(toString(multiply(dec('2.5'), dec('0.4')))).toBe('1.00');
	});

	it('does not round intermediate values', () => {
		// 0.333 * 3 stays 0.999; it is never collapsed to 1 or to two decimals.
		expect(toString(multiply(dec('0.333'), dec('3')))).toBe('0.999');
		const total = add(multiply(dec('0.333'), dec('3')), multiply(dec('0.001'), dec('1')));
		expect(equals(total, dec('1'))).toBe(true);
	});

	it('handles negative unit prices', () => {
		expect(toString(multiply(dec('2.5'), dec('-4.2')))).toBe('-10.50');
		expect(toString(multiply(dec('-2'), dec('-3')))).toBe('6');
	});

	it('handles zero', () => {
		const zeroTimes = multiply(dec('0'), dec('-123.45'));
		expect(isZero(zeroTimes)).toBe(true);
		expect(isNegative(zeroTimes)).toBe(false);
		expect(toString(zeroTimes)).toBe('0.00');
	});

	it('stays exact for very large values', () => {
		expect(toString(multiply(dec('123456789.123456789'), dec('987654321.987654321')))).toBe(
			'121932631356500531.347203169112635269'
		);
	});
});

describe('comparison', () => {
	it('compares by value regardless of scale', () => {
		expect(compare(dec('1.0'), dec('1'))).toBe(0);
		expect(compare(dec('0.2'), dec('0.10'))).toBe(1);
		expect(compare(dec('-1'), dec('0'))).toBe(-1);
	});
});

describe('serialization', () => {
	it('round-trips supported precise values unchanged', () => {
		for (const text of [
			'0',
			'0.0',
			'1',
			'-1',
			'0.1',
			'-0.1',
			'1.50',
			'1200.5',
			'-12.340',
			'0.000001',
			'-0.000000000001',
			'123456789012345678901234567890.123456789012345678901234567890'
		]) {
			expect(toString(dec(text)), text).toBe(text);
		}
	});

	it('round-trips results of arithmetic', () => {
		const value = multiply(dec('0.07'), add(dec('19.99'), dec('-0.01')));
		expect(equals(dec(toString(value)), value)).toBe(true);
		expect(toString(value)).toBe('1.3986');
	});

	it('normalizes only the sign and format of zero', () => {
		expect(toString(dec('-0'))).toBe('0');
		expect(toString(dec('+5'))).toBe('5');
		expect(toString(dec('.5'))).toBe('0.5');
		expect(toString(dec('007.50'))).toBe('7.50');
	});

	it('never uses exponent notation', () => {
		expect(toString(dec('0.0000000000000000000001'))).toBe('0.0000000000000000000001');
		expect(toString(dec('100000000000000000000000'))).toBe('100000000000000000000000');
	});

	it('throws when reading stored data that is not a decimal', () => {
		expect(() => fromString('abc')).toThrow(/Invalid decimal/);
		expect(() => fromString('')).toThrow(/blank/);
	});
});
