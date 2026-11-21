/**
 * Currencies offered when creating a Budget (ISO 4217): the euro, the dollar, the yuan and the main European
 * currencies outside the euro. Budgets saved in any other currency still open and display correctly; only the
 * choice when creating one is limited. A fixed list, not `Intl.supportedValuesOf`,
 * so the options are identical when prerendering in Node and when running in any browser.
 */
export const CURRENCIES: readonly { code: string; name: string }[] = [
	{ code: 'CHF', name: 'Swiss franc' },
	{ code: 'CNY', name: 'Chinese yuan' },
	{ code: 'DKK', name: 'Danish krone' },
	{ code: 'EUR', name: 'Euro' },
	{ code: 'GBP', name: 'British pound' },
	{ code: 'NOK', name: 'Norwegian krone' },
	{ code: 'SEK', name: 'Swedish krona' },
	{ code: 'USD', name: 'US dollar' }
];

export const isSupportedCurrency = (code: string): boolean => CURRENCIES.some((currency) => currency.code === code);
