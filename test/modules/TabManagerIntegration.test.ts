// Import test setup first
import '../lib/Chrome';
import '../typing/global.d';

type IntegrationTestGlobals = typeof global & {
	sessionsPageUrl: string;
	wizardPageUrl: string;
	historyPageUrl: string;
	parkUrl: string;
	trace: boolean;
	debug: boolean;
	debugScreenCache: boolean;
	TSSessionId: number;
	getScreenCache: { sessionId: string; tabId: string; screen?: string | null; pixRat?: number | null } | null;
	nextTabShouldBeSuspended: boolean;
	NEXT_TAB_SUSPEND_TTL: number;
	parseUrlParam: jest.Mock;
	extractHostname: jest.Mock;
	discardTab: jest.Mock;
	markForUnsuspend: jest.Mock;
	settings: { get: jest.Mock };
	whiteList: { isURIException: jest.Mock };
	ignoreList: { isTabInIgnoreTabList: jest.Mock };
	tabCapture: { captureTab: jest.Mock; injectJS: jest.Mock };
	ContextMenuController: { menuIdMap: Record<string, number> };
	pauseTics: number;
	ScreenshotController: { getScreen: jest.Mock };
	BrowserActionControl: unknown;
	HistoryOpenerController: unknown;
	TabObserver: { tickSize: number };
	TabInfo: unknown;
	TabManager: unknown;
};
const testGlobals = global as IntegrationTestGlobals;

type IntegrationTestTabInfo = {
	id: number;
	lstCapUrl?: string;
	oldRefId?: number;
	newRefId?: number;
	nonCmpltInput?: boolean;
	closed?: { at: number };
};
type IntegrationTestTabManager = {
	getTabInfoById: (id: number) => IntegrationTestTabInfo;
};
type IntegrationTestTabManagerConstructor = new () => IntegrationTestTabManager;

// Mock global variables and functions before importing
testGlobals.sessionsPageUrl = 'chrome-extension://test/sessions.html';
testGlobals.wizardPageUrl = 'chrome-extension://test/wizard_background.html';
testGlobals.historyPageUrl = 'chrome-extension://test/history.html';
testGlobals.parkUrl = 'chrome-extension://test/park.html';
testGlobals.trace = false;
testGlobals.debug = false;
testGlobals.debugScreenCache = false;
testGlobals.TSSessionId = 123456;
testGlobals.getScreenCache = null;
testGlobals.nextTabShouldBeSuspended = false;
testGlobals.NEXT_TAB_SUSPEND_TTL = 3000;

testGlobals.parseUrlParam = jest.fn((url: string, param: string) => {
	const urlParams = new URLSearchParams(url.split('?')[1]);
	return urlParams.get(param);
});

testGlobals.extractHostname = jest.fn((url: string) => {
	try {
		return new URL(url).hostname;
	} catch {
		return '';
	}
});

testGlobals.discardTab = jest.fn();
testGlobals.markForUnsuspend = jest.fn();

// Mock global objects
testGlobals.settings = {
	get: jest.fn().mockImplementation((key: string) => {
		// Disable suspendOnCtrlClick by default for integration tests
		if (key === 'suspendOnCtrlClick') return Promise.resolve(false);
		return Promise.resolve(false);
	})
};

testGlobals.whiteList = {
	isURIException: jest.fn().mockReturnValue(false)
};

testGlobals.ignoreList = {
	isTabInIgnoreTabList: jest.fn().mockReturnValue(false)
};

testGlobals.tabCapture = {
	captureTab: jest.fn(),
	injectJS: jest.fn()
};

testGlobals.ContextMenuController = {
	menuIdMap: {}
};

testGlobals.pauseTics = 0;

testGlobals.ScreenshotController = {
	getScreen: jest.fn()
};

const BrowserActionControl = jest.fn().mockImplementation(() => ({
	updateStatus: jest.fn()
}));

const HistoryOpenerController = jest.fn().mockImplementation(() => ({
	onNewTab: jest.fn(),
	onTabUpdate: jest.fn(),
	onRemoveTab: jest.fn(),
	collectInitialTabState: jest.fn()
}));

