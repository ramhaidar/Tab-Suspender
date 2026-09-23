// eslint-disable-next-line no-redeclare
const debug = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const trace = false;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const debugScreenCache = false;

/* Definitions for Syntax Check */
// eslint-disable-next-line no-redeclare
//var chrome = window.chrome = window.chrome || {};
// eslint-disable-next-line no-redeclare
//var trackError = undefined;

/**
 *
 */

if (typeof window !== 'undefined') {
	// @ts-expect-error
	trackError = window.trackError = window.trackError || {};

	// @ts-expect-error
	window.nativeConsole = window.console;
	window.console = {
		// @ts-expect-error
		warn: window.nativeConsole.warn,
		// @ts-expect-error
		assert: window.nativeConsole.assert,
		// @ts-expect-error
		clear: window.nativeConsole.clear,
		// @ts-expect-error
		count: window.nativeConsole.count,
		// @ts-expect-error
		debug: window.nativeConsole.debug,
		// @ts-expect-error
		dir: window.nativeConsole.dir,
		// @ts-expect-error
		dirxml: window.nativeConsole.dirxml,
		// @ts-expect-error
		error: window.nativeConsole.error,
		// @ts-expect-error
		exception: window.nativeConsole.exception,
		// @ts-expect-error
		group: window.nativeConsole.group,
		// @ts-expect-error
		groupCollapsed: window.nativeConsole.groupCollapsed,
		// @ts-expect-error
		groupEnd: window.nativeConsole.groupEnd,
		// @ts-expect-error
		info: window.nativeConsole.info,
		// @ts-expect-error
		msIsIndependentlyComposed: window.nativeConsole.msIsIndependentlyComposed,
		// @ts-expect-error
		profile: window.nativeConsole.profile,
		// @ts-expect-error
		profileEnd: window.nativeConsole.profileEnd,
		// @ts-expect-error
		select: window.nativeConsole.select,
		// @ts-expect-error
		table: window.nativeConsole.table,
		// @ts-expect-error
		time: window.nativeConsole.time,
		// @ts-expect-error
		timeEnd: window.nativeConsole.timeEnd,
		// @ts-expect-error
		trace: window.nativeConsole.trace
	};
}

// @ts-expect-error
const consoleLog = typeof window !== 'undefined' ? window.nativeConsole.log : console.log;
/*if(typeof window !== "undefined") {
	window.consoleLog = window.nativeConsole;
}*/
console.log = (...args) => {
	let trace: string | undefined;
	if (debug)
		try {
			const a = {};
			// @ts-expect-error
			a.debug();
		} catch (ex) {
			trace = ex.stack;
		}

	let nativeConsoleLog = consoleLog;
	if (typeof window !== 'undefined') {
		// @ts-expect-error
		nativeConsoleLog = window.nativeConsole.log;
	}
	nativeConsoleLog(...args, debug ? { trace: trace } : '');
};

/**
 *
 */
const consoleError = console.error;
console.error = function (...args) {
	const [message, exception] = args;
	if (debug)
		chrome.notifications.create({
			type: 'list',
			requireInteraction: true,
			iconUrl: 'img/icon16.png',
			title: 'New Exception',
			message: `${message}`,
			items: [
				{ title: '', message: `${message}` },
				{
					title: '',
					message:
						exception && exception instanceof Error && exception.stack != null ? exception.stack : `${exception}\n${new Error().stack}`
				}
			]
		});

	//window.nativeConsole.error(...args);
	consoleError.apply(this, args);

	if (trackError)
		try {
			let error: Error | undefined;
			for (let i = 0; i < args.length; i++) {
				if (args[i] != null && args[i] instanceof Error) {
					if (error == null) error = args[i];
					else error.message += ` ->NestedException-> ${args[i].message}`;
				}
			}

			if (error == null) error = new Error('');

			let commentAdded = false;
			for (let j = 0; j < args.length; j++) {
				if (args[j] != null && typeof args[j] === 'string' && commentAdded === false) {
					if (j === 0) error.message = `${args[j]} | ${error.message}`;
					else error.message += ` | ${args[j]}`;
					commentAdded = true;
				}
			}

			if (error.message === '') error.message = 'Really no arguments provided!';

			void trackError(error);
		} catch (e) {
			consoleError('Error while logging Error)) ', e);
		}
};

addEventListener('error', (errorEvent) => {
	console.error(errorEvent.error);
});

const expectedErrorsRegexpCache: { [key: string]: RegExp } = {};

const globalIgnoredErrors = [
	'The browser is shutting down.',
	'RegExp:No tab with id: \\d*\\.',
	'RegExp:Cannot discard tab with id: \\d{1,5}\\.'
];

