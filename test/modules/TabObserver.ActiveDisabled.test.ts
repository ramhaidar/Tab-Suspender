// Test: auto-suspension is fully disabled when settings.active = false
import '../lib/Chrome';
import '../typing/global.d';

type ActiveDisabledTabManager = {
	getTabInfoById: (id: number) => { time: number } | undefined;
};
type ActiveDisabledTabObserver = { tick: (stateOnly: boolean) => Promise<void> };
type ActiveDisabledTabManagerConstructor = new () => ActiveDisabledTabManager;
type ActiveDisabledTabObserverConstructor = new (tabManager: ActiveDisabledTabManager) => ActiveDisabledTabObserver;
type ActiveDisabledTestGlobals = typeof global & {
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
const testGlobals = global as ActiveDisabledTestGlobals;

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
testGlobals.parkTab = jest.fn();

let mockActiveValue = true;

testGlobals.settings = {
	get: jest.fn((key: string) => {
		const defaults: Record<string, unknown> = {
			active: mockActiveValue,
			timeout: 30, // very short timeout: 30 sec
			pinned: false,
			isCloseTabsOn: false,
			ignoreAudible: false,
			animateTabIconSuspendTimeout: false,
			autoSuspendOnlyOnBatteryOnly: false,
			discardTabAfterSuspendWithTimeout: false,
			enableSuspendOnlyIfBattLvlLessValue: false,
			adaptiveSuspendTimeout: false,
			ignoreCloseGroupedTabs: false,
			ignoreSuspendGroupedTabs: false,
			discardTimeoutFactor: 0.05,
			battLvlLessValue: 50
		};
		return Promise.resolve(key in defaults ? defaults[key] : false);
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

const inactiveTab = {
	id: 10,
	url: 'https://example.com',
	title: 'Some Tab',
	active: false,
	audible: false,
	status: 'complete',
	windowId: 1,
	index: 0,
	pinned: false,
	groupId: -1,
	discarded: false,
	favIconUrl: 'https://example.com/favicon.ico'
};

describe('TabObserver - active: false disables auto-suspension', () => {
	let tabManager: ActiveDisabledTabManager;
	let tabObserver: ActiveDisabledTabObserver;
	let TabObserverClass: ActiveDisabledTabObserverConstructor;
	let TabManager: ActiveDisabledTabManagerConstructor;
	let TabInfo: unknown;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
		mockActiveValue = true;
		testGlobals.parkTab = jest.fn();
		testGlobals.pauseTics = 0;

		(testGlobals.Date.now as jest.Mock).mockReturnValue(1640995200000);

		const TabInfoModule = require('../../modules/model/TabInfo');
		TabInfo = TabInfoModule.TabInfo;
		testGlobals.TabInfo = TabInfo;

		const TabManagerModule = require('../../modules/TabManager');
		TabManager = TabManagerModule.TabManager;
		testGlobals.TabManager = TabManager;

		require('../../modules/TabObserver');
		TabObserverClass = testGlobals.TabObserver as ActiveDisabledTabObserverConstructor;

		tabManager = new TabManager();

		const getAllMock = testGlobals.chrome.windows.getAll as jest.Mock;
		getAllMock.mockImplementation((_options: chrome.windows.QueryOptions, callback: (windows: chrome.windows.Window[]) => void) => {
			callback([{ id: 1, focused: true, tabs: [inactiveTab] } as chrome.windows.Window]);
		});
	});

	it('should suspend tab when active=true and time >= timeout (baseline)', async () => {
		mockActiveValue = true;
		tabObserver = new TabObserverClass(tabManager);

		// 4 ticks × 10s = 40s > 30s timeout → suspension expected
		for (let i = 0; i < 4; i++) {
			await tabObserver.tick(false);
		}

		expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: inactiveTab.id }), inactiveTab.id);
	});

	it('should NOT suspend tab when active=false, even if time exceeds timeout', async () => {
		mockActiveValue = false;
		tabObserver = new TabObserverClass(tabManager);

		// Same 4 ticks — but active=false must prevent suspension
		for (let i = 0; i < 4; i++) {
			await tabObserver.tick(false);
		}

		expect(testGlobals.parkTab).not.toHaveBeenCalled();
	});

	it('should stop suspending immediately when active switches from true to false mid-session', async () => {
		mockActiveValue = true;
		tabObserver = new TabObserverClass(tabManager);

		// 2 ticks × 10s = 20s — time accumulates but stays below the 30s threshold
		for (let i = 0; i < 2; i++) {
			await tabObserver.tick(false);
		}

		// Disable auto-suspension before threshold is reached
		mockActiveValue = false;
		testGlobals.parkTab.mockClear();

		// Run many more ticks — even though accumulated time would exceed timeout,
		// active=false must prevent any suspension
		for (let i = 0; i < 10; i++) {
			await tabObserver.tick(false);
		}

		expect(testGlobals.parkTab).not.toHaveBeenCalled();
	});

	it('should NOT accumulate tab time when active=false', async () => {
		mockActiveValue = false;
		tabObserver = new TabObserverClass(tabManager);

		for (let i = 0; i < 10; i++) {
			await tabObserver.tick(false);
		}

		const tabInfo = tabManager.getTabInfoById(inactiveTab.id);
		// With active=false, tick() returns early, so time must stay at 0
		expect(tabInfo == null || tabInfo.time === 0).toBe(true);
	});
});
