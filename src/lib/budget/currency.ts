import { toString, type Decimal } from './numbers';

/**
 * Presentation adapter: how an exact amount is shown in a Budget's currency.
 *
 * This is display only. Rounding to the currency's minor units (2 for USD or EUR, 0 for JPY, 3 for
 * KWD) happens here, on the way to the screen, and never feeds back: stored inputs and every
 * intermediate roll-up stay exact in `Decimal`. The amount reaches `Intl.NumberFormat` as its exact
 * decimal string, so no digit is lost to floating point before rounding.
 *
 * A fixed locale keeps separators identical everywhere and matches the plain-decimal inputs, which
 * always use "." as the decimal point. Minor-unit digits come from the platform's currency data.
 */
export const DISPLAY_LOCALE = 'en';

const formats = new Map<string, Intl.NumberFormat>();

function numberFormat(currency: string, locale: string): Intl.NumberFormat {
	const key = `${locale}|${currency}`;
	let format = formats.get(key);
	if (!format) {
		format = new Intl.NumberFormat(locale, {
			style: 'currency',
			currency,
			// Round half away from zero, exactly (no binary artifacts); and never print "-0.00".
			roundingMode: 'halfExpand',
			signDisplay: 'negative'
		} as Intl.NumberFormatOptions);
		formats.set(key, format);
	}
	return format;
}

/** Decimal places the currency uses for money (its minor units): 2 for EUR, 0 for JPY, 3 for KWD. */
export function currencyFractionDigits(currency: string, locale: string = DISPLAY_LOCALE): number {
	try {
		return numberFormat(currency, locale).resolvedOptions().maximumFractionDigits ?? 2;
	} catch {
		return 2;
	}
}

/**
 * Format an exact amount for display in the given currency, e.g. `-€1,234.50`. A currency code the
 * platform cannot format falls back to the exact plain decimal followed by the code.
 */
export function formatMoney(value: Decimal, currency: string, locale: string = DISPLAY_LOCALE): string {
	const exact = toString(value);
	try {
		return numberFormat(currency, locale).format(exact as `${number}`);
	} catch {
		return `${exact} ${currency}`;
	}
}

const plainFormats = new Map<string, Intl.NumberFormat>();

/**
 * Format an exact amount as a plain number for table cells: no currency symbol and no thousands
 * separators, rounded to the currency's minor units (display only), e.g. `-1234.50`. It reads like the
 * plain-decimal inputs next to it; the Budget's currency and the grouped total are shown by `formatMoney`.
 */
export function formatAmount(value: Decimal, currency: string, locale: string = DISPLAY_LOCALE): string {
	const digits = currencyFractionDigits(currency, locale);
	const key = `${locale}|${digits}`;
	let format = plainFormats.get(key);
	if (!format) {
		format = new Intl.NumberFormat(locale, {
			useGrouping: false,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
			roundingMode: 'halfExpand',
			signDisplay: 'negative'
		} as Intl.NumberFormatOptions);
		plainFormats.set(key, format);
	}
	return format.format(toString(value) as `${number}`);
}
