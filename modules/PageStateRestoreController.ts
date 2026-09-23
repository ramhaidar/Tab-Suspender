/*
 * Copyright (c) 2017 Sergey Zadorozhniy. The content presented herein may not, under any circumstances,
 * be reproduced in whole or in any part or form without written permission from Sergey Zadorozhniy.
 * Zadorozhniy.Sergey@gmail.com
 */

interface FormRestoreInfo {
	formData: string;
	url: string;
}

/**
 *
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class PageStateRestoreController {
	private TIMEOUT = 7000;
	private tabMap = {}; /* Key - actualTabId, Value - {timestamp: expectedTime, storedAsTabId: storedTabId, url: url} */

	constructor() {
		setInterval(this.cleanup, 60000);
	}

	/**
	 *
	 */
	async getFormRestoreDataAndRemove(actualTabId) {
		const targetMapEntry = this.getTargetMapEntry(actualTabId);
		if (targetMapEntry == null) return null;

		//void LocalStore.remove(key);

		const storedTabIdInt = parseInt(targetMapEntry.storedAsTabId, 10);

		return new Promise<FormRestoreInfo>((resolve, _reject) => {
			(globalThis as typeof globalThis & { database: typeof DBProvider.prototype }).database.queryIndex(
				{
					IDB: {
						table: FD_DB_NAME
					},
					params: [storedTabIdInt]
				},
				(fields) => {
					if (fields == null) {
						console.warn(`FD Fields list from BD is null, storedTabIdInt: ${storedTabIdInt}`);
						resolve(null);
						return;
					}

					if (debugScreenCache) console.log('getScreen result: ', Date.now());

					void this.deleteDataRecord(actualTabId);

					resolve({ formData: fields.data, url: targetMapEntry.url });
				}
			);
		});
	}

	async deleteDataRecord(tabId: number) {
		(globalThis as typeof globalThis & { database: typeof DBProvider.prototype }).database.executeDelete({
			IDB: {
				table: FD_DB_NAME,
				params: [tabId],
				ignoreNotFound: true
			}
		});
	}

	/**
	 *
	 */
	getTargetMapEntry(actualTabId) {
		const tabMapEntry = this.tabMap[actualTabId];
		if (tabMapEntry != null) {
			if (this.isTabMapEntryOutdated(tabMapEntry)) return null;
			else return tabMapEntry;
		}
	}

	/**
	 *
	 */
	async collectPageState(tabId: number) {
		let finished = false;
		return new Promise<{ videoTime?: number }>((resolve) => {
			chrome.tabs.sendMessage(tabId, { method: '[AutomaticTabCleaner:CollectPageState]' }, (response /*{ formData, videoTime }*/) => {
				if (debug) console.log('FData: ', response.formData);

				if (response.formData && Object.keys(response.formData).length !== 0 && response.formData.constructor === Object) {
					/* !TODO-v3: Make auto cleanup Important!
							Also cleanup old created keys in old localStorage - to free up user space
					 */

					const data = {
						tabId: tabId,
						data: response.formData
					};

					(globalThis as typeof globalThis & { database: typeof DBProvider.prototype }).database.putV2([
						{
							IDB: {
								table: FD_DB_NAME,
								data: data
							}
						}
					]);
				}

				finished = true;
				resolve({ videoTime: response.videoTime });
			});

			setTimeout(() => {
				if (!finished) resolve({});
			}, 500);
		});
	}

	/**
	 *
	 */
	expectRestore(actualTabId, storedAsTabId, url) {
		if (actualTabId != null && storedAsTabId != null)
			this.tabMap[actualTabId] = { timestamp: Date.now(), storedAsTabId: storedAsTabId, url: url };
	}

	/**
	 *
	 */
	cleanup() {
		for (const key in this.tabMap)
			if (Object.hasOwn(this.tabMap, key)) if (this.isTabMapEntryOutdated(this.tabMap[key])) delete this.tabMap[key];
	}

	/**
	 *
	 */
	isTabMapEntryOutdated(tabMapEntry) {
		return Date.now() - tabMapEntry.timestamp > this.TIMEOUT;
	}
}

(globalThis as typeof globalThis & { PageStateRestoreController: typeof PageStateRestoreController }).PageStateRestoreController =
	PageStateRestoreController;
