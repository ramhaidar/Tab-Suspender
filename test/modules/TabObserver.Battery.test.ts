/**
 * TabObserver — Battery-Aware Suspension Unit Tests
 *
 * Covers TEST_CASES.md:
 *   7.1 — autoSuspendOnlyOnBatteryOnly=true, charging → no suspension
 *   7.2 — autoSuspendOnlyOnBatteryOnly=true, on battery → suspension works
 *   7.3 — enableSuspendOnlyIfBattLvlLessValue=true, batteryLevel ≥ threshold → no suspension
 *   7.4 — enableSuspendOnlyIfBattLvlLessValue=true, batteryLevel < threshold → suspension works
 *
 * Battery state comes from the `isCharging` and `batteryLevel` globals declared in
 * background.ts and updated via BGMessageListener when the offscreen document reports
 * the battery API events. TabObserver.tick() reads them directly each tick.
 */

import '../lib/Chrome';
import '../typing/global.d';

type BatteryTestGlobals = typeof global & {
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
const testGlobals = global as BatteryTestGlobals;

const PARK_URL = 'chrome-extension://test/park.html';
const TAB_URL = 'https://example.com';

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
testGlobals.batteryLevel = 1.0; // 100%, not charging by default

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
			discardTabAfterSuspendWithTimeout: false,
			discardTimeoutFactor: 0.05,
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

function makeTab(overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab {
	return {
		id: 10,
		url: TAB_URL,
		title: 'Test Tab',
		active: false,
		audible: false,
		status: 'complete',
		windowId: 1,
		index: 0,
		pinned: false,
		groupId: -1,
		discarded: false,
		favIconUrl: 'https://example.com/favicon.ico',
		highlighted: false,
		incognito: false,
		selected: true,
		autoDiscardable: true,
		...overrides
	} as chrome.tabs.Tab;
}

type BatteryTabInfo = { time: number };
type BatteryTabManager = {
	getTabInfoOrCreate: (tab: chrome.tabs.Tab) => BatteryTabInfo;
	getTabInfoById: (tabId: number) => BatteryTabInfo | undefined;
};
type BatteryTabManagerConstructor = new () => BatteryTabManager;
type BatteryTabObserver = { tick: () => Promise<void> };
type BatteryTabObserverConstructor = new (manager: BatteryTabManager) => BatteryTabObserver;

describe('TabObserver — Battery-Aware Suspension', () => {
	let tabManager: BatteryTabManager;
	let tabObserver: BatteryTabObserver;
	let TabObserverClass: BatteryTabObserverConstructor;
	let TabManagerClass: BatteryTabManagerConstructor;

	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();

		settingsOverrides = {};
		testGlobals.parkTab = jest.fn().mockResolvedValue(undefined);
		testGlobals.pauseTics = 0;
		testGlobals.pauseTicsStartedFrom = 0;
		testGlobals.isCharging = false;
		testGlobals.batteryLevel = 1.0;

		(testGlobals.Date.now as jest.Mock).mockReturnValue(1640995200000);

		const { TabInfo } = require('../../modules/model/TabInfo');
		testGlobals.TabInfo = TabInfo;

		const { TabManager } = require('../../modules/TabManager');
		testGlobals.TabManager = TabManagerClass = TabManager;

		require('../../modules/TabObserver');
		TabObserverClass = testGlobals.TabObserver as BatteryTabObserverConstructor;
		tabManager = new TabManagerClass();
	});

	type BatteryMockWindow = Pick<chrome.windows.Window, 'id' | 'focused' | 'tabs'>;

	function setWindowTab(tab: chrome.tabs.Tab) {
		(testGlobals.chrome.windows.getAll as jest.Mock).mockImplementation(
			(_options: chrome.windows.QueryOptions, callback: (windows: BatteryMockWindow[]) => void) =>
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

	// ══════════════════════════════════════════════════════════════════════════
	// 7.1 — autoSuspendOnlyOnBatteryOnly=true, charging → no suspension
	// ══════════════════════════════════════════════════════════════════════════
	describe('7.1 — autoSuspendOnlyOnBatteryOnly=true while charging: no suspension', () => {
		it('does NOT suspend when charging even after timeout is reached', async () => {
			settingsOverrides.autoSuspendOnlyOnBatteryOnly = true;
			testGlobals.isCharging = true;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			// 4 ticks × 10 s = 40 s > 30 s timeout; charging blocks suspension
			await runTicks(4);

			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});

		it('does NOT suspend at any tick count while charging', async () => {
			settingsOverrides.autoSuspendOnlyOnBatteryOnly = true;
			testGlobals.isCharging = true;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			// Run many ticks — time accumulates but suspension gate is blocked
			await runTicks(10);

			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});

		it('sanity: same setting with isCharging=false DOES suspend', async () => {
			settingsOverrides.autoSuspendOnlyOnBatteryOnly = true;
			testGlobals.isCharging = false;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }), tab.id);
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 7.2 — autoSuspendOnlyOnBatteryOnly=true, on battery → suspension works
	// ══════════════════════════════════════════════════════════════════════════
	describe('7.2 — autoSuspendOnlyOnBatteryOnly=true on battery: suspension works', () => {
		it('suspends when on battery (isCharging=false) after timeout', async () => {
			settingsOverrides.autoSuspendOnlyOnBatteryOnly = true;
			testGlobals.isCharging = false;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }), tab.id);
		});

		it('autoSuspendOnlyOnBatteryOnly=false: suspends regardless of charging state', async () => {
			settingsOverrides.autoSuspendOnlyOnBatteryOnly = false;
			testGlobals.isCharging = true; // charging, but setting is off

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// Setting is false → charging state irrelevant → still suspends
			expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }), tab.id);
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 7.3 — enableSuspendOnlyIfBattLvlLessValue=true, level ≥ threshold → no suspend
	// ══════════════════════════════════════════════════════════════════════════
	describe('7.3 — Battery level above threshold: no suspension', () => {
		it('does NOT suspend when batteryLevel >= battLvlLessValue / 100', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = true;
			settingsOverrides.battLvlLessValue = 50; // 50% threshold
			testGlobals.batteryLevel = 0.8; // 80% — above threshold
			testGlobals.isCharging = false; // not charging, so only batt level blocks

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// batteryLevel (0.8) >= battLvlLessValue/100 (0.5) → gate is closed
			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});

		it('does NOT suspend when battery level equals the threshold exactly', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = true;
			settingsOverrides.battLvlLessValue = 50; // 50%
			testGlobals.batteryLevel = 0.5; // exactly 50% (not strictly less than)
			testGlobals.isCharging = false;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// batteryLevel (0.5) < battLvlLessValue/100 (0.5) → false → no suspension
			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});

		it('does NOT suspend when batteryLevel is unknown (<0): disables level check, but still no suspend when charging', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = true;
			settingsOverrides.battLvlLessValue = 50;
			// batteryLevel < 0 forces enableSuspendOnlyIfBattLvlLessValue=false at line 83-84
			// That means the level gate is disabled → suspension proceeds IF charging allows.
			// With isCharging=true (charging), autoSuspendOnlyOnBattery is irrelevant but the
			// enableSuspendOnly gate is now off, so suspension depends on autoSuspendOnlyOnBatteryOnly.
			testGlobals.batteryLevel = -1.0; // unknown
			testGlobals.isCharging = true; // charging prevents suspension if autoSuspendOnlyOnBatteryOnly=true

			settingsOverrides.autoSuspendOnlyOnBatteryOnly = true;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// autoSuspendOnlyOnBatteryOnly=true + isCharging=true → outer gate blocks
			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});
	});

	// ══════════════════════════════════════════════════════════════════════════
	// 7.4 — enableSuspendOnlyIfBattLvlLessValue=true, level < threshold → suspension
	// ══════════════════════════════════════════════════════════════════════════
	describe('7.4 — Battery level below threshold: suspension works', () => {
		it('suspends when batteryLevel < battLvlLessValue / 100 and not charging', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = true;
			settingsOverrides.battLvlLessValue = 50; // 50% threshold
			testGlobals.batteryLevel = 0.3; // 30% — below threshold
			testGlobals.isCharging = false; // not charging

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// batteryLevel (0.3) < 0.5 AND !isCharging → suspension allowed
			expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }), tab.id);
		});

		it('does NOT suspend if batteryLevel < threshold BUT isCharging=true', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = true;
			settingsOverrides.battLvlLessValue = 50;
			testGlobals.batteryLevel = 0.2; // 20% — below threshold
			testGlobals.isCharging = true; // charging → inner gate blocks (batteryLevel ... && !isCharging)

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// batteryLevel (0.2) < 0.5 but isCharging=true → !isCharging=false → gate fails
			expect(testGlobals.parkTab).not.toHaveBeenCalled();
		});

		it('enableSuspendOnlyIfBattLvlLessValue=false: suspends regardless of battery level', async () => {
			settingsOverrides.enableSuspendOnlyIfBattLvlLessValue = false;
			settingsOverrides.battLvlLessValue = 50;
			testGlobals.batteryLevel = 0.9; // high battery
			testGlobals.isCharging = false;

			const tab = makeTab({ active: false });
			setWindowTab(tab);
			tabObserver = new TabObserverClass(tabManager);

			await runTicks(4);

			// Setting is false → gate passes regardless of battery level
			expect(testGlobals.parkTab).toHaveBeenCalledWith(expect.objectContaining({ id: tab.id }), tab.id);
		});
	});
});
