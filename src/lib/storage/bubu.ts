import type { Budget, Item, Uuid } from '../budget/model';
import { isUuid, validateBudget, validateItems, type ValidationIssue } from '../budget/validation';

/**
 * The single browser-local persistence boundary for BuBu (localStorage).
 *
 * Layout, every key prefixed `bubu:`:
 *   bubu:budget:<budgetId>  ->  { version, data: Budget }
 *   bubu:items:<budgetId>   ->  { version, data: Item[] }
 *
 * Reads validate what they load. Anything missing, corrupt, from an unknown schema version or
 * otherwise invalid comes back as a structured error and is left untouched in storage; writes
 * refuse to replace such unreadable data unless the caller explicitly opts in. Failures (storage
 * unavailable, quota exceeded, ...) are returned, never thrown, so the UI can present them.
 *
 * Browser globals are only read inside method calls (and only when `window` exists), never at
 * import time, so prerendering a page that imports this module is safe.
 */
export const STORAGE_PREFIX = 'bubu:';
export const SCHEMA_VERSION = 1;

export const budgetKey = (budgetId: Uuid) => `${STORAGE_PREFIX}budget:${budgetId}`;
export const itemsKey = (budgetId: Uuid) => `${STORAGE_PREFIX}items:${budgetId}`;

export type StorageErrorKind =
	| 'unavailable'
	| 'not-found'
	| 'corrupt'
	| 'unsupported-version'
	| 'invalid-data'
	| 'unreadable-existing'
	| 'quota-exceeded'
	| 'read-failed'
	| 'write-failed';

export interface StorageError {
	kind: StorageErrorKind;
	message: string;
	key?: string;
	/** The version found in storage, for `unsupported-version`. */
	version?: unknown;
	/** Validation problems, for `corrupt` and `invalid-data`. */
	issues?: ValidationIssue[];
	cause?: unknown;
}

export type StorageResult<T> = { ok: true; value: T } | { ok: false; error: StorageError };

export interface WriteOptions {
	/** Replace existing data even if it is corrupt or from an unknown version. Off by default. */
	overwriteUnreadable?: boolean;
}

export interface BudgetListing {
	budgets: Budget[];
	/** Budget records that exist but could not be loaded, so one bad record does not hide the rest. */
	failures: { budgetId: string; error: StorageError }[];
}

export interface BubuStorage {
	readBudget(budgetId: Uuid): StorageResult<Budget>;
	writeBudget(budget: Budget, options?: WriteOptions): StorageResult<void>;
	readItems(budgetId: Uuid): StorageResult<Item[]>;
	writeItems(budgetId: Uuid, items: readonly Item[], options?: WriteOptions): StorageResult<void>;
	/** Budgets found in storage, ordered by id. */
	listBudgets(): StorageResult<BudgetListing>;
	/** Remove one Budget and its Items. */
	deleteBudget(budgetId: Uuid): StorageResult<void>;
	/** Remove every `bubu:` key (and nothing else). Returns the number of keys removed. */
	clearAll(): StorageResult<number>;
}

const fail = <T>(error: StorageError): StorageResult<T> => ({ ok: false, error });
const succeed = <T>(value: T): StorageResult<T> => ({ ok: true, value });

function isQuotaError(error: unknown): boolean {
	return (
		error instanceof DOMException &&
		(error.name === 'QuotaExceededError' ||
			error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
			error.code === 22 ||
			error.code === 1014)
	);
}

/** localStorage of the current window, or null when unavailable (prerender, blocked, disabled). */
export function getBrowserStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * Build the storage API. `getStorage` is called on every operation, never up front, so creating
 * this at module load is free of browser access. Tests inject a fake Storage.
 */
