/**
 * Bug Fix Test: Unsuspend Current Tab in Group
 *
 * ROOT CAUSE: When Chrome discards and restores tabs, it changes their IDs.
 * The park.html URL contains the OLD tab ID, but the tab object has the NEW ID.
 * RestoreMessage must include originRefId so park.html can match either old or new ID.
 *
 * SCENARIO:
 * 1. Tab is suspended with ID 100 → park.html?tabId=100
 * 2. Chrome discards tab, changes ID to 101
 * 3. User presses "Unsuspend Current Tab" hotkey
 * 4. TabManager.unsuspendTab() sends RestoreMessage with tab.id=101 and originRefId=100
 * 5. park.html with ?tabId=100 matches originRefId=100 → restores correctly
 */

// Import test setup first
import '../lib/Chrome';
import '../typing/global.d';

type UnsuspendGroupTabManager = {
	createNewTabInfo: (tab: chrome.tabs.Tab) => {
		oldRefId?: number;
		originRefId?: number;
		parked?: boolean;
	};
	getTabInfoById: (id: number) => { id: number; oldRefId?: number; originRefId?: number; newRefId?: number };
	unsuspendTab: (tab: chrome.tabs.Tab) => void;
};
type UnsuspendGroupTabManagerConstructor = new () => UnsuspendGroupTabManager;
type UnsuspendGroupTestGlobals = typeof global & {
	sessionsPageUrl: string;
	wizardPageUrl: string;
	historyPageUrl: string;
	parkUrl: string;
	trace: boolean;
	debug: boolean;
	debugScreenCache: boolean;
	TSSessionId: number;
	getScreenCache: unknown;
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
	tabManager: UnsuspendGroupTabManager;
};
const testGlobals = global as UnsuspendGroupTestGlobals;

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
	get: jest.fn().mockResolvedValue(false)
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