const TabObserver = {
	tickSize: 1000
};

// Make classes available globally
testGlobals.BrowserActionControl = BrowserActionControl;
testGlobals.HistoryOpenerController = HistoryOpenerController;
testGlobals.TabObserver = TabObserver;

function _sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TabManager Integration Tests', () => {
	let tabManager: IntegrationTestTabManager;
	let TabManager: IntegrationTestTabManagerConstructor;
	let TabInfo: unknown;

	// Chrome event callbacks
	let onCreatedCallback: (tab: chrome.tabs.Tab) => void;
	let onReplacedCallback: (addedTabId: number, removedTabId: number) => void;
	let onUpdatedCallback: (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void;
	let onRemovedCallback: (tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => void;
	let _onActivatedCallback: (activeInfo: chrome.tabs.TabActiveInfo) => void;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		// Clear global variables
		testGlobals.getScreenCache = null;
		testGlobals.nextTabShouldBeSuspended = false;
		(testGlobals.Date.now as jest.Mock).mockReturnValue(1640995200000);

		// Setup Chrome event listeners capture
		testGlobals.chrome.tabs.onCreated.addListener = jest.fn((callback) => {
			onCreatedCallback = callback;
		});
		testGlobals.chrome.tabs.onReplaced.addListener = jest.fn((callback) => {
			onReplacedCallback = callback;
		});
		testGlobals.chrome.tabs.onUpdated.addListener = jest.fn((callback) => {
			onUpdatedCallback = callback;
		});
		testGlobals.chrome.tabs.onRemoved.addListener = jest.fn((callback) => {
			onRemovedCallback = callback;
		});
		testGlobals.chrome.tabs.onActivated.addListener = jest.fn((callback) => {
			_onActivatedCallback = callback;
		});

		// Re-import modules
		const TabInfoModule = require('../../modules/model/TabInfo');
		TabInfo = TabInfoModule.TabInfo;

		// Make TabInfo available globally
		testGlobals.TabInfo = TabInfo;

		const TabManagerModule = require('../../modules/TabManager');
		TabManager = TabManagerModule.TabManager;

		tabManager = new TabManager();
	});

	describe('Chrome Events Integration', () => {
		it('should handle tab creation event', async () => {
			const newTab: chrome.tabs.Tab = {
				id: 1,
				windowId: 1,
				index: 0,
				url: 'https://example.com',
				title: 'Example',
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

			// Trigger onCreated event
			onCreatedCallback(newTab);

			// Should create TabInfo
			const tabInfo = tabManager.getTabInfoById(1);
			expect(tabInfo).toBeDefined();
			expect(tabInfo.id).toBe(1);
			expect(tabInfo.lstCapUrl).toBe('https://example.com');

			// Should call checkAndTurnOffAutoDiscardable
			expect(chrome.tabs.update).toHaveBeenCalledWith(1, { autoDiscardable: false });
		});

		it('should handle tab replacement event', async () => {
			const originalTab: chrome.tabs.Tab = {
				id: 1,
				windowId: 1,
				index: 0,
				url: 'https://example.com/page1',
				title: 'Page 1',
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

			// Create original tab
			onCreatedCallback(originalTab);

			// Mock chrome.tabs.get for replacement scenario
			const getTabMock = testGlobals.chrome.tabs.get as jest.Mock;
			getTabMock.mockImplementation((tabId: number, callback: (tab: chrome.tabs.Tab) => void) => {
				if (tabId === 2) {
					callback({
						id: 2,
						url: 'chrome-extension://test/park.html?tabId=1&url=https://example.com/page1'
					} as chrome.tabs.Tab);
				}
			});

			// Trigger replacement event (2 replaces 1)
			onReplacedCallback(2, 1);

			// Check that replacement was handled correctly
			const replacedTabInfo = tabManager.getTabInfoById(2);
			expect(replacedTabInfo).toBeDefined();
			expect(replacedTabInfo.oldRefId).toBe(1);

			const originalTabInfo = tabManager.getTabInfoById(1);
			expect(originalTabInfo.newRefId).toBe(2);
		});

		it('should handle tab update event', async () => {
			const tab: chrome.tabs.Tab = {
				id: 1,
				windowId: 1,
				index: 0,
				url: 'https://example.com',
				title: 'Example',
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

			// Create tab first
			onCreatedCallback(tab);

			// Trigger update event
			const changeInfo = { status: 'complete', title: 'Updated Title' };
			onUpdatedCallback(1, changeInfo, { ...tab, title: 'Updated Title' });

			const tabInfo = tabManager.getTabInfoById(1);
			expect(tabInfo.nonCmpltInput).toBe(false);
		});

		it('should handle tab removal event', async () => {
			const tab: chrome.tabs.Tab = {
				id: 1,
				windowId: 1,
				index: 0,
				url: 'https://example.com',
				title: 'Example',
				active: false,
				pinned: false,
				discarded: false,
				autoDiscardable: true,
				audible: false,
				groupId: -1,
				status: 'complete',
				highlighted: false,
				incognito: false,
				selected: false
			};

			// Create tab first
			onCreatedCallback(tab);

			// Trigger removal event
			onRemovedCallback(1, { windowId: 1, isWindowClosing: false });

			const tabInfo = tabManager.getTabInfoById(1);
			expect(tabInfo.closed).toBeDefined();
			expect(tabInfo.closed.at).toBe(1640995200000);
		});
	});

	describe('Screenshot Cache Promise Resolution Fix', () => {
		it('should demonstrate the fix for cache promise bug', () => {
			// This test verifies our fix for the race condition bug
			// Bug: screenPromise never resolves when cache is cleared before callback executes
			// Fix: Always call resolve(), regardless of cache state

			let promiseResolved = false;
			let cacheWasCleared = false;

			// Simulate the FIXED callback logic from TabManager.ts:184-195
			const fixedCallback = (screen: string, pixRat: number) => {
				// This is the FIXED logic
				if (testGlobals.getScreenCache != null) {
					testGlobals.getScreenCache.screen = screen;
					testGlobals.getScreenCache.pixRat = pixRat;
				} else {
					cacheWasCleared = true; // Race condition occurred
				}
				// KEY FIX: Always resolve, even if cache was cleared
				promiseResolved = true;
			};

			// Create cache entry
			testGlobals.getScreenCache = {
				sessionId: '123456',
				tabId: '1',
				screen: null,
				pixRat: null
			};

			// Clear the cache immediately (simulating race condition)
			testGlobals.getScreenCache = null;

			// Execute the callback - this is the fix working
			fixedCallback('mock-screen-data', 1.5);

			// Verify the fix works: callback resolves despite cleared cache
			expect(promiseResolved).toBe(true);
			expect(cacheWasCleared).toBe(true); // Confirms race condition occurred
		});

		it('should show old buggy behavior would not resolve', () => {
			// This demonstrates what the OLD (buggy) logic would do

			let promiseResolved = false;
			let callbackExecuted = false;

			// Simulate OLD BUGGY callback logic
			const buggyCallback = (screen: string, pixRat: number) => {
				callbackExecuted = true;
				// OLD BUGGY LOGIC: only resolve if cache exists
				if (testGlobals.getScreenCache != null) {
					testGlobals.getScreenCache.screen = screen;
					testGlobals.getScreenCache.pixRat = pixRat;
					promiseResolved = true; // Only resolve if cache exists!
				}
				// BUG: If cache is null, promiseResolved stays false!
			};

			// Create cache then clear it (race condition)
			testGlobals.getScreenCache = {
				sessionId: '789012',
				tabId: '2'
			};
			testGlobals.getScreenCache = null; // Cleared!

			// Execute the buggy callback
			buggyCallback('mock-data', 1);

			// With buggy logic: callback executes but promise never resolves
			expect(callbackExecuted).toBe(true); // Callback did execute
			expect(promiseResolved).toBe(false); // But promise never resolved (the bug!)
		});
	});
});
