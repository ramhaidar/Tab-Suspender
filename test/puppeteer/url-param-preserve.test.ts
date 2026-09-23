/**
 * Tab Suspender — URL Parameter Preservation E2E Test
 *
 * Covers test case 2.9:
 *   2.9 — Query parameters in the original URL (e.g. ?t=120 for YouTube timestamps)
 *         are preserved after a suspend/restore cycle.
 *
 * Mechanism in TabParkController.ts:
 *   url += '&url=' + encodeURIComponent(tab.url)
 *   The entire original URL (including query params) is stored verbatim via encodeURIComponent,
 *   so ?t=120 is preserved trivially — no special handling needed.
 *
 * Run:
 *   cd test/puppeteer && pnpm exec tsx url-param-preserve.test.ts
 */

import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { launchBrowser, sleep, log } from './base/BrowserHelper.js';
import {
	getExtensionId,
	suspendTabById,
	unsuspendTabById,
	waitForParkPages,
	queryChromeTabs,
	waitForTabToRestore,
	waitForAnyTabToLeaveParked,
	waitForExtensionInit,
	parkUrlPrefix
} from './base/ExtensionHelper.js';
import { createTestRunner } from './base/AssertHelper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = path.join(__dirname, 'test-session', '.test-session-url-params');

function startHttpServer(): Promise<{ server: http.Server; baseUrl: string }> {
	return new Promise((resolve, reject) => {
		const server = http.createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
			res.end(`<html><head><title>URL Params Test</title></head><body>URL: ${req.url}</body></html>`);
		});
		server.listen(0, '127.0.0.1', () => {
			const addr = server.address() as { port: number };
			resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
		});
		server.on('error', reject);
	});
}

