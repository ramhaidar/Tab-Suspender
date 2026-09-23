/**
 * TabObserver — Favicon Retry Unit Tests
 *
 * Covers TEST_CASES.md section 4:
 *   4.9 — Favicon retry (up to 2 times with 100 ms delay) when favIconUrl is
 *          empty on a parked (suspended) tab
 *
 * Key implementation path (TabObserver.ts ~280–294):
 *
 *   if (isTabParked) {
 *       tabInfo.discarded = tab.discarded;
 *       if ((tab.favIconUrl == null || tab.favIconUrl === '') && tabInfo.refreshIconRetries < 2) {
 *           tabInfo.refreshIconRetries = tabInfo.refreshIconRetries + 1;
 *           const tmpFunction = function(id, discard, index) {
 *               setTimeout(function() {
 *                   chrome.tabs.reload(id, function() {
 *                       if (discard)
 *                           setTimeout(function() { discardTab(id); }, 2000);
 *                   });
 *               }, 100 * index);
 *           };
 *           tmpFunction(tabId, tabInfo.discarded, refreshIconIndex++);
 *       }
 *   }
 *
 * Notes:
 *   - refreshIconRetries starts at 0 and is capped at < 2 (max 2 reloads total)
 *   - refreshIconIndex is a local variable per tick, starts at 0, increments per retry tab
 *   - Delay = 100 * index — the first retry call in a given tick uses index=0 → delay=0
 *   - jest.useFakeTimers() is used to control setTimeout without real waiting
 */

import '../lib/Chrome';
import '../typing/global.d';

type FaviconRetryTestGlobals = typeof global & {
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
	pauseTicsStartedFrom: number;
	isCharging: boolean;
	batteryLevel: number;
	parseUrlParam: jest.Mock;
	extractHostname: jest.Mock;
	discardTab: jest.Mock;
	markForUnsuspend: jest.Mock;
	isTabMarkedForUnsuspend: jest.Mock;
	closeTab: jest.Mock;
	parkTab: jest.Mock;
	settings: { get: jest.Mock };
	whiteList: { isURIException: jest.Mock };
	ignoreList: { isTabInIgnoreTabList: jest.Mock };
	tabCapture: { captureTab: jest.Mock; injectJS: jest.Mock };
	ContextMenuController: { menuIdMap: Record<string, number> };
	ScreenshotController: { getScreen: jest.Mock };
	BrowserActionControl: unknown;
	HistoryOpenerController: unknown;
	TabInfo: unknown;
	TabManager: unknown;
	TabObserver: unknown;
};
const testGlobals = global as FaviconRetryTestGlobals;

const PARK_URL = 'chrome-extension://test/park.html';
const PARKED_URL = `${PARK_URL}?tabId=42&url=https%3A%2F%2Fexample.com&sessionId=123456`;

// ─── Globals ─────────────────────────────────────────────────────────────────

testGlobals.sessionsPageUrl = 'chrome-extension://test/sessions.html';
testGlobals.wizardPageUrl = 'chrome-extension://test/wizard_background.html';
testGlobals.historyPageUrl = 'chrome-extension://test/history.html';
testGlobals.parkUrl = PARK_URL;
testGlobals.publicExtensionUrl = PARK_URL;
testGlobals.trace = false;
testGlobals.debug = false;
testGlobals.debugTabsInfo = false;
testGlobals.debugScreenCache = false;
testGlobals.TSSessionId = 123456;
testGlobals.getScreenCache = null;
testGlobals.pauseTics = 0;
testGlobals.pauseTicsStartedFrom = 0;
testGlobals.isCharging = false;
testGlobals.batteryLevel = 1.0;

