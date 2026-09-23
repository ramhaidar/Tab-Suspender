// Import test setup first
import '../lib/Chrome';
import '../typing/global.d';

type TabGroupTestTab = Pick<chrome.tabs.Tab, 'id' | 'windowId' | 'groupId'> & Partial<chrome.tabs.Tab>;
type TabGroupManager = {
	isExceptionTab: jest.Mock;
	unsuspendTab: jest.Mock;
};
type TabGroupManagerConstructor = new (
	settings: typeof testGlobals.settings,
	whiteList: typeof testGlobals.whiteList,
	ignoreList: typeof testGlobals.ignoreList
) => TabGroupManager;
type TabGroupManagerClass = TabGroupManagerConstructor & {
	isTabURLAllowedForPark: (tab: TabGroupTestTab) => boolean;
	isTabParked: (tab: TabGroupTestTab) => boolean;
};
type TabGroupTestGlobals = typeof global & {
	sessionsPageUrl: string;
	wizardPageUrl: string;
	historyPageUrl: string;
	parkUrl: string;
	publicExtensionUrl: string;
	trace: boolean;
	debug: boolean;
	debugTabsInfo: boolean;
	debugScreenCache: boolean;
	TSSessionId: number;
	getScreenCache: unknown;
	pauseTics: number;
	isCharging: boolean;
	batteryLevel: number;
	parseUrlParam: jest.Mock;
	extractHostname: jest.Mock;
	discardTab: jest.Mock;
	markForUnsuspend: jest.Mock;
	parkTab: jest.Mock;
	unsuspendTabGroup: (tab: TabGroupTestTab | null) => void;
	parkTabGroup: (tab: TabGroupTestTab | null) => void;
	settings: { get: jest.Mock };
	whiteList: { isURIException: jest.Mock };
	ignoreList: { isTabInIgnoreTabList: jest.Mock };
	tabCapture: { captureTab: jest.Mock; injectJS: jest.Mock };
	ContextMenuController: { menuIdMap: Record<string, number> };
	ScreenshotController: { getScreen: jest.Mock };
	BrowserActionControl: unknown;
	HistoryOpenerController: unknown;
	TabObserver: unknown;
	TabInfo: unknown;
	TabManager: TabGroupManagerClass;
	tabManager: { isExceptionTab: jest.Mock; unsuspendTab: jest.Mock };
};
const testGlobals = global as TabGroupTestGlobals;

// Mock global variables and functions before importing
testGlobals.sessionsPageUrl = 'chrome-extension://test/sessions.html';
testGlobals.wizardPageUrl = 'chrome-extension://test/wizard_background.html';
testGlobals.historyPageUrl = 'chrome-extension://test/history.html';
testGlobals.parkUrl = 'chrome-extension://test/park.html';
testGlobals.publicExtensionUrl = 'chrome-extension://test/park.html';
testGlobals.trace = false;
testGlobals.debug = false;
testGlobals.debugTabsInfo = false;
testGlobals.debugScreenCache = false;
testGlobals.TSSessionId = 123456;
testGlobals.getScreenCache = null;
testGlobals.pauseTics = 0;
testGlobals.isCharging = false;
testGlobals.batteryLevel = 1.0;

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

