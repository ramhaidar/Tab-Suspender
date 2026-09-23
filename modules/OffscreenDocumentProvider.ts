import Reason = chrome.offscreen.Reason;

/**
 * Manages the offscreen document lifecycle.
 *
 * IMPORTANT: The offscreen document is kept alive (not closed) after initialization
 * because it serves multiple purposes:
 * 1. Migrating localStorage data and monitoring battery status
 * 2. Keeping the MV3 service worker alive by sending periodic heartbeat messages
 *    (see offscreenDocument.ts:startServiceWorkerHeartbeat)
 * 3. Syncing suspended tabs to external backup via iframe
 *    (see offscreenDocument.ts:initBackupSync)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class OffscreenDocumentProvider {
	private readonly documentCreatedPromise: Promise<void>;

	constructor() {
		this.documentCreatedPromise = new Promise<void>((resolve) => setTimeout(resolve, 1500))
			.then(async () => {
				// Check if an offscreen document already exists
				const hasDocument = await chrome.offscreen.hasDocument();

				if (hasDocument) {
					console.log('Offscreen Document already exists, skipping creation');
					return;
				}

				console.log('Offscreen Document Creating...');
				await chrome.offscreen.createDocument({
					url: 'offscreenDocument.html',
					reasons: [Reason.LOCAL_STORAGE, Reason.BATTERY_STATUS, Reason.IFRAME_SCRIPTING],
					justification: 'Need to migrate from localStorage, monitor battery status, and sync suspended tabs backup via iframe'
				});
				console.log('Offscreen Document Created successfully');
			})
			.catch((error) => {
				console.error('Error creating offscreen document:', error);
				throw error;
			});
	}

	async extractOldSettings(settingsKeys: string[]) {
		console.log('ExtractOldSettings started...');

		await this.documentCreatedPromise;

		const localStorageData = await chrome.runtime.sendMessage({
			method: '[TS:offscreenDocument:getLocalStorageData]',
			settingsKeys
		});

		console.log('LocalStorageData: ', localStorageData);

		// DO NOT close the offscreen document - it's needed for:
		// 1. Battery status monitoring
		// 2. Service worker heartbeat (keeps the service worker alive)
		// See class documentation for details

		return localStorageData;
	}

	async cleanupFormDatas(): Promise<void> {
		console.log('CleanupFormDatas started...');

		await this.documentCreatedPromise;

		await new Promise<void>((resolve, reject) => {
			const messageListener = (message) => {
				if (message.method === '[TS:offscreenDocument:cleanupComplete]') {
					console.log(`CleanupFormDatas - Complete.`);
					// DO NOT close the offscreen document - it's needed for service worker heartbeat
					chrome.runtime.onMessage.removeListener(messageListener);
					resolve();
				}
			};

			chrome.runtime.onMessage.addListener(messageListener);

			/*await chrome.offscreen.createDocument({
				url: 'offscreenDocument.html',
				reasons: [Reason.LOCAL_STORAGE],
				justification: 'reason for needing the document'
			});*/

			chrome.runtime
				.sendMessage({
					method: '[TS:offscreenDocument:startFormDatasCleanup]'
				})
				.catch((error) => {
					chrome.runtime.onMessage.removeListener(messageListener);
					reject(error);
				});
		});
	}
}

(globalThis as typeof globalThis & { OffscreenDocumentProvider: typeof OffscreenDocumentProvider }).OffscreenDocumentProvider =
	OffscreenDocumentProvider;
