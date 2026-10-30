/** An in-memory `Storage` whose reads and writes can be made to fail, for storage-failure tests. */
export class FakeStorage implements Storage {
	data = new Map<string, string>();
	failWrite: Error | null = null;
	failReads = false;
	writes: string[] = [];

	get length() {
		return this.data.size;
	}
	key(index: number) {
		return [...this.data.keys()][index] ?? null;
	}
	getItem(key: string) {
		if (this.failReads) throw new Error('read blocked');
		return this.data.get(key) ?? null;
	}
	setItem(key: string, value: string) {
		if (this.failWrite) throw this.failWrite;
		this.writes.push(key);
		this.data.set(key, value);
	}
	removeItem(key: string) {
		this.data.delete(key);
	}
	clear() {
		this.data.clear();
	}
}
