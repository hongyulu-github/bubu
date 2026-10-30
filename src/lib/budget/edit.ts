import { deriveItemKinds, type Item, type ItemKind, type Uuid } from './model';
import { parseErrorMessage, parseQuantity, parseUnitPrice, toString } from './numbers';

/**
 * Pure validation and application of one inline cell edit to the flat Item array.
 *
 * Permissions: Description, Quantity and Unit are editable on every Item; Unit price only on a
 * Line (a Group's Unit price is computed from its children). Code and Total are never editable.
 * An edit that is invalid, forbidden, or changes nothing leaves the array untouched, so callers
 * only record history for edits that really change data.
 */
export type EditableField = 'description' | 'quantity' | 'unit' | 'unitPrice';

export type EditResult =
	| { ok: true; changed: boolean; items: Item[] }
	| { ok: false; reason: 'invalid' | 'read-only' | 'unknown-item'; message: string };

const FIELD_NAMES: Record<EditableField, string> = {
	description: 'Description',
	quantity: 'Quantity',
	unit: 'Unit',
	unitPrice: 'Unit price'
};

/** Whether an Item of this kind may be edited in this field (`code` and `total` never can). */
export function canEditField(kind: ItemKind, field: string): field is EditableField {
	if (field === 'unitPrice') return kind === 'line';
	return field === 'description' || field === 'quantity' || field === 'unit';
}

type Parsed = { ok: true; value: string | undefined } | { ok: false; message: string };

function parseFieldValue(field: EditableField, text: string): Parsed {
	switch (field) {
		case 'description':
			return { ok: true, value: text.trim() };
		case 'unit': {
			const unit = text.trim();
			return { ok: true, value: unit === '' ? undefined : unit };
		}
		case 'quantity':
		case 'unitPrice': {
			const result = field === 'quantity' ? parseQuantity(text) : parseUnitPrice(text);
			// Stored as the decimal adapter's string: every typed digit is kept, nothing is rounded.
			return result.ok ? { ok: true, value: toString(result.value) } : { ok: false, message: parseErrorMessage(result.error) };
		}
	}
}

export function applyFieldEdit(items: readonly Item[], itemId: Uuid, field: EditableField, text: string): EditResult {
	const index = items.findIndex((item) => item.id === itemId);
	if (index === -1) return { ok: false, reason: 'unknown-item', message: 'That Item no longer exists.' };

	const kind = deriveItemKinds(items).get(itemId)!;
	if (!canEditField(kind, field)) {
		return { ok: false, reason: 'read-only', message: `${FIELD_NAMES[field]} is calculated for a Group and cannot be edited.` };
	}

	const parsed = parseFieldValue(field, text);
	if (!parsed.ok) return { ok: false, reason: 'invalid', message: parsed.message };

	const current = items[index];
	if (current[field] === parsed.value) return { ok: true, changed: false, items: items as Item[] };

	const updated: Item = { ...current };
	if (parsed.value === undefined) delete updated.unit;
	else Object.assign(updated, { [field]: parsed.value });

	return { ok: true, changed: true, items: items.map((item, i) => (i === index ? updated : item)) };
}
