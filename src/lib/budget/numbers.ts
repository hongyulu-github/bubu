/**
 * Exact decimal arithmetic for Budget quantities and prices.
 *
 * A Decimal is an integer coefficient and a scale: value = coefficient / 10^scale. Parsing keeps
 * every digit the user typed, addition and multiplication are exact (no binary floating point, no
 * intermediate rounding), and serialization is the plain decimal string, so values round-trip.
 * The scale is preserved rather than normalized ("1.50" stays "1.50", 2.5 * 0.4 is "1.00").
 * Rounding for display belongs to a presentation adapter, not here.
 */
export interface Decimal {
	readonly coefficient: bigint;
	readonly scale: number;
}

export type ParseError = 'blank' | 'not-a-number' | 'negative-quantity';

export type ParseResult = { ok: true; value: Decimal } | { ok: false; error: ParseError };

// Plain decimal notation only: optional sign, digits, optional fraction ("5.", ".5" and "5.25" are
// fine). No exponents, thousands separators, "NaN" or "Infinity".
const DECIMAL_PATTERN = /^([+-])?(?:(\d+)(?:\.(\d*))?|\.(\d+))$/;

/** Parse committed text into a Decimal, rejecting blank and non-numeric input. */
export function parseDecimal(text: string): ParseResult {
	const trimmed = text.trim();
	if (trimmed === '') return { ok: false, error: 'blank' };

	const match = DECIMAL_PATTERN.exec(trimmed);
	if (!match) return { ok: false, error: 'not-a-number' };

	const [, sign, integerDigits = '0', fractionDigits, leadingFractionDigits] = match;
	const fraction = fractionDigits ?? leadingFractionDigits ?? '';
	const magnitude = BigInt(integerDigits + fraction);
	const coefficient = sign === '-' ? -magnitude : magnitude;

	return { ok: true, value: { coefficient, scale: fraction.length } };
}

/** A Quantity is any decimal greater than or equal to zero (fractions allowed). */
export function parseQuantity(text: string): ParseResult {
	const result = parseDecimal(text);
	if (result.ok && isNegative(result.value)) return { ok: false, error: 'negative-quantity' };
	return result;
}

/** A Line Unit price is any decimal, including negative amounts such as discounts or credits. */
export function parseUnitPrice(text: string): ParseResult {
	return parseDecimal(text);
}

function align(a: Decimal, b: Decimal): [bigint, bigint, number] {
	const scale = Math.max(a.scale, b.scale);
	return [
		a.coefficient * 10n ** BigInt(scale - a.scale),
		b.coefficient * 10n ** BigInt(scale - b.scale),
		scale
	];
}

export function add(a: Decimal, b: Decimal): Decimal {
	const [x, y, scale] = align(a, b);
	return { coefficient: x + y, scale };
}

export function multiply(a: Decimal, b: Decimal): Decimal {
	return { coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale };
}

/** Numeric comparison: -1, 0 or 1. Scale does not matter ("1.0" equals "1"). */
export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
	const [x, y] = align(a, b);
	return x < y ? -1 : x > y ? 1 : 0;
}

export function equals(a: Decimal, b: Decimal): boolean {
	return compare(a, b) === 0;
}

export function isZero(value: Decimal): boolean {
	return value.coefficient === 0n;
}

export function isNegative(value: Decimal): boolean {
	return value.coefficient < 0n;
}

/** Lossless plain-decimal string (never exponent notation); parseDecimal reads it back exactly. */
export function toString(value: Decimal): string {
	const negative = value.coefficient < 0n;
	const digits = (negative ? -value.coefficient : value.coefficient)
		.toString()
		.padStart(value.scale + 1, '0');
	const integerPart = digits.slice(0, digits.length - value.scale);
	const fractionPart = digits.slice(digits.length - value.scale);

	return `${negative ? '-' : ''}${integerPart}${value.scale > 0 ? `.${fractionPart}` : ''}`;
}

/** Read a string produced by `toString`; throws on anything else (use for trusted stored data). */
export function fromString(text: string): Decimal {
	const result = parseDecimal(text);
	if (!result.ok) throw new Error(`Invalid decimal: "${text}" (${result.error})`);
	return result.value;
}
