// eslint-disable-next-line @typescript-eslint/no-unused-vars
class WindowManager {
	constructor() {
		chrome.windows.onCreated.addListener(() => {
			tabObserver.settingsChanged();
		});
	}
}

(globalThis as typeof globalThis & { WindowManager: typeof WindowManager }).WindowManager = WindowManager;
