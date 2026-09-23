(function () {
	var g = (a, d) => {
		var c = a.split('.'),
			b = window || this;
		c[0] in b || !b.execScript || b.execScript(`var ${c[0]}`);
		var e;
		while (c.length) {
			e = c.shift();
			if (c.length || void 0 === d) {
				if (b[e] == null) b[e] = {};
				b = b[e];
			} else b[e] = d;
		}
	};
	var h = (a) => {
		var d = chrome.runtime.connect('nmmhkkegccagdldgiimedpiccmgmieda', {}),
			c = !1;
		d.onMessage.addListener((b) => {
			c = !0;
			'response' in b && !('errorType' in b.response) ? a.success?.(b) : a.failure?.(b);
		});
		d.onDisconnect.addListener(() => {
			!c && a.failure && a.failure({ request: {}, response: { errorType: 'INTERNAL_SERVER_ERROR' } });
		});
		d.postMessage(a);
	};
	g('google.payments.inapp.buy', (a) => {
		a.method = 'buy';
		h(a);
	});
	g('google.payments.inapp.consumePurchase', (a) => {
		a.method = 'consumePurchase';
		h(a);
	});
	g('google.payments.inapp.getPurchases', (a) => {
		a.method = 'getPurchases';
		h(a);
	});
	g('google.payments.inapp.getSkuDetails', (a) => {
		a.method = 'getSkuDetails';
		h(a);
	});
})();