export function createBubuStorage(getStorage: () => Storage | null = getBrowserStorage): BubuStorage {
	const unavailable = <T>(): StorageResult<T> =>
		fail({ kind: 'unavailable', message: 'Browser storage is not available.' });

	/** Load, parse and validate one envelope. Never modifies storage. */
	function load<T>(
		storage: Storage,
		key: string,
		validate: (data: unknown) => ValidationIssue[]
	): StorageResult<T> {
		let raw: string | null;
		try {
			raw = storage.getItem(key);
		} catch (cause) {
			return fail({ kind: 'read-failed', key, message: `Could not read ${key}.`, cause });
		}
		if (raw === null) return fail({ kind: 'not-found', key, message: `Nothing stored under ${key}.` });

		let envelope: unknown;
		try {
			envelope = JSON.parse(raw);
		} catch (cause) {
			return fail({ kind: 'corrupt', key, message: `${key} is not valid JSON.`, cause });
		}
		if (typeof envelope !== 'object' || envelope === null || !('version' in envelope) || !('data' in envelope)) {
			return fail({ kind: 'corrupt', key, message: `${key} is not a BuBu storage envelope.` });
		}
		if (envelope.version !== SCHEMA_VERSION) {
			return fail({
				kind: 'unsupported-version',
				key,
				version: envelope.version,
				message: `${key} uses schema version ${String(envelope.version)}; this app supports ${SCHEMA_VERSION}.`
			});
		}
		const issues = validate(envelope.data);
		if (issues.length > 0) {
			return fail({ kind: 'corrupt', key, issues, message: `${key} failed validation (${issues.length} problem(s)).` });
		}
		return succeed(envelope.data as T);
	}

	function save(
		storage: Storage,
		key: string,
		data: unknown,
		validateExisting: (data: unknown) => ValidationIssue[],
		options: WriteOptions
	): StorageResult<void> {
		if (!options.overwriteUnreadable) {
			const existing = load(storage, key, validateExisting);
			if (!existing.ok && existing.error.kind !== 'not-found') {
				return fail({
					kind: 'unreadable-existing',
					key,
					cause: existing.error,
					message: `Refusing to overwrite unreadable data in ${key} (${existing.error.kind}).`
				});
			}
		}
		try {
			storage.setItem(key, JSON.stringify({ version: SCHEMA_VERSION, data }));
			return succeed(undefined);
		} catch (cause) {
			return isQuotaError(cause)
				? fail({ kind: 'quota-exceeded', key, message: 'Browser storage is full.', cause })
				: fail({ kind: 'write-failed', key, message: `Could not write ${key}.`, cause });
		}
	}

	const invalidId = <T>(budgetId: string): StorageResult<T> =>
		fail({ kind: 'invalid-data', message: `"${budgetId}" is not a Budget UUID.` });

	function keysWithPrefix(storage: Storage, prefix: string): string[] {
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key?.startsWith(prefix)) keys.push(key);
		}
		return keys;
	}

	function removeKeys(storage: Storage, keys: string[]): StorageResult<number> {
		for (const key of keys) {
			try {
				storage.removeItem(key);
			} catch (cause) {
				return fail({ kind: 'write-failed', key, message: `Could not remove ${key}.`, cause });
			}
		}
		return succeed(keys.length);
	}

	const api: BubuStorage = {
		readBudget(budgetId) {
			if (!isUuid(budgetId)) return invalidId(budgetId);
			const storage = getStorage();
			if (!storage) return unavailable();
			const result = load<Budget>(storage, budgetKey(budgetId), validateBudget);
			if (result.ok && result.value.id !== budgetId) {
				return fail({ kind: 'corrupt', key: budgetKey(budgetId), message: 'Stored Budget id does not match its key.' });
			}
			return result;
		},

		writeBudget(budget, options = {}) {
			const issues = validateBudget(budget);
			if (issues.length > 0) {
				return fail({ kind: 'invalid-data', issues, message: 'Budget is not valid, so it was not saved.' });
			}
			const storage = getStorage();
			if (!storage) return unavailable();
			return save(storage, budgetKey(budget.id), budget, validateBudget, options);
		},

		readItems(budgetId) {
			if (!isUuid(budgetId)) return invalidId(budgetId);
			const storage = getStorage();
			if (!storage) return unavailable();
			return load<Item[]>(storage, itemsKey(budgetId), (data) => validateItems(budgetId, data));
		},

		writeItems(budgetId, items, options = {}) {
			if (!isUuid(budgetId)) return invalidId(budgetId);
			const issues = validateItems(budgetId, items);
			if (issues.length > 0) {
				return fail({ kind: 'invalid-data', issues, message: 'Items are not valid, so they were not saved.' });
			}
			const storage = getStorage();
			if (!storage) return unavailable();
			return save(storage, itemsKey(budgetId), items, (data) => validateItems(budgetId, data), options);
		},

		listBudgets() {
			const storage = getStorage();
			if (!storage) return unavailable();
			const prefix = budgetKey('');
			const listing: BudgetListing = { budgets: [], failures: [] };
			for (const key of keysWithPrefix(storage, prefix).sort()) {
				const budgetId = key.slice(prefix.length);
				const result = api.readBudget(budgetId);
				if (result.ok) listing.budgets.push(result.value);
				else listing.failures.push({ budgetId, error: result.error });
			}
			return succeed(listing);
		},

		deleteBudget(budgetId) {
			if (!isUuid(budgetId)) return invalidId(budgetId);
			const storage = getStorage();
			if (!storage) return unavailable();
			const removed = removeKeys(storage, [budgetKey(budgetId), itemsKey(budgetId)]);
			return removed.ok ? succeed(undefined) : removed;
		},

		clearAll() {
			const storage = getStorage();
			if (!storage) return unavailable();
			return removeKeys(storage, keysWithPrefix(storage, STORAGE_PREFIX));
		}
	};
	return api;
}

/** The app-wide storage instance. Safe to import anywhere: it touches no browser global until used. */
export const bubuStorage: BubuStorage = createBubuStorage();