async function main(): Promise<void> {
	log('Tab Suspender — URL Parameter Preservation (test case 2.9)');
	log(`Session dir: ${SESSION_DIR}`);

	const runner = createTestRunner();

	if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true });
	fs.mkdirSync(SESSION_DIR, { recursive: true });

	const { server, baseUrl } = await startHttpServer();
	log(`HTTP server: ${baseUrl}`);

	const browser = await launchBrowser(SESSION_DIR);
	log('Browser launched');

	try {
		const extensionId = await getExtensionId(browser);
		log(`Extension ID: ${extensionId}`);

		await waitForExtensionInit(browser);

		// ══════════════════════════════════════════════════════════════════════════
		//  PHASE A — Simple query param (?t=120) preserved after suspend/restore
		// ══════════════════════════════════════════════════════════════════════════
		runner.section('Phase A — ?t=120 (YouTube-style timestamp) preserved after restore');

		const timestampUrl = `${baseUrl}/watch?t=120`;
		log(`  Opening: ${timestampUrl}`);

		const targetPage = await browser.newPage();
		await targetPage.goto(timestampUrl, { waitUntil: 'load', timeout: 10000 });
		await sleep(1000);

		const tabs = await queryChromeTabs(browser);
		const targetTab = tabs.find((t) => t.url?.includes('?t=120'));
		runner.assert(targetTab != null, `tab opened with ?t=120 URL (got tabs: ${tabs.map((t) => t.url).join(', ')})`);
		if (targetTab == null) throw new Error('Tab with ?t=120 URL was not found');
		log(`  Tab id=${targetTab.id} url=${targetTab.url}`);

		// Focus away so target tab becomes inactive
		const blankPage = await browser.newPage();
		await blankPage.goto('about:blank');
		await sleep(300);

		log(`  Suspending tab ${targetTab?.id}...`);
		await suspendTabById(browser, targetTab.id);
		await waitForParkPages(browser, extensionId, 1, 15000);
		await sleep(600); // give park.html time to register its chrome.runtime.onMessage listener
		log('  park.html appeared');

		// Verify the park URL encodes the original URL including ?t=120
		const allTabs = await queryChromeTabs(browser);
		const parkTab = allTabs.find((t) => t.url?.startsWith(parkUrlPrefix(extensionId)));
		runner.assert(parkTab != null, 'park tab found');
		if (parkTab == null) throw new Error('Park tab was not found');

		const encodedInPark = parkTab?.url?.includes(encodeURIComponent('?t=120'));
		runner.assert(!!encodedInPark, `park URL contains encoded ?t=120 (park URL: ${parkTab?.url?.slice(0, 120)})`);

		// Restore the tab
		log(`  Restoring tab ${parkTab?.id}...`);
		await unsuspendTabById(browser, parkTab.id);

		const restoredUrl = await waitForAnyTabToLeaveParked(browser, extensionId, '127.0.0.1', 20000).catch(() =>
			waitForTabToRestore(browser, parkTab.id, 20000).catch(() => null)
		);

		runner.assert(restoredUrl?.includes('?t=120') === true, `Restored URL contains ?t=120 (got: ${restoredUrl})`);

		log(`  Restored URL: ${restoredUrl}`);
		await blankPage.close().catch(() => {});

		await sleep(500);

		// ══════════════════════════════════════════════════════════════════════════
		//  PHASE B — Multiple query params preserved
		// ══════════════════════════════════════════════════════════════════════════
		runner.section('Phase B — Multiple query params preserved after restore');

		// Close page from Phase A
		const pagesAfterA = await browser.pages();
		for (const p of pagesAfterA) {
			if (p.url().startsWith('http://127.0.0.1')) await p.close().catch(() => {});
		}
		await sleep(300);

		const multiParamUrl = `${baseUrl}/page?a=1&b=hello&c=test%20value`;
		log(`  Opening: ${multiParamUrl}`);

		const targetPage2 = await browser.newPage();
		await targetPage2.goto(multiParamUrl, { waitUntil: 'load', timeout: 10000 });
		await sleep(1000);

		const tabs2 = await queryChromeTabs(browser);
		const targetTab2 = tabs2.find((t) => t.url?.includes('a=1') && t.url.includes('b=hello'));
		runner.assert(targetTab2 != null, 'tab with multi-param URL opened');
		if (targetTab2 == null) throw new Error('Tab with multiple query params was not found');
		log(`  Tab id=${targetTab2.id} url=${targetTab2.url}`);

		const blankPage2 = await browser.newPage();
		await blankPage2.goto('about:blank');
		await sleep(300);

		log(`  Suspending tab ${targetTab2?.id}...`);
		await suspendTabById(browser, targetTab2.id);
		await waitForParkPages(browser, extensionId, 1, 15000);
		await sleep(600); // give park.html time to register its chrome.runtime.onMessage listener
		log('  park.html appeared (Phase B)');

		const allTabs2 = await queryChromeTabs(browser);
		const parkTab2 = allTabs2.find((t) => t.url?.startsWith(parkUrlPrefix(extensionId)));
		runner.assert(parkTab2 != null, 'park tab found for Phase B');
		if (parkTab2 == null) throw new Error('Phase B park tab was not found');

		await unsuspendTabById(browser, parkTab2.id);

		const restoredUrl2 = await waitForAnyTabToLeaveParked(browser, extensionId, '127.0.0.1', 20000).catch(() =>
			waitForTabToRestore(browser, parkTab2.id, 20000).catch(() => null)
		);

		runner.assert(
			restoredUrl2?.includes('a=1') === true && restoredUrl2.includes('b=hello'),
			`Restored URL contains all query params (got: ${restoredUrl2})`
		);

		log(`  Restored URL: ${restoredUrl2}`);
		await blankPage2.close().catch(() => {});
	} finally {
		await browser.close();
		server.close();
		log('Browser closed, server stopped');
	}

	runner.summarize();
	process.exit(runner.hasFailed() ? 1 : 0);
}

main().catch((e) => {
	console.error(`\nFATAL: ${(e as Error).message}`);
	console.error((e as Error).stack);
	process.exit(1);
});
