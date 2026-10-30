/**
 * Currencies offered when creating a Budget (ISO 4217). A fixed list, not `Intl.supportedValuesOf`,
 * so the options are identical when prerendering in Node and when running in any browser.
 */
export const CURRENCIES: readonly { code: string; name: string }[] = [
	{ code: 'AUD', name: 'Australian dollar' },
	{ code: 'BGN', name: 'Bulgarian lev' },
	{ code: 'BRL', name: 'Brazilian real' },
	{ code: 'CAD', name: 'Canadian dollar' },
	{ code: 'CHF', name: 'Swiss franc' },
	{ code: 'CNY', name: 'Chinese yuan' },
	{ code: 'CZK', name: 'Czech koruna' },
	{ code: 'DKK', name: 'Danish krone' },
	{ code: 'EUR', name: 'Euro' },
	{ code: 'GBP', name: 'British pound' },
	{ code: 'HKD', name: 'Hong Kong dollar' },
	{ code: 'HUF', name: 'Hungarian forint' },
	{ code: 'INR', name: 'Indian rupee' },
	{ code: 'ISK', name: 'Icelandic króna' },
	{ code: 'JPY', name: 'Japanese yen' },
	{ code: 'KRW', name: 'South Korean won' },
	{ code: 'MXN', name: 'Mexican peso' },
	{ code: 'NOK', name: 'Norwegian krone' },
	{ code: 'NZD', name: 'New Zealand dollar' },
	{ code: 'PLN', name: 'Polish złoty' },
	{ code: 'RON', name: 'Romanian leu' },
	{ code: 'SEK', name: 'Swedish krona' },
	{ code: 'SGD', name: 'Singapore dollar' },
	{ code: 'THB', name: 'Thai baht' },
	{ code: 'TRY', name: 'Turkish lira' },
	{ code: 'USD', name: 'US dollar' },
	{ code: 'ZAR', name: 'South African rand' }
];

export const isSupportedCurrency = (code: string): boolean => CURRENCIES.some((currency) => currency.code === code);