function checkOccurrenceOfExpectedErrors(errorMessage: string, expectedList: any[]) {
	let expectedMessage = false;
	for (let j = 0; j < expectedList.length; j++) {
		if (expectedList[j].indexOf('RegExp:') === 0) {
			// REGEXP
			const regExpString = expectedList[j].substr(7);
			let cachedRegExp = expectedErrorsRegexpCache[regExpString];
			if (cachedRegExp == null) {
				cachedRegExp = expectedErrorsRegexpCache[regExpString] = RegExp(regExpString);
			}
			if (cachedRegExp.test(errorMessage)) expectedMessage = true;
		} else if (errorMessage === expectedList[j]) expectedMessage = true;
	}
	return expectedMessage;
}

// eslint-disable-next-line no-redeclare,no-unused-vars,@typescript-eslint/no-unused-vars
function hasLastError(expectedMessage?: string | string[], error?: Error, comment?: string) {
	let expectedList = [];

	if (expectedMessage != null) {
		if (Array.isArray(expectedMessage)) expectedList = expectedList.concat(expectedMessage);
		else expectedList.push(expectedMessage);
	}

	expectedList = expectedList.concat(globalIgnoredErrors);

	let expected: boolean;

	if (error != null) {
		expected = checkOccurrenceOfExpectedErrors(error.message, expectedList);

		if (expected) {
			if (comment) console.warn(comment, error);
			else console.warn(error);
			//return true;
		} else {
			if (comment) console.error(comment, error);
			else console.error(error);
		}
	}

	if (chrome.runtime.lastError) {
		expected = checkOccurrenceOfExpectedErrors(chrome.runtime.lastError.message, expectedList);

		if (expected) {
			if (comment) console.warn(`${comment}: ${chrome.runtime.lastError}`);
			else console.warn(chrome.runtime.lastError);
			//return true;
		} else {
			if (comment) console.error(`${comment}: ${chrome.runtime.lastError}`);
			else console.error(chrome.runtime.lastError);
		}
	}

	return false;
}

/**
 *
 */
// eslint-disable-next-line no-redeclare,no-unused-vars
function versionCompare(v1, v2, options?) {
	let lexicographical = options?.lexicographical,
		zeroExtend = options?.zeroExtend,
		v1parts = v1.split('.'),
		v2parts = v2.split('.');

	function isValidPart(x) {
		return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
	}

	if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
		return NaN;
	}

	if (zeroExtend) {
		while (v1parts.length < v2parts.length) v1parts.push('0');
		while (v2parts.length < v1parts.length) v2parts.push('0');
	}

	if (!lexicographical) {
		v1parts = v1parts.map(Number);
		v2parts = v2parts.map(Number);
	}

	for (let i = 0; i < v1parts.length; ++i) {
		if (v2parts.length === i) {
			return 1;
		}

		if (v1parts[i] === v2parts[i]) {
		} else if (v1parts[i] > v2parts[i]) {
			return 1;
		} else {
			return -1;
		}
	}

	if (v1parts.length !== v2parts.length) {
		return -1;
	}

	return 0;
}

/**
 *
 */
// eslint-disable-next-line no-redeclare,no-unused-vars
/*function parseUrlParam(url, val) {
	'use strict';

	let tmp = [];
	// eslint-disable-next-line no-useless-escape
	const parts = url.substr(1).split(/[&\?]/);

	for (let i = 0; i < parts.length; i++) {
		tmp = parts[i].split('=');
		if (tmp[0] === val)
			return decodeURIComponent(tmp[1]);
	}

	return null;
}*/
function parseUrlParam(url: string, parameterName: string): string {
	try {
		if (url == null || url === '') return null;
		return new URL(url).searchParams.get(parameterName);
	} catch (e) {
		console.error(`Error while parsing URL[${url}] parameterName[${parameterName}]`, e);
		return null;
	}
}

/**
 *
 */
// eslint-disable-next-line no-unused-vars,no-redeclare
function sql_error(arg, arg2, arg3) {
	console.error(`SQL error: ${arg}${arg2}${arg3}`, arg2);
}

// eslint-disable-next-line no-redeclare,no-unused-vars,@typescript-eslint/no-unused-vars
function extractHostname(url) {
	let hostname: string;
	//find & remove protocol (http, ftp, etc.) and get hostname

	if (url.indexOf('://') > -1) {
		hostname = url.split('/')[2];
	} else {
		hostname = url.split('/')[0];
	}

	//find & remove port number
	hostname = hostname.split(':')[0];
	//find & remove "?"
	hostname = hostname.split('?')[0];

	return hostname;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function isDarkMode() {
	const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

	if (isDarkMode) console.log('Currently in dark mode');
	else console.log('Currently not in dark mode');

	return isDarkMode;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (typeof module !== 'undefined')
	module.exports = {
		parseUrlParam,
		sleep
	};
