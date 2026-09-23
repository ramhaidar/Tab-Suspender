/*
 * Copyright (c) 2015 Sergey Zadorozhniy. The content presented herein may not, under any circumstances,
 * be reproduced in whole or in any part or form without written permission from Sergey Zadorozhniy.
 * Zadorozhniy.Sergey@gmail.com
 */

var loaded = false;

window.addEventListener('load', () => {
	console.log('onload: ', Date.now());
	loaded = true;
});

var isLoaded = () => loaded;

window.domLoadedPromise = new Promise((resolve, _reject) => {
	document.addEventListener(
		'DOMContentLoaded',
		() => {
			console.log('onDOMContentLoaded: ', Date.now());

			resolve();
		},
		true
	);
});

try {
	chrome.runtime.getBackgroundPage((bgpage) => {
		console.log('getBackgroundPage Loaded: ', Date.now());

		window.domLoadedPromise.then(() => {
			try {
				bgpage.park_inner(window, document, console, isLoaded);
			} catch (e) {
				console.error(e);
			}
		});
	});
} catch (e) {
	console.error(e);
}