describe('Unsuspend Current Tab in Tab Group - Bug Fix', () => {
	let tabManager: UnsuspendGroupTabManager;
	let TabManager: UnsuspendGroupTabManagerConstructor;
	let TabInfo: unknown;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		// Clear global variables
		testGlobals.getScreenCache = null;
		(testGlobals.Date.now as jest.Mock).mockReturnValue(1640995200000);

		// Re-import modules
		const TabInfoModule = require('../../modules/model/TabInfo');
		TabInfo = TabInfoModule.TabInfo;

		// Make TabInfo available globally
		testGlobals.TabInfo = TabInfo;

		const TabManagerModule = require('../../modules/TabManager');
		TabManager = TabManagerModule.TabManager;

		tabManager = new TabManager();

		// Make tabManager available globally
		testGlobals.tabManager = tabManager;
	});

	describe('TabManager.unsuspendTab with Tab ID Replacement', () => {
		it('should send RestoreMessage with originRefId when tab was replaced by Chrome', () => {
			// Create a suspended tab that was replaced by Chrome
			// Original ID: 100 -> New ID after discard: 101
			const oldTabId = 100;
			const newTabId = 101;

			// Create mock tab with park.html URL containing OLD tab ID
			const mockTab: chrome.tabs.Tab = {
				id: newTabId, // Chrome assigned new ID
				windowId: 1,
				index: 0,
				url: `chrome-extension://test/park.html?tabId=${oldTabId}&sessionId=123456&url=https://example.com`,
				title: 'Suspended Tab',
				favIconUrl: '',
				active: true,
				pinned: false,
				discarded: false,
				autoDiscardable: true,
				audible: false,
				groupId: 910784496,
				status: 'complete',
				highlighted: true,
				incognito: false,
				selected: true
			};

			// Create TabInfo and simulate tab replacement tracking
			const tabInfo = tabManager.createNewTabInfo(mockTab);
			tabInfo.oldRefId = oldTabId;
			tabInfo.originRefId = oldTabId;
			tabInfo.parked = true;

			// Call unsuspendTab - this should send RestoreMessage with originRefId
			tabManager.unsuspendTab(mockTab);

			// Verify chrome.runtime.sendMessage was called
			expect(chrome.runtime.sendMessage).toHaveBeenCalled();

			// Get the message that was sent
			const sendMessageCall = (chrome.runtime.sendMessage as jest.Mock).mock.calls[0];
			const message = sendMessageCall[0];

			// Verify the message contains originRefId
			expect(message.method).toBe('[AutomaticTabCleaner:RestoreMessage]');
			expect(message.tab).toBeDefined();
			expect(message.tab.id).toBe(newTabId); // New ID
			expect(message.originRefId).toBe(oldTabId); // Old ID for matching in park.html
		});

		it('should handle tab without replacement (originRefId is null)', () => {
			// Tab was never replaced, no originRefId
			const tabId = 200;

			const mockTab: chrome.tabs.Tab = {
				id: tabId,
				windowId: 1,
				index: 0,
				url: `chrome-extension://test/park.html?tabId=${tabId}&sessionId=123456&url=https://example.com`,
				title: 'Suspended Tab',
				favIconUrl: '',
				active: true,
				pinned: false,
				discarded: false,
				autoDiscardable: true,
				audible: false,
				groupId: -1,
				status: 'complete',
				highlighted: true,
				incognito: false,
				selected: true
			};

			// Create TabInfo without replacement
			const tabInfo = tabManager.createNewTabInfo(mockTab);
			tabInfo.parked = true;
			// originRefId remains undefined

			// Call unsuspendTab
			tabManager.unsuspendTab(mockTab);

			// Verify message was sent
			expect(chrome.runtime.sendMessage).toHaveBeenCalled();

			const sendMessageCall = (chrome.runtime.sendMessage as jest.Mock).mock.calls[0];
			const message = sendMessageCall[0];

			expect(message.method).toBe('[AutomaticTabCleaner:RestoreMessage]');
			expect(message.tab.id).toBe(tabId);
			expect(message.originRefId).toBeUndefined(); // No replacement occurred
		});
	});

	describe('Tab Replacement Tracking (onReplaced handler)', () => {
		it('should track oldRefId and newRefId when Chrome replaces tab', () => {
			const oldTabId = 300;
			const newTabId = 301;

			// Create initial tab info
			const initialTab: chrome.tabs.Tab = {
				id: oldTabId,
				windowId: 1,
				index: 0,
				url: `chrome-extension://test/park.html?tabId=${oldTabId}&url=https://example.com`,
				title: 'Test',
				favIconUrl: '',
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

			tabManager.createNewTabInfo(initialTab);

			// Simulate Chrome's onReplaced event
			// This happens when Chrome discards/restores a tab
			const onReplacedListenerCall = (chrome.tabs.onReplaced.addListener as jest.Mock).mock.calls[0];
			const onReplacedHandler = onReplacedListenerCall[0];

			// Mock chrome.tabs.get to return the new tab with park.html URL
			(chrome.tabs.get as jest.Mock).mockImplementation((tabId, callback) => {
				if (tabId === newTabId) {
					callback({
						id: newTabId,
						url: `chrome-extension://test/park.html?tabId=${oldTabId}&url=https://example.com`
					});
				}
			});

			// Trigger replacement
			onReplacedHandler(newTabId, oldTabId);

			// Verify tracking
			const oldTabInfo = tabManager.getTabInfoById(oldTabId);
			const newTabInfo = tabManager.getTabInfoById(newTabId);

			expect(newTabInfo).toBeDefined();
			expect(newTabInfo.id).toBe(newTabId);
			expect(newTabInfo.oldRefId).toBe(oldTabId);
			expect(newTabInfo.originRefId).toBe(oldTabId); // Should match original tab ID from URL
			expect(oldTabInfo.newRefId).toBe(newTabId);
		});
	});

	describe('Group Unsuspend Scenario', () => {
		it('should only unsuspend one tab when multiple tabs in group', () => {
			// Simulate 3 suspended tabs in a Tab Group
			// All were replaced by Chrome: 100->101, 200->201, 300->301
			const tabs = [
				{ oldId: 100, newId: 101 },
				{ oldId: 200, newId: 201 },
				{ oldId: 300, newId: 301 }
			];

			const groupId = 910784496;

			// Create TabInfos for all tabs
			tabs.forEach(({ oldId, newId }) => {
				const mockTab: chrome.tabs.Tab = {
					id: newId,
					windowId: 1,
					index: 0,
					url: `chrome-extension://test/park.html?tabId=${oldId}&url=https://example.com`,
					title: `Tab ${oldId}`,
					favIconUrl: '',
					active: false,
					pinned: false,
					discarded: false,
					autoDiscardable: true,
					audible: false,
					groupId: groupId,
					status: 'complete',
					highlighted: false,
					incognito: false,
					selected: false
				};

				const tabInfo = tabManager.createNewTabInfo(mockTab);
				tabInfo.oldRefId = oldId;
				tabInfo.originRefId = oldId;
				tabInfo.parked = true;
			});

			// User unsuspends tab 201 (was 200)
			const targetTab: chrome.tabs.Tab = {
				id: 201,
				windowId: 1,
				index: 1,
				url: 'chrome-extension://test/park.html?tabId=200&url=https://example.com',
				title: 'Tab 200',
				favIconUrl: '',
				active: true,
				pinned: false,
				discarded: false,
				autoDiscardable: true,
				audible: false,
				groupId: groupId,
				status: 'complete',
				highlighted: true,
				incognito: false,
				selected: true
			};

			// Call unsuspendTab
			tabManager.unsuspendTab(targetTab);

			// Verify only ONE message was sent
			expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

			const message = (chrome.runtime.sendMessage as jest.Mock).mock.calls[0][0];

			// Verify it's for the correct tab
			expect(message.tab.id).toBe(201);
			expect(message.originRefId).toBe(200);

			// In park.html, only the tab with ?tabId=200 will match originRefId=200
			// Other tabs with ?tabId=100 and ?tabId=300 will NOT match
		});
	});

	describe('park.html Matching Logic', () => {
		it('should match tab when current ID matches', () => {
			// Simulate park.html receiving RestoreMessage
			const parkUrlTabId = 100; // From URL: ?tabId=100

			const message = {
				method: '[AutomaticTabCleaner:RestoreMessage]',
				tab: { id: 100 }, // Same ID
				originRefId: undefined
			};

			// Matching logic from park.ts
			const myTabId = parkUrlTabId;
			const messageTabId = message.tab.id;
			const originRefId = message.originRefId;

			const isMatch =
				(!Number.isNaN(myTabId) && messageTabId && myTabId === messageTabId) ||
				(!Number.isNaN(myTabId) && originRefId && myTabId === originRefId);

			expect(isMatch).toBe(true);
		});

		it('should match tab when originRefId matches (after Chrome replacement)', () => {
			// Simulate park.html with old ID in URL
			const parkUrlTabId = 100; // From URL: ?tabId=100

			const message = {
				method: '[AutomaticTabCleaner:RestoreMessage]',
				tab: { id: 101 }, // New ID after replacement
				originRefId: 100 // Old ID
			};

			// Matching logic from park.ts
			const myTabId = parkUrlTabId;
			const messageTabId = message.tab.id;
			const originRefId = message.originRefId;

			const matchWithCurrent = !Number.isNaN(myTabId) && messageTabId && myTabId === messageTabId;
			const matchWithOrigin = !Number.isNaN(myTabId) && originRefId && myTabId === originRefId;
			const isMatch = matchWithCurrent || matchWithOrigin;

			expect(matchWithCurrent).toBe(false); // 100 !== 101
			expect(matchWithOrigin).toBe(true); // 100 === 100
			expect(isMatch).toBe(true); // Should restore via originRefId
		});

		it('should NOT match wrong tab even with originRefId present', () => {
			// Tab 1: ?tabId=100
			const parkUrlTabId = 100;

			// RestoreMessage for Tab 2 (originRefId=200)
			const message = {
				method: '[AutomaticTabCleaner:RestoreMessage]',
				tab: { id: 201 },
				originRefId: 200
			};

			// Matching logic
			const myTabId = parkUrlTabId;
			const messageTabId = message.tab.id;
			const originRefId = message.originRefId;

			const isMatch =
				(!Number.isNaN(myTabId) && messageTabId && myTabId === messageTabId) ||
				(!Number.isNaN(myTabId) && originRefId && myTabId === originRefId);

			expect(isMatch).toBe(false); // Should NOT match
		});
	});
});
