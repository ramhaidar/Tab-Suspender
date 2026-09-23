enum LocalStoreKeys {
	INSTALLED = 'installed',
	PARK_HISTORY = 'parkHistory',
	CLOSE_HISTORY = 'closeHistory'
}

type LocalStoreApi = {
	get(key: string): Promise<unknown>;
	set(key: string, value: unknown): Promise<void>;
	remove(key: string): Promise<void>;
};

const localStoreGlobals = globalThis as typeof globalThis & { LocalStore: LocalStoreApi };
const localStoreKeys = Object.fromEntries(Object.values(LocalStoreKeys).map((name) => [name, true]));

localStoreGlobals.LocalStore = {
	async get(key: string): Promise<unknown> {
		checkKey(key);
		return (await chrome.storage.local.get([key]))[key];
	},
	set(key: string, value: unknown): Promise<void> {
		checkKey(key);
		return chrome.storage.local.set({ [key]: value });
	},
	remove(key: string): Promise<void> {
		checkKey(key);
		return chrome.storage.local.remove(key);
	}
};

function checkKey(key: string): void {
	if (!localStoreKeys[key]) {
		console.error(`Key[${key}] is not supported by LocalStore`);
	}
}
