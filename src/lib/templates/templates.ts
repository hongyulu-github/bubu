/**
 * Static starter templates: small, illustrative hierarchies with no market prices. They are opt-in from the landing
 * page and are never stored as user Budgets; opening one copies its Items into a new Budget (with new ids, a chosen
 * currency and the user's name), which is not done here.
 *
 * A template Item is the flat Budget `Item` without `budgetId`, with a template-local `id` (a readable slug, not a
 * UUID) and `parentId` naming another Item of the same template. Codes and Totals are never stored: they are derived
 * from the hierarchy like for any Budget. Every Line is Unit price 0 and Quantity 1, so every Total is 0.
 */
import type { Item } from '../budget/model';

export interface TemplateItem extends Omit<Item, 'budgetId' | 'unitPrice' | 'quantity'> {
	readonly unitPrice: '0';
	readonly quantity: '1';
}

export interface BudgetTemplate {
	/** Stable, template-local key, e.g. for the landing page to pick one. */
	readonly id: string;
	/** Name offered for the new Budget; the user can change it. */
	readonly name: string;
	readonly items: readonly TemplateItem[];
}

/** One node of the tree a template is written as; flattened into Items below. */
interface Node {
	readonly id: string;
	readonly description: string;
	/** Unit label of a Line, such as "guest" or "m²". A Group has none. */
	readonly unit?: string;
	readonly children?: readonly Node[];
}

const line = (id: string, description: string, unit: string): Node => ({ id, description, unit });
const group = (id: string, description: string, children: readonly Node[]): Node => ({ id, description, children });

/** Flat Items in depth-first order; `sortIndex` counts 0, 1, 2... among siblings. */
function flatten(nodes: readonly Node[], parentId: string | null = null): TemplateItem[] {
	return nodes.flatMap((node, sortIndex): TemplateItem[] => {
		const item: TemplateItem = {
			id: node.id,
			parentId,
			sortIndex,
			description: node.description,
			unitPrice: '0',
			quantity: '1',
			...(node.unit === undefined ? {} : { unit: node.unit })
		};
		return [Object.freeze(item), ...flatten(node.children ?? [], node.id)];
	});
}

function define(id: string, name: string, tree: readonly Node[]): BudgetTemplate {
	return Object.freeze({ id, name, items: Object.freeze(flatten(tree)) });
}

export const weddingTemplate: BudgetTemplate = define('wedding', 'Wedding', [
	group('venue', 'Venue', [
		line('venue-hire', 'Venue hire', 'day'),
		line('venue-decoration', 'Decoration and flowers', 'set'),
		line('venue-furniture', 'Tables and chairs', 'chair')
	]),
	group('catering', 'Catering', [
		group('catering-meal', 'Meal', [
			line('meal-starter', 'Starter', 'guest'),
			line('meal-main', 'Main course', 'guest'),
			line('meal-dessert', 'Dessert', 'guest')
		]),
		line('catering-drinks', 'Drinks', 'guest'),
		line('catering-cake', 'Wedding cake', 'cake')
	]),
	group('attire', 'Attire and rings', [
		line('attire-outfits', 'Outfits', 'outfit'),
		line('attire-rings', 'Rings', 'pair'),
		line('attire-beauty', 'Hair and make-up', 'person')
	]),
	group('entertainment', 'Photos and music', [
		line('entertainment-photographer', 'Photographer', 'hour'),
		line('entertainment-music', 'Band or DJ', 'hour')
	]),
	line('invitations', 'Invitations', 'invitation')
]);

export const homeRenovationTemplate: BudgetTemplate = define('home-renovation', 'Home renovation', [
	group('kitchen', 'Kitchen', [
		line('kitchen-cabinets', 'Cabinets', 'unit'),
		line('kitchen-worktop', 'Worktop', 'm'),
		line('kitchen-appliances', 'Appliances', 'appliance'),
		group('kitchen-installation', 'Plumbing and electrics', [
			line('kitchen-plumbing', 'Plumber', 'hour'),
			line('kitchen-electrician', 'Electrician', 'hour')
		])
	]),
	group('bathroom', 'Bathroom', [
		line('bathroom-fixtures', 'Bath, basin and toilet', 'set'),
		line('bathroom-tiling', 'Tiling', 'm²'),
		line('bathroom-plumbing', 'Plumber', 'hour')
	]),
	group('living', 'Living areas', [
		line('living-flooring', 'Flooring', 'm²'),
		line('living-painting', 'Painting', 'm²'),
		line('living-lighting', 'Light fittings', 'fitting')
	]),
	group('general', 'Permits and clean-up', [
		line('general-permits', 'Permits and fees', 'permit'),
		line('general-waste', 'Waste removal', 'load')
	])
]);

export const templates: readonly BudgetTemplate[] = Object.freeze([weddingTemplate, homeRenovationTemplate]);

/** A fresh, mutable copy of a template's Items, so one use can never change the definition or another use. */
export function copyTemplateItems(template: BudgetTemplate): TemplateItem[] {
	return template.items.map((item) => ({ ...item }));
}
