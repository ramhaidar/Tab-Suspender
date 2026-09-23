// Mock Chrome APIs for testing

type ChromeTestGlobals = Omit<typeof global, 'chrome' | 'Response'> &
	Record<string, unknown> & {
		chrome: {
			storage: typeof mockStorage;
			tabs: typeof mockTabs;
			windows: typeof mockWindows;
			runtime: typeof mockRuntime;
			scripting: typeof mockScripting;
		};
		Response: jest.Mock;
	};
const testGlobals = global as unknown as ChromeTestGlobals;

const mockTab: chrome.tabs.Tab = {
	id: 1,
	windowId: 1,
	index: 0,
	url: 'https://example.com',
	title: 'Example',
	favIconUrl: 'https://example.com/favicon.ico',
	active: true,
	pinned: false,
	discarded: false,
	autoDiscardable: true,
	audible: false,
	groupId: -1,
	status: 'complete',
	highlighted: false,
	incognito: false,
	selected: true
};

const mockStorage = {
	local: {
		get: jest.fn().mockResolvedValue({}),
		set: jest.fn().mockResolvedValue(undefined),
		remove: jest.fn().mockResolvedValue(undefined),
		clear: jest.fn().mockResolvedValue(undefined)
	}
};

const mockTabs = {
	onCreated: {
		addListener: jest.fn()
	},
	onReplaced: {
		addListener: jest.fn()
	},
	onUpdated: {
		addListener: jest.fn()
	},
	onRemoved: {
		addListener: jest.fn()
	},
	onActivated: {
		addListener: jest.fn()
	},
	get: jest.fn().mockImplementation((tabId, callback) => {
		if (callback) {
			callback({ ...mockTab, id: tabId });
		}
	}),
	update: jest.fn().mockResolvedValue(mockTab),
	reload: jest.fn().mockResolvedValue(undefined),
	getZoom: jest.fn().mockImplementation((_tabId, callback) => {
		callback(1.0);
	}),
	setZoom: jest.fn().mockResolvedValue(undefined),
	sendMessage: jest.fn().mockResolvedValue(undefined),
	query: jest.fn().mockResolvedValue([mockTab])
};

const mockWindows = {
	getAll: jest.fn().mockImplementation((_options, callback) => {
		const mockWindow = {
			id: 1,
			tabs: [mockTab]
		};
		callback([mockWindow]);
	})
};

const mockRuntime = {
	getURL: jest.fn((path: string) => `chrome-extension://test/${path}`),
	sendMessage: jest.fn().mockResolvedValue(undefined)
};

const mockScripting = {
	executeScript: jest.fn().mockResolvedValue([{ result: 1 }])
};

testGlobals.chrome = {
	storage: mockStorage,
	tabs: mockTabs,
	windows: mockWindows,
	runtime: mockRuntime,
	scripting: mockScripting
};

// Mock DOM APIs - use Node.js built-in TextEncoder/TextDecoder
const NodeTextEncoder = require('node:util').TextEncoder;
const NodeTextDecoder = require('node:util').TextDecoder;
testGlobals.TextEncoder = NodeTextEncoder;
testGlobals.TextDecoder = NodeTextDecoder;
// Mock ReadableStream
testGlobals.ReadableStream = jest.fn().mockImplementation((options) => {
	let controller: { _chunks: unknown[]; enqueue: jest.Mock; close: jest.Mock } | undefined;
	const readable = {
		getReader: () => ({
			read: jest.fn().mockImplementation(async () => {
				if (controller?._chunks && controller._chunks.length > 0) {
					return { value: controller._chunks.shift(), done: false };
				}
				return { done: true };
			})
		})
	};

	if (options?.start) {
		controller = {
			_chunks: [],
			enqueue: jest.fn((chunk) => controller._chunks.push(chunk)),
			close: jest.fn()
		};
		options.start(controller);
	}

	return readable;
});

// Mock compression streams with simpler implementation
testGlobals.CompressionStream = jest.fn().mockImplementation(() => ({
	writable: {
		getWriter: () => ({
			write: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined)
		})
	},
	readable: {
		getReader: () => ({
			read: jest.fn().mockResolvedValue({
				value: new NodeTextEncoder().encode('compressed_data'),
				done: false
			})
		})
	}
}));

testGlobals.DecompressionStream = jest.fn().mockImplementation(() => ({
	writable: {
		getWriter: () => ({
			write: jest.fn().mockResolvedValue(undefined),
			close: jest.fn().mockResolvedValue(undefined)
		})
	},
	readable: {
		getReader: () => ({
			read: jest.fn().mockResolvedValue({
				value: new NodeTextEncoder().encode('Hello, World!'),
				done: false
			})
		})
	}
}));

testGlobals.Response = jest.fn().mockImplementation((_body) => ({
	arrayBuffer: jest.fn().mockImplementation(async () => {
		const encoder = new NodeTextEncoder();
		const data = encoder.encode('Hello, World!');
		return data.buffer;
	})
}));

// Mock global functions and variables
global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
global.atob = jest.fn((str: string) => Buffer.from(str, 'base64').toString());
// Spy on setInterval/clearInterval to track calls while keeping real functionality
jest.spyOn(global, 'setInterval');
jest.spyOn(global, 'clearInterval');
testGlobals.Date.now = jest.fn(() => 1640995200000); // Fixed timestamp for testing

// Mock additional global functions required by the modules
testGlobals.trackErrors = jest.fn();
testGlobals.trackError = jest.fn();
testGlobals.trackView = jest.fn();
testGlobals.sql_error = jest.fn();
testGlobals.hasLastError = jest.fn();
testGlobals.versionCompare = jest.fn();
testGlobals.isScreenExist = jest.fn();
testGlobals.addScreen = jest.fn();
testGlobals.getScreen = jest.fn();
testGlobals.drawPreviewTile = jest.fn();
testGlobals.html2canvas = jest.fn();
testGlobals.Store = jest.fn();
testGlobals.DBProvider = jest.fn();
testGlobals.ADDED_ON_INDEX_NAME = 'test';
testGlobals.SCREENS_BINARY_DB_NAME = 'test';
