// Import test setup first
import '../lib/Chrome';
import '../typing/global.d';

type CtrlClickTestGlobals = typeof global & {
	sessionsPageUrl: string;
	wizardPageUrl: string;
	historyPageUrl: string;
	parkUrl: string;
	trace: boolean;
	debug: boolean;
	debugScreenCache: boolean;
	TSSessionId: number;
	getScreenCache: unknown;
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
	TabObserver: unknown;
	TabInfo: unknown;
};
const testGlobals = global as CtrlClickTestGlobals;

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
		if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
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

describe('Ctrl/Cmd+Click Suspend Functionality', () => {
	let tabManager: TabManager;
	let TabManagerClass: typeof TabManager;
	let TabInfoClass: typeof TabInfo;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		// Clear global variables
		testGlobals.getScreenCache = null;
		testGlobals.nextTabShouldBeSuspended = false;

		// Try to mock Date.now if not using fake timers
		try {
			(testGlobals.Date.now as jest.Mock).mockReturnValue(1640995200000);
		} catch (_e) {
			// Ignore if Date.now mock is not available (e.g., when using fake timers)
		}

		// Re-import modules
		const TabInfoModule = require('../../modules/model/TabInfo');
		TabInfoClass = TabInfoModule.TabInfo;

		// Make TabInfo available globally
		testGlobals.TabInfo = TabInfoClass;

		const TabManagerModule = require('../../modules/TabManager');
		TabManagerClass = TabManagerModule.TabManager;

		tabManager = new TabManagerClass();
	});

	afterEach(() => {
		jest.clearAllTimers();
	});

	test('should mark tab for suspension when Ctrl/Cmd+Click is detected and setting is enabled', async () => {
		// Set the flag that indicates Ctrl/Cmd+Click
		testGlobals.nextTabShouldBeSuspended = true;

		// Mock settings.get to return true for suspendOnCtrlClick
		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		// Simulate tab creation (background tab)
		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: false,
			discarded: false,
			autoDiscardable: false
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// Check that the tab was marked for suspension
		const tabInfo = tabManager.getTabInfoById(tab.id);
		expect(tabInfo.markedForLoadSuspended).toBe(true);
		expect(tabInfo.originalUrlBeforeSuspend).toBe('https://example.com');
		expect(testGlobals.nextTabShouldBeSuspended).toBe(false);
	});

	test('should NOT mark tab for suspension when setting is disabled', async () => {
		// Set the flag that indicates Ctrl/Cmd+Click
		testGlobals.nextTabShouldBeSuspended = true;

		// Mock settings.get to return false for suspendOnCtrlClick
		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(false);
			return Promise.resolve(false);
		});

		// Simulate tab creation (background tab)
		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: false,
			discarded: false,
			autoDiscardable: false
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// Check that the tab was NOT marked for suspension
		const tabInfo = tabManager.getTabInfoById(tab.id);
		expect(tabInfo.markedForLoadSuspended).toBe(false);
		expect(testGlobals.nextTabShouldBeSuspended).toBe(false);
	});

	test('should NOT mark active tab for suspension even with Ctrl/Cmd+Click', async () => {
		// Set the flag that indicates Ctrl/Cmd+Click
		testGlobals.nextTabShouldBeSuspended = true;

		// Mock settings.get to return true for suspendOnCtrlClick
		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		// Simulate tab creation (ACTIVE tab)
		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: true, // Active tab
			discarded: false,
			autoDiscardable: false
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// Check that the tab was NOT marked for suspension (because it's active)
		const tabInfo = tabManager.getTabInfoById(tab.id);
		expect(tabInfo.markedForLoadSuspended).toBe(false);
	});

	test('should suspend tab with favicon when page is complete', async () => {
		jest.useFakeTimers();

		// First, mark a tab for suspension
		testGlobals.nextTabShouldBeSuspended = true;

		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: false,
			discarded: false,
			autoDiscardable: false,
			status: 'loading'
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// Verify tab is marked for suspension
		const tabInfo = tabManager.getTabInfoById(tab.id);
		expect(tabInfo.markedForLoadSuspended).toBe(true);

		// Mock chrome.tabs.get to return tab with favicon
		(chrome.tabs.get as jest.Mock).mockResolvedValue({
			...tab,
			id: 1,
			title: 'Example Page',
			favIconUrl: 'https://example.com/favicon.ico',
			status: 'complete'
		});

		// Mock chrome.tabs.update
		(chrome.tabs.update as jest.Mock).mockResolvedValue(undefined);

		// Now trigger onUpdated with status=complete
		const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0][0];
		await onUpdatedListener(tab.id, { status: 'complete' }, { ...tab, status: 'complete' });

		// Fast-forward timers to trigger polling
		await jest.advanceTimersByTimeAsync(200);

		// Check that chrome.tabs.get was called
		expect(chrome.tabs.get).toHaveBeenCalledWith(tab.id);

		// Wait for promise to resolve
		await Promise.resolve();

		// Check that chrome.tabs.update was called with park URL
		expect(chrome.tabs.update).toHaveBeenCalledWith(
			tab.id,
			expect.objectContaining({
				url: expect.stringContaining('park.html')
			})
		);

		// Verify the URL contains title and favicon
		const updateCall = (chrome.tabs.update as jest.Mock).mock.calls[0];
		const parkUrl = updateCall[1].url;
		expect(parkUrl).toContain('title=Example%20Page');
		expect(parkUrl).toContain('icon=https%3A%2F%2Fexample.com%2Ffavicon.ico');
		expect(parkUrl).toContain('url=https%3A%2F%2Fexample.com');

		jest.useRealTimers();
	});

	test('should retry polling for favicon if not available immediately', async () => {
		jest.useFakeTimers();

		// First, mark a tab for suspension
		testGlobals.nextTabShouldBeSuspended = true;

		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: false,
			discarded: false,
			autoDiscardable: false,
			status: 'loading'
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// Mock chrome.tabs.get to return tab WITHOUT favicon first, then WITH favicon
		let callCount = 0;
		(chrome.tabs.get as jest.Mock).mockImplementation(() => {
			callCount++;
			if (callCount === 1) {
				// First call - no favicon
				return Promise.resolve({
					...tab,
					id: 1,
					title: 'Example Page',
					favIconUrl: undefined,
					status: 'complete'
				});
			} else {
				// Second call - with favicon
				return Promise.resolve({
					...tab,
					id: 1,
					title: 'Example Page',
					favIconUrl: 'https://example.com/favicon.ico',
					status: 'complete'
				});
			}
		});

		// Mock chrome.tabs.update
		(chrome.tabs.update as jest.Mock).mockResolvedValue(undefined);

		// Now trigger onUpdated with status=complete
		const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0][0];
		await onUpdatedListener(tab.id, { status: 'complete' }, { ...tab, status: 'complete' });

		// Fast-forward first polling attempt (no favicon)
		await jest.advanceTimersByTimeAsync(200);
		await Promise.resolve();

		// Verify first call was made
		expect(chrome.tabs.get).toHaveBeenCalledTimes(1);

		// chrome.tabs.update should NOT have been called yet (no favicon)
		expect(chrome.tabs.update).not.toHaveBeenCalled();

		// Fast-forward second polling attempt (with favicon)
		await jest.advanceTimersByTimeAsync(200);
		await Promise.resolve();

		// Verify second call was made
		expect(chrome.tabs.get).toHaveBeenCalledTimes(2);

		// Now chrome.tabs.update should have been called
		expect(chrome.tabs.update).toHaveBeenCalledWith(
			tab.id,
			expect.objectContaining({
				url: expect.stringContaining('park.html')
			})
		);

		// Verify the URL contains favicon
		const updateCall = (chrome.tabs.update as jest.Mock).mock.calls[0];
		const parkUrl = updateCall[1].url;
		expect(parkUrl).toContain('icon=https%3A%2F%2Fexample.com%2Ffavicon.ico');

		jest.useRealTimers();
	});

	test('should mark tab for suspension even if URL is temporarily undefined, but wait for valid URL', async () => {
		jest.useFakeTimers();

		// First, set flag for suspension
		testGlobals.nextTabShouldBeSuspended = true;

		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: undefined, // URL is undefined at creation - temporary state
			pendingUrl: undefined,
			active: false,
			discarded: false,
			autoDiscardable: false,
			status: 'loading'
		};

		// Trigger the onCreated event
		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		// NEW BEHAVIOR: Tab IS marked for suspension even with undefined URL
		// We wait for the URL to become valid in onUpdated
		const tabInfo = tabManager.getTabInfoById(tab.id);
		expect(tabInfo.markedForLoadSuspended).toBe(true);
		// originalUrlBeforeSuspend is null because URL was undefined
		// We'll use updatedTab.url in pollForFavicon
		expect(tabInfo.originalUrlBeforeSuspend).toBeNull();

		jest.useRealTimers();
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 10.3 / 4.10 — Ctrl+Click suspension does NOT trigger screenshot capture
	// ══════════════════════════════════════════════════════════════════════════
	test('10.3 — screenshot NOT captured during Ctrl+Click suspension', async () => {
		jest.useFakeTimers();

		testGlobals.nextTabShouldBeSuspended = true;

		testGlobals.settings.get = jest.fn().mockImplementation((key: string) => {
			if (key === 'suspendOnCtrlClick') return Promise.resolve(true);
			return Promise.resolve(false);
		});

		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			pendingUrl: 'https://example.com',
			active: false,
			discarded: false,
			autoDiscardable: false,
			status: 'loading'
		};

		const onCreatedListener = (chrome.tabs.onCreated.addListener as jest.Mock).mock.calls[0][0];
		await onCreatedListener(tab);

		(chrome.tabs.get as jest.Mock).mockResolvedValue({
			...tab,
			status: 'complete',
			title: 'Example',
			favIconUrl: 'https://example.com/favicon.ico'
		});
		(chrome.tabs.update as jest.Mock).mockResolvedValue(undefined);

		const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0][0];
		await onUpdatedListener(tab.id, { status: 'complete' }, { ...tab, status: 'complete' });

		await jest.advanceTimersByTimeAsync(200);
		await Promise.resolve();

		// Tab navigated to park.html
		expect(chrome.tabs.update).toHaveBeenCalledWith(tab.id, expect.objectContaining({ url: expect.stringContaining('park.html') }));

		// Screenshot capture was NOT called — Ctrl+Click suspension skips it
		expect(testGlobals.tabCapture.captureTab).not.toHaveBeenCalled();

		jest.useRealTimers();
	});

	test('should NOT suspend tab if URL becomes invalid during polling', async () => {
		jest.useFakeTimers();

		// Create tab info manually
		const tab = {
			id: 1,
			windowId: 1,
			index: 0,
			url: 'https://example.com',
			active: false,
			pinned: false,
			discarded: false,
			autoDiscardable: false,
			audible: false,
			groupId: -1,
			status: 'loading',
			highlighted: false,
			incognito: false,
			selected: false
		};

		const tabInfo = tabManager.createNewTabInfo(tab);
		tabInfo.markedForLoadSuspended = true;
		tabInfo.originalUrlBeforeSuspend = null; // Explicitly set to null to simulate invalid state

		// Mock chrome.tabs.get to return tab with chrome-extension URL (invalid)
		(chrome.tabs.get as jest.Mock).mockResolvedValue({
			...tab,
			id: 1,
			title: 'Example Page',
			favIconUrl: 'https://example.com/favicon.ico',
			url: 'chrome-extension://test/park.html', // Invalid URL
			status: 'complete'
		});

		// Mock chrome.tabs.update
		(chrome.tabs.update as jest.Mock).mockResolvedValue(undefined);

		// Trigger onUpdated with status=complete
		const onUpdatedListener = (chrome.tabs.onUpdated.addListener as jest.Mock).mock.calls[0][0];
		await onUpdatedListener(tab.id, { status: 'complete' }, { ...tab, status: 'complete' });

		// Fast-forward timers
		await jest.advanceTimersByTimeAsync(200);
		await Promise.resolve();

		// Verify chrome.tabs.update was NOT called (tab should not be parked with invalid URL)
		expect(chrome.tabs.update).not.toHaveBeenCalled();

		// Verify flags were cleared
		expect(tabInfo.markedForLoadSuspended).toBe(false);
		expect(tabInfo.originalUrlBeforeSuspend).toBeNull();

		jest.useRealTimers();
	});
});