testGlobals.parseUrlParam = jest.fn((url: string, param: string) => {
	try {
		return new URL(url).searchParams.get(param);
	} catch {
		return null;
	}
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
testGlobals.isTabMarkedForUnsuspend = jest.fn().mockReturnValue(false);
testGlobals.closeTab = jest.fn();
testGlobals.parkTab = jest.fn().mockResolvedValue(undefined);

// Per-test settings overrides
let settingsOverrides: Record<string, unknown> = {};

testGlobals.settings = {
	get: jest.fn((key: string) => {
		const defaults: Record<string, unknown> = {
			active: true,
			timeout: 30,
			pinned: false,
			isCloseTabsOn: false,
			limitOfOpenedTabs: 20,
			closeTimeout: 3600,
			ignoreAudible: false,
			animateTabIconSuspendTimeout: false,
			autoSuspendOnlyOnBatteryOnly: false,
			// Discard off by default in favicon tests so it doesn't interfere
			discardTabAfterSuspendWithTimeout: false,
			discardTimeoutFactor: 1,
			enableSuspendOnlyIfBattLvlLessValue: false,
			battLvlLessValue: 50,
			adaptiveSuspendTimeout: false,
			ignoreCloseGroupedTabs: false,
			ignoreSuspendGroupedTabs: false
		};
		const value = key in settingsOverrides ? settingsOverrides[key] : key in defaults ? defaults[key] : false;
		return Promise.resolve(value);
	})
};

testGlobals.whiteList = { isURIException: jest.fn().mockReturnValue(false) };
testGlobals.ignoreList = { isTabInIgnoreTabList: jest.fn().mockReturnValue(false) };
testGlobals.tabCapture = { captureTab: jest.fn(), injectJS: jest.fn() };
testGlobals.ContextMenuController = { menuIdMap: {} };
testGlobals.ScreenshotController = { getScreen: jest.fn() };

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
testGlobals.BrowserActionControl = BrowserActionControl;
testGlobals.HistoryOpenerController = HistoryOpenerController;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeParkedTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
	return {
		id: 42,
		url: PARKED_URL,
		title: 'Parked Tab',
		active: false,
		audible: false,
		status: 'complete',
		windowId: 1,
		index: 0,
		pinned: false,
		groupId: -1,
		discarded: false,
		// Default: empty favIconUrl (the triggering condition)
		favIconUrl: '',
		highlighted: false,
		incognito: false,
		selected: false,
		autoDiscardable: true,
		...overrides
	} as chrome.tabs.Tab;
}

// ─── Suite ───────────────────────────────────────────────────────────────────

type FaviconTabManager = { getTabInfoById: (tabId: number) => { refreshIconRetries: number } | undefined };
type FaviconTabManagerConstructor = new () => FaviconTabManager;
type FaviconTabObserver = { tick: () => Promise<void> };
type FaviconTabObserverConstructor = new (manager: FaviconTabManager) => FaviconTabObserver;

describe('TabObserver — Favicon Retry for Parked Tabs', () => {
	let tabManager: FaviconTabManager;
	let tabObserver: FaviconTabObserver;
	let TabObserverClass: FaviconTabObserverConstructor;
	let TabManagerClass: FaviconTabManagerConstructor;

	let currentTab: chrome.tabs.Tab;

	type FaviconRetryMockWindow = Pick<chrome.windows.Window, 'id' | 'focused' | 'tabs'>;

	function setWindowTab(tab: chrome.tabs.Tab) {
		(testGlobals.chrome.windows.getAll as jest.Mock).mockImplementation(
			(_options: chrome.windows.QueryOptions, callback: (windows: FaviconRetryMockWindow[]) => void) =>
				callback([{ id: 1, focused: true, tabs: [tab] }])
		);
	}

	async function runTicks(n: number) {
		for (let i = 0; i < n; i++) {
			await tabObserver.tick();
			await Promise.resolve();
			await Promise.resolve();
		}
	}

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		// Spy on Date.now BEFORE enabling fake timers (useFakeTimers replaces Date.now
		// with its own implementation, making the spy's mockReturnValue ineffective).
		// Instead we just use the real Date.now value — exact timestamp is irrelevant
		// for favicon-retry tests, which only care about tick counts and setTimeout calls.

		jest.useFakeTimers();

		settingsOverrides = {};
		testGlobals.discardTab = jest.fn();
		testGlobals.isTabMarkedForUnsuspend = jest.fn().mockReturnValue(false);
		testGlobals.parkTab = jest.fn().mockResolvedValue(undefined);
		testGlobals.pauseTics = 0;
		testGlobals.pauseTicsStartedFrom = 0;

		const { TabInfo } = require('../../modules/model/TabInfo');
		testGlobals.TabInfo = TabInfo;

		const { TabManager } = require('../../modules/TabManager');
		testGlobals.TabManager = TabManagerClass = TabManager;

		require('../../modules/TabObserver');
		TabObserverClass = testGlobals.TabObserver as FaviconTabObserverConstructor;

		tabManager = new TabManagerClass();

		// Override chrome.tabs.reload to invoke the callback so the inner reload
		// logic (discardTab after reload) can execute if tested
		testGlobals.chrome.tabs.reload = jest.fn().mockImplementation((_id: number, cb?: () => void) => {
			if (cb) cb();
		});

		currentTab = makeParkedTab({ favIconUrl: '' });
		setWindowTab(currentTab);
		tabObserver = new TabObserverClass(tabManager);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	// Helper: advance only the favicon-retry timers (delay ≤ 100 ms per index,
	// plus the 2000 ms post-reload discard timer). We use 3000 ms which is safely
	// below the TabManager/TabObserver setIntervals (both at 10 000 ms) so we
	// avoid triggering an infinite-timer loop inside jest.runAllTimers().
	function advanceFaviconTimers() {
		jest.advanceTimersByTime(3000);
	}

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.1 — Empty favIconUrl triggers reload after setTimeout
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.1 — Empty favIconUrl triggers chrome.tabs.reload', () => {
		it('calls chrome.tabs.reload after tick when favIconUrl is empty string', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(1);
			// refreshIconIndex starts at 0 → timeout = 100 * 0 = 0 ms
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledWith(currentTab.id, expect.any(Function));
		});

		it('calls chrome.tabs.reload after tick when favIconUrl is null/undefined', async () => {
			currentTab = makeParkedTab({ favIconUrl: undefined });
			setWindowTab(currentTab);

			await runTicks(1);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledWith(currentTab.id, expect.any(Function));
		});

		it('calls chrome.tabs.reload with the correct tab id', async () => {
			const TAB_ID = 77;
			const parkedUrl = `${PARK_URL}?tabId=${TAB_ID}&url=https%3A%2F%2Fexample.com&sessionId=123456`;
			currentTab = makeParkedTab({ id: TAB_ID, url: parkedUrl, favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(1);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledWith(TAB_ID, expect.any(Function));
		});

		it('schedules reload inside a setTimeout (not called synchronously)', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(1);

			// Before advancing timers: reload must NOT have been called yet
			expect(testGlobals.chrome.tabs.reload).not.toHaveBeenCalled();

			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalled();
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.2 — Non-empty favIconUrl does NOT trigger reload
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.2 — Non-empty favIconUrl does NOT trigger reload', () => {
		it('does NOT call chrome.tabs.reload when favIconUrl is a valid URL', async () => {
			currentTab = makeParkedTab({ favIconUrl: 'https://example.com/favicon.ico' });
			setWindowTab(currentTab);

			await runTicks(3);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).not.toHaveBeenCalled();
		});

		it('does NOT call chrome.tabs.reload when favIconUrl is a data URI', async () => {
			currentTab = makeParkedTab({ favIconUrl: 'data:image/png;base64,abc123' });
			setWindowTab(currentTab);

			await runTicks(3);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).not.toHaveBeenCalled();
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.3 — refreshIconRetries cap at 2
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.3 — Retry cap: at most 2 reloads total (refreshIconRetries < 2)', () => {
		it('calls chrome.tabs.reload at most 2 times across multiple ticks', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			// 3 ticks with empty favIconUrl — guard refreshIconRetries < 2 caps at 2 calls
			await runTicks(3);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledTimes(2);
		});

		it('does NOT call chrome.tabs.reload on the 3rd tick once retry cap is reached', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(2);
			advanceFaviconTimers();
			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledTimes(2);

			(testGlobals.chrome.tabs.reload as jest.Mock).mockClear();

			// 3rd and beyond ticks must not trigger another reload
			await runTicks(2);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).not.toHaveBeenCalled();
		});

		it('calls chrome.tabs.reload exactly once on the first tick with empty icon', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(1);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).toHaveBeenCalledTimes(1);
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.4 — refreshIconRetries counter increments correctly
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.4 — refreshIconRetries counter is incremented correctly', () => {
		it('refreshIconRetries is 1 after the first tick with empty favIconUrl', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(1);

			const tabInfo = tabManager.getTabInfoById(currentTab.id);
			expect(tabInfo?.refreshIconRetries).toBe(1);
		});

		it('refreshIconRetries is 2 after two ticks with empty favIconUrl', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(2);

			const tabInfo = tabManager.getTabInfoById(currentTab.id);
			expect(tabInfo?.refreshIconRetries).toBe(2);
		});

		it('refreshIconRetries does NOT exceed 2 even after many ticks', async () => {
			currentTab = makeParkedTab({ favIconUrl: '' });
			setWindowTab(currentTab);

			await runTicks(10);

			const tabInfo = tabManager.getTabInfoById(currentTab.id);
			expect(tabInfo?.refreshIconRetries).toBe(2);
		});

		it('refreshIconRetries is 0 for a parked tab with a valid favIconUrl', async () => {
			currentTab = makeParkedTab({ favIconUrl: 'https://example.com/favicon.ico' });
			setWindowTab(currentTab);

			await runTicks(3);

			const tabInfo = tabManager.getTabInfoById(currentTab.id);
			// No empty icon → no retry → counter stays 0
			expect(tabInfo?.refreshIconRetries).toBe(0);
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.5 — Reload triggers discardTab when tab.discarded=true
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.5 — After reload, discardTab is called if tab was already discarded', () => {
		it('calls discardTab after reload callback when tab.discarded=true', async () => {
			// Tab is already discarded (Chrome may discard it independently)
			currentTab = makeParkedTab({ favIconUrl: '', discarded: true });
			setWindowTab(currentTab);

			await runTicks(1);
			// Advance timers: first setTimeout fires → reload → callback → second setTimeout
			advanceFaviconTimers();

			expect(testGlobals.discardTab).toHaveBeenCalledWith(currentTab.id);
		});

		it('does NOT call discardTab after reload when tab.discarded=false', async () => {
			currentTab = makeParkedTab({ favIconUrl: '', discarded: false });
			setWindowTab(currentTab);

			await runTicks(1);
			advanceFaviconTimers();

			// discardTab may still be called from the auto-discard path if
			// discardTabAfterSuspendWithTimeout is on; here it's off (settingsOverrides default)
			// so the only path is the post-reload discard. Tab is not discarded → not called.
			expect(testGlobals.discardTab).not.toHaveBeenCalled();
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 4.9.6 — Favicon retry only fires for parked tabs (park URL prefix check)
	// ══════════════════════════════════════════════════════════════════════════
	describe('4.9.6 — Favicon retry only applies to parked tabs', () => {
		it('does NOT call chrome.tabs.reload for a non-parked tab with empty favIconUrl', async () => {
			const normalTab = {
				id: 55,
				url: 'https://example.com', // Not a park URL
				title: 'Normal Tab',
				active: false,
				audible: false,
				status: 'complete',
				windowId: 1,
				index: 0,
				pinned: false,
				groupId: -1,
				discarded: false,
				favIconUrl: '', // Empty favicon
				highlighted: false,
				incognito: false,
				selected: false,
				autoDiscardable: true
			} as chrome.tabs.Tab;

			setWindowTab(normalTab);

			await runTicks(3);
			advanceFaviconTimers();

			expect(testGlobals.chrome.tabs.reload).not.toHaveBeenCalled();
		});
	});
});