// Mock settings
testGlobals.settings = {
	get: jest.fn((key: string) => {
		const defaults: Record<string, unknown> = {
			active: true,
			timeout: 900,
			pinned: true,
			isCloseTabsOn: false,
			ignoreAudible: true,
			animateTabIconSuspendTimeout: false,
			autoSuspendOnlyOnBatteryOnly: false,
			discardTabAfterSuspendWithTimeout: false,
			enableSuspendOnlyIfBattLvlLessValue: false,
			adaptiveSuspendTimeout: false,
			ignoreCloseGroupedTabs: false,
			ignoreSuspendGroupedTabs: false,
			autoRestoreTab: true
		};
		return Promise.resolve(defaults[key] ?? false);
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

testGlobals.ScreenshotController = {
	getScreen: jest.fn()
};

const BrowserActionControl = jest.fn().mockImplementation(() => ({
	updateStatus: jest.fn(),
	synchronizeActiveTabs: jest.fn()
}));

const HistoryOpenerController = jest.fn().mockImplementation(() => ({
	onNewTab: jest.fn(),
	onTabUpdate: jest.fn(),
	onRemoveTab: jest.fn(),
	collectInitialTabState: jest.fn()
}));

// Make classes available globally
testGlobals.BrowserActionControl = BrowserActionControl;
testGlobals.HistoryOpenerController = HistoryOpenerController;

// Define parkTabGroup and unsuspendTabGroup functions globally for testing
// These are simplified versions based on the actual implementation
testGlobals.parkTabGroup = (tab: chrome.tabs.Tab) => {
	if (tab == null || tab.groupId === -1) {
		console.warn('Cannot suspend tab group: tab is not in a group');
		return;
	}

	const groupId = tab.groupId;

	(chrome.windows.get as jest.Mock)(tab.windowId, { populate: true }, async (window: chrome.windows.Window) => {
		let number = 0;
		for (const j in window.tabs) {
			if (Object.hasOwn(window.tabs, j)) {
				const currentTab = window.tabs[j];
				// Only suspend tabs in the same group
				if (currentTab.groupId === groupId) {
					const TabManager = testGlobals.TabManager;
					if (TabManager?.isTabURLAllowedForPark(currentTab)) {
						const tabManager = testGlobals.tabManager;
						if (tabManager && !(await tabManager.isExceptionTab(currentTab))) {
							const parkTab = testGlobals.parkTab;
							if (parkTab) {
								await parkTab(currentTab, currentTab.id, { bulkNumber: currentTab.discarded ? number++ : null });
							}
						}
					}
				}
			}
		}
	});
};

testGlobals.unsuspendTabGroup = (tab: chrome.tabs.Tab) => {
	if (tab == null || tab.groupId === -1) {
		console.warn('Cannot unsuspend tab group: tab is not in a group');
		return;
	}

	const groupId = tab.groupId;
	let openedIndex = 1;

	(chrome.windows.get as jest.Mock)(tab.windowId, { populate: true }, (window: chrome.windows.Window) => {
		for (const j in window.tabs) {
			if (Object.hasOwn(window.tabs, j)) {
				const currentTab = window.tabs[j];
				// Only unsuspend tabs in the same group
				const TabManager = testGlobals.TabManager;
				if (currentTab.groupId === groupId && TabManager && TabManager.isTabParked(currentTab)) {
					const tmpFunction = (currentTab: chrome.tabs.Tab) => {
						const clzOpenedIndex = openedIndex++;
						setTimeout(() => {
							const tabManager = testGlobals.tabManager;
							if (tabManager) {
								tabManager.unsuspendTab(currentTab);
							}
						}, 1000 * clzOpenedIndex);
					};

					tmpFunction(currentTab);
				}
			}
		}
	});
};

describe('Tab Group Suspend/Unsuspend', () => {
	let tabManager: TabGroupManager;
	let TabManager: TabGroupManagerClass;
	let parkTabMock: jest.Mock;
	let unsuspendTabMock: jest.Mock;
	let mockChromeWindowsGet: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		// Reset parkTab mock
		parkTabMock = jest.fn().mockResolvedValue(undefined);
		testGlobals.parkTab = parkTabMock;

		// Reset chrome.windows.get mock
		mockChromeWindowsGet = jest.fn();
		testGlobals.chrome.windows.get = mockChromeWindowsGet as typeof chrome.windows.get;

		// Re-import modules using require (not import)
		const TabManagerModule = require('../../modules/TabManager');
		TabManager = TabManagerModule.TabManager;

		// Make TabManager available globally
		testGlobals.TabManager = TabManager;

		// Initialize TabManager
		tabManager = new TabManager(testGlobals.settings, testGlobals.whiteList, testGlobals.ignoreList);
		testGlobals.tabManager = tabManager;

		// Setup unsuspendTab mock
		unsuspendTabMock = jest.fn().mockImplementation((_tab: chrome.tabs.Tab) => {
			// Mock basic unsuspend behavior
			return Promise.resolve();
		});
		tabManager.unsuspendTab = unsuspendTabMock;

		// Mock isExceptionTab to return false by default
		tabManager.isExceptionTab = jest.fn().mockResolvedValue(false);
	});

	describe('parkTabGroup', () => {
		it('should suspend all tabs in the same group', async () => {
			const tab = {
				id: 1,
				url: 'https://example.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'https://tab1.com', active: true },
				{ ...tab, id: 2, groupId: 10, url: 'https://tab2.com', active: false },
				{ ...tab, id: 3, groupId: 10, url: 'https://tab3.com', active: false },
				{ ...tab, id: 4, groupId: 20, url: 'https://other.com', active: false }, // Different group
				{ ...tab, id: 5, groupId: -1, url: 'https://ungrouped.com', active: false } // No group
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			// Call parkTabGroup
			const parkTabGroup = testGlobals.parkTabGroup;
			await parkTabGroup(tab);

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should suspend only tabs in group 10
			expect(parkTabMock).toHaveBeenCalledTimes(3);
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1, groupId: 10 }), 1, expect.any(Object));
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2, groupId: 10 }), 2, expect.any(Object));
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 3, groupId: 10 }), 3, expect.any(Object));

			// Should NOT suspend tabs in other groups
			expect(parkTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 4 }), expect.anything(), expect.anything());
			expect(parkTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), expect.anything(), expect.anything());
		});

		it('should not suspend exception tabs (audible, pinned)', async () => {
			const tab = {
				id: 1,
				url: 'https://example.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'https://normal.com', active: false, pinned: false, audible: false },
				{ ...tab, id: 2, groupId: 10, url: 'https://music.com', active: false, pinned: false, audible: true }, // Audible
				{ ...tab, id: 3, groupId: 10, url: 'https://pinned.com', active: false, pinned: true, audible: false } // Pinned
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			// Mock isExceptionTab to return true for audible and pinned tabs
			tabManager.isExceptionTab = jest.fn().mockImplementation(async (tab: chrome.tabs.Tab) => {
				return tab.audible || tab.pinned;
			});

			const parkTabGroup = testGlobals.parkTabGroup;
			await parkTabGroup(tab);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should only suspend the normal tab (id: 1)
			expect(parkTabMock).toHaveBeenCalledTimes(1);
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 1, expect.any(Object));

			// Should NOT suspend audible or pinned tabs
			expect(parkTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.anything(), expect.anything());
			expect(parkTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), expect.anything(), expect.anything());
		});

		it('should do nothing if tab is not in a group (groupId === -1)', async () => {
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

			const tab = {
				id: 1,
				url: 'https://example.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: -1, // Not in a group
				discarded: false
			};

			const parkTabGroup = testGlobals.parkTabGroup;
			parkTabGroup(tab);

			// Should log warning
			expect(consoleSpy).toHaveBeenCalledWith('Cannot suspend tab group: tab is not in a group');

			// Should not call chrome.windows.get
			expect(mockChromeWindowsGet).not.toHaveBeenCalled();

			// Should not suspend any tabs
			expect(parkTabMock).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should do nothing if tab is null', async () => {
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

			const parkTabGroup = testGlobals.parkTabGroup;
			parkTabGroup(null);

			expect(consoleSpy).toHaveBeenCalledWith('Cannot suspend tab group: tab is not in a group');
			expect(mockChromeWindowsGet).not.toHaveBeenCalled();
			expect(parkTabMock).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should only affect tabs in the same window', async () => {
			const tab = {
				id: 1,
				url: 'https://example.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, windowId: 1, groupId: 10, url: 'https://tab1.com' },
				{ ...tab, id: 2, windowId: 1, groupId: 10, url: 'https://tab2.com' }
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				// Only return tabs for the requested window
				expect(windowId).toBe(1);
				callback({ id: windowId, tabs: windowTabs });
			});

			const parkTabGroup = testGlobals.parkTabGroup;
			await parkTabGroup(tab);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Verify chrome.windows.get was called with correct windowId
			expect(mockChromeWindowsGet).toHaveBeenCalledWith(1, { populate: true }, expect.any(Function));
		});

		it('should handle chrome-extension:// URLs (already suspended tabs)', async () => {
			const tab = {
				id: 1,
				url: 'https://example.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'https://normal.com' },
				{ ...tab, id: 2, groupId: 10, url: 'chrome-extension://test/park.html?tabId=2' }, // Already suspended
				{ ...tab, id: 3, groupId: 10, url: 'https://another.com' }
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			const parkTabGroup = testGlobals.parkTabGroup;
			await parkTabGroup(tab);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// Should only suspend normal tabs (id: 1 and 3)
			// Tab 2 is already suspended (chrome-extension:// URL) and should be skipped
			expect(parkTabMock).toHaveBeenCalledTimes(2);
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 1, expect.any(Object));
			expect(parkTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), 3, expect.any(Object));
		});
	});

	describe('unsuspendTabGroup', () => {
		it('should unsuspend all suspended tabs in the same group', async () => {
			const tab = {
				id: 1,
				url: 'chrome-extension://test/park.html?tabId=1',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'chrome-extension://test/park.html?tabId=1' }, // Suspended
				{ ...tab, id: 2, groupId: 10, url: 'chrome-extension://test/park.html?tabId=2' }, // Suspended
				{ ...tab, id: 3, groupId: 10, url: 'https://active.com' }, // Active (not suspended)
				{ ...tab, id: 4, groupId: 20, url: 'chrome-extension://test/park.html?tabId=4' }, // Different group
				{ ...tab, id: 5, groupId: -1, url: 'chrome-extension://test/park.html?tabId=5' } // No group
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(tab);

			// Wait for setTimeout delays (1 second per tab)
			await new Promise((resolve) => setTimeout(resolve, 2500));

			// Should unsuspend only suspended tabs in group 10
			expect(unsuspendTabMock).toHaveBeenCalledTimes(2);
			expect(unsuspendTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 1, groupId: 10 }));
			expect(unsuspendTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 2, groupId: 10 }));

			// Should NOT unsuspend active tabs
			expect(unsuspendTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));

			// Should NOT unsuspend tabs in other groups
			expect(unsuspendTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 4 }));
			expect(unsuspendTabMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
		});

		it('should use staggered delays to prevent overwhelming the browser', async () => {
			const tab = {
				id: 1,
				url: 'chrome-extension://test/park.html?tabId=1',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'chrome-extension://test/park.html?tabId=1' },
				{ ...tab, id: 2, groupId: 10, url: 'chrome-extension://test/park.html?tabId=2' },
				{ ...tab, id: 3, groupId: 10, url: 'chrome-extension://test/park.html?tabId=3' }
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(tab);

			// Wait for first tab (1 second delay)
			await new Promise((resolve) => setTimeout(resolve, 1100));
			expect(unsuspendTabMock).toHaveBeenCalledTimes(1);

			// Wait for second tab (2 second delay total)
			await new Promise((resolve) => setTimeout(resolve, 1000));
			expect(unsuspendTabMock).toHaveBeenCalledTimes(2);

			// Wait for third tab (3 second delay total)
			await new Promise((resolve) => setTimeout(resolve, 1000));
			expect(unsuspendTabMock).toHaveBeenCalledTimes(3);

			// Verify that calls happened in sequence (timestamps increase)
			const calls = unsuspendTabMock.mock.calls;
			expect(calls.length).toBe(3);
			expect(calls[0][0].id).toBe(1);
			expect(calls[1][0].id).toBe(2);
			expect(calls[2][0].id).toBe(3);
		});

		it('should do nothing if tab is not in a group (groupId === -1)', async () => {
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

			const tab = {
				id: 1,
				url: 'chrome-extension://test/park.html?tabId=1',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: -1, // Not in a group
				discarded: false
			};

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(tab);

			// Should log warning
			expect(consoleSpy).toHaveBeenCalledWith('Cannot unsuspend tab group: tab is not in a group');

			// Should not call chrome.windows.get
			expect(mockChromeWindowsGet).not.toHaveBeenCalled();

			// Should not unsuspend any tabs
			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(unsuspendTabMock).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should do nothing if tab is null', async () => {
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(null);

			expect(consoleSpy).toHaveBeenCalledWith('Cannot unsuspend tab group: tab is not in a group');
			expect(mockChromeWindowsGet).not.toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 100));
			expect(unsuspendTabMock).not.toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should only affect tabs in the same window', async () => {
			const tab = {
				id: 1,
				url: 'chrome-extension://test/park.html?tabId=1',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, windowId: 1, groupId: 10, url: 'chrome-extension://test/park.html?tabId=1' },
				{ ...tab, id: 2, windowId: 1, groupId: 10, url: 'chrome-extension://test/park.html?tabId=2' }
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				// Only return tabs for the requested window
				expect(windowId).toBe(1);
				callback({ id: windowId, tabs: windowTabs });
			});

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(tab);

			// Verify chrome.windows.get was called with correct windowId
			expect(mockChromeWindowsGet).toHaveBeenCalledWith(1, { populate: true }, expect.any(Function));
		});

		it('should handle empty group (no suspended tabs)', async () => {
			const tab = {
				id: 1,
				url: 'https://active.com',
				title: 'Example',
				active: true,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: 10,
				discarded: false
			};

			const windowTabs = [
				{ ...tab, id: 1, groupId: 10, url: 'https://active1.com' },
				{ ...tab, id: 2, groupId: 10, url: 'https://active2.com' },
				{ ...tab, id: 3, groupId: 10, url: 'https://active3.com' }
			];

			mockChromeWindowsGet.mockImplementation((windowId, _options, callback) => {
				callback({ id: windowId, tabs: windowTabs });
			});

			const unsuspendTabGroup = testGlobals.unsuspendTabGroup;
			unsuspendTabGroup(tab);

			await new Promise((resolve) => setTimeout(resolve, 100));

			// No suspended tabs, so unsuspendTab should not be called
			expect(unsuspendTabMock).not.toHaveBeenCalled();
		});
	});
});
