let trackError = async (_error: Error) => {};
let trackView = async (_viewName: string, _info?: object) => {};

function trackErrors(pageName /* For example 'popup' */, _buttons /* true/false */) {
	const _tsErrorGaKey = 'ts_error';
	const _sendErrorsKey = 'sendErrors';
	const extensionRootPath = chrome.runtime.getURL('');

	const _eventsAccumulator = [];

	trackError = async (error: Error) => {
		void chrome.runtime.sendMessage({
			method: '[TS:offscreenDocument:sendError]',
			type: 'error',
			error: {
				message: `${pageName}: ${error.message}`,
				stack: error.stack.replaceAll(extensionRootPath, '')
			}
		});
	};

	trackView = async (viewName: string, info?: object) => {
		void chrome.runtime.sendMessage({
			method: '[TS:offscreenDocument:sendError]',
			type: 'event',
			event: {
				message: viewName,
				...info
			}
		});
	};
}

if (typeof module !== 'undefined')
	module.exports = {
		trackErrors,
		trackError,
		trackView
	};
