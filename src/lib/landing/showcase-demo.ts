/**
 * Display-only extras for the landing-page showcases: example amounts so the roll-up has something to add up, and one
 * drag-and-drop move to act out. The templates themselves stay at Unit price 0 and Quantity 1; nothing here is ever
 * stored, and none of it is used when a template is opened.
 */

/** Example [Unit price, Quantity] for each Line, by template id and Item id. Invented, not market prices. */
export const EXAMPLE_AMOUNTS: Readonly<Record<string, Readonly<Record<string, readonly [string, string]>>>> = {
	wedding: {
		'venue-hire': ['2500', '1'],
		'venue-decoration': ['800', '1'],
		'venue-furniture': ['2', '120'],
		'meal-starter': ['12', '80'],
		'meal-main': ['28', '80'],
		'meal-dessert': ['8', '80'],
		'catering-drinks': ['18', '80'],
		'catering-cake': ['350', '1'],
		'attire-outfits': ['1800', '2'],
		'attire-rings': ['600', '1'],
		'entertainment-photographer': ['150', '8'],
		'entertainment-music': ['120', '5'],
		invitations: ['3', '90']
	},
	'home-renovation': {
		'kitchen-cabinets': ['450', '8'],
		'kitchen-worktop': ['160', '4'],
		'kitchen-appliances': ['600', '4'],
		'kitchen-plumbing': ['70', '10'],
		'kitchen-electrician': ['75', '12'],
		'bathroom-fixtures': ['1200', '1'],
		'bathroom-tiling': ['55', '18'],
		'bathroom-plumbing': ['70', '8'],
		'living-flooring': ['40', '45'],
		'living-painting': ['12', '120'],
		'living-lighting': ['45', '10'],
		'general-permits': ['400', '1'],
		'general-waste': ['180', '3']
	},
	travel: {
		'transport-flights': ['320', '2'],
		'transport-baggage': ['40', '2'],
		'local-rail': ['90', '2'],
		'local-taxi': ['25', '6'],
		'stay-hotel': ['110', '7'],
		'stay-extras': ['6', '7'],
		'stay-laundry': ['12', '2'],
		'food-breakfast': ['10', '14'],
		'food-lunch': ['16', '10'],
		'food-dinner': ['28', '7'],
		'activities-tours': ['60', '4'],
		'activities-tickets': ['15', '6'],
		insurance: ['45', '2']
	}
};

/** The Item that is dragged, the Item it is dropped under, and the parent it ends up in. */
export interface DemoMove {
	readonly itemId: string;
	/** The drop lands right after this Item... */
	readonly afterId: string;
	/** ...as a child of this Group. */
	readonly intoId: string;
}

export const DEMO_MOVES: Readonly<Record<string, DemoMove>> = {
	wedding: { itemId: 'invitations', afterId: 'venue-furniture', intoId: 'venue' },
	'home-renovation': { itemId: 'living-lighting', afterId: 'kitchen-worktop', intoId: 'kitchen' },
	travel: { itemId: 'insurance', afterId: 'stay-extras', intoId: 'stay' }
};
