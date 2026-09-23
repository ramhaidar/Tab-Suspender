/*
 * Copyright (c) 2015 Sergey Zadorozhniy. The content presented herein may not, under any circumstances,
 * be reproduced in whole or in any part or form without written permission from Sergey Zadorozhniy.
 * Zadorozhniy.Sergey@gmail.com
 */

(() => {
	const pageSize = 30;
	const parkUrl = chrome.runtime.getURL('park.html');
	const sessionsUrl = chrome.runtime.getURL('sessions.html');
	let scrollYPosition = 0;
	const isDarkModeEnabled = isDarkMode();

	if (isDarkModeEnabled) {
		const style = `<style>
				body { background-color: #222; }
				#sessionManagerP { color: #fff; }
				.card-body { background-color: #444; }
				.card { border: 1px solid rgb(0 0 0); }
				.card-title a { color: #c1c1c1 !important; }
				.container { background-color: #222 !important; }
		</style>`;
		$('html > head').append($(style));
	}

	const drawContent = () =>
		new Promise((resolve) => {
			//chrome.runtime.getBackgroundPage(function(bgpage) {
			chrome.runtime.sendMessage({ method: '[TS:getSessionPageConfig]' }, (res) => {
				const _TSSessionId = res.TSSessionId;

				chrome.windows.getCurrent({ populate: true }, (currentWindow) => {
					chrome.windows.getAll({ populate: true }, (windows) => {
						windows = windows.filter((wind) => wind.id !== currentWindow.id);
						windows.unshift(currentWindow);

						for (const wi in windows) {
							if (Object.hasOwn(windows, wi)) {
								const tabs = [];
								for (const j in windows[wi].tabs)
									if (Object.hasOwn(windows[wi].tabs, j)) {
										const tab = windows[wi].tabs[j];
										if (tab.url.indexOf(sessionsUrl) === 0) continue;
										const parked = tab.url.indexOf(parkUrl) === 0;
										tabs.push({
											title: tab.title,
											url: parked ? parseUrlParam(tab.url, 'url') : tab.url,
											tabId: parked ? parseUrlParam(tab.url, 'tabId') : tab.id,
											sessionId: parked ? parseUrlParam(tab.url, 'sessionId') : null /*TSSessionId*/,
											nativeTabId: tab.id,
											nativeWindowId: windows[wi].id
										});
										console.log(tab.width);
									}

								const divWindow = document.createElement('div');
								divWindow.classList.add('card');
								divWindow.classList.add('card-window');
								if (parseInt(wi, 10) === 0) divWindow.classList.add('first-window');
								divWindow.innerHTML =
									`\t\t<div class="card-header" style="${isDarkModeEnabled ? 'background-color: #444;' : ''}">\n` +
									'\t\t\t<h4 class="my-0 font-weight-normal">Window #' +
									(parseInt(wi, 10) + 1) +
									' <span class="tabs-n">( ' +
									tabs.length +
									' tabs )</span>' +
									'</h4>\n' +
									'\t\t</div>\n' +
									`\t\t<div id="park${wi}Container" class="container" >\n` +
									'\t\t\t<div id="park' +
									wi +
									'Div" class="row">\n' +
									'\t\t\t</div>\n' +
									'\t\t</div>\n';

								document.getElementById('container').appendChild(divWindow);

								new DrawHistory(tabs, `park${wi}`, 0, 150);
							}
						}

						resolve();
					});
				});
			});
		});

	drawContent();

	trackErrors('history_page', true);

	setTimeout(() => {
		chrome.runtime.onMessage.addListener((request) => {
			if (request.method === '[AutomaticTabCleaner:updateSessions]') {
				console.log('updateSessions..');
				redraw();
				console.log('updateSessions..Complete.');
			}
		});
	}, 5000);

	function redraw() {
		scrollYPosition = window.scrollY;
		const container = document.getElementById('container');
		while (container.firstChild) {
			container.removeChild(container.firstChild);
		}
		drawContent().then(() => {
			console.log('scrollYPosition: ', scrollYPosition);
			window.scrollTo({ top: scrollYPosition, behavior: 'instant' });
		});
	}

	function DrawHistory(tabs, targetDiv, from, to) {
		this.drawNextPage(tabs, targetDiv, from, to);
	}

	DrawHistory.prototype.drawNextPage = function (tabs, targetDiv, from, to) {
		this.to = to;
		if (tabs) {
			for (let i = from; i < to && i < tabs.length; i++) {
				const divLine = drawPreviewTile(tabs[i], { noTime: true, close: true });

				((i, divLine) => {
					divLine.getElementsByClassName('card-img-a')[0].onclick = () => {
						chrome.windows.update(tabs[i].nativeWindowId, { focused: true }, () => {
							console.log('window Updated');
							chrome.tabs.update(tabs[i].nativeTabId, { active: true }, () => {
								console.log('tab Updated');
							});
						});
						return false;
					};

					divLine.getElementsByClassName('delete-btn')[0].onclick = () => {
						chrome.tabs.remove(tabs[i].nativeTabId, () => {
							setTimeout(() => {
								redraw();
							}, 150);
						});
					};
				})(i, divLine);

				const currentDiv = document.getElementById(`${targetDiv}Div`);
				currentDiv.appendChild(divLine);
			}

			if (from === 0 && tabs.length > to) {
				const next = document.createElement('a');
				next.id = `${targetDiv}_next_btn`;
				next.href = '#';
				next.innerText = 'More History...';
				next.onclick = () => {
					this.drawNextPage(tabs, targetDiv, this.to, this.to + pageSize);
					return false;
				};
				document.getElementById(`${targetDiv}Container`).appendChild(next);
			}
		}
	};
})();
