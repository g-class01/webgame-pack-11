/**
 * Universal Offline Poki SDK v2.3
 */
(function() {
    'use strict';
    if (!window.crypto) window.crypto = {};
    if (!window.crypto.randomUUID) {
        window.crypto.randomUUID = function() {
            return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function(c) {
                var rnd = window.crypto.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(1))[0] : Math.floor(Math.random() * 256);
                return (c ^ (rnd & (15 >> (c / 4)))).toString(16);
            });
        };
    }


    var origAtob = window.atob;
    window.atob = function(str) {
        if (typeof str === 'string' && (str.indexOf('aHR0cHM6Ly9wb2tpLmNvbS9zaXRlbG9jaw') !== -1 || str.indexOf('sitelock') !== -1)) {
            return 'javascript:void(0)';
        }
        return origAtob.apply(this, arguments);
    };

    var origEval = window.eval;
    window.eval = function(str) {
        if (typeof str === 'string' && (str.indexOf('aHR0cHM6Ly9wb2tpLmNvbS9zaXRlbG9jaw') !== -1 || str.indexOf('sitelock') !== -1)) {
            return;
        }
        return origEval.apply(this, arguments);
    };

    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
            url = '.' + url;
        }
        return origXhrOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
    };

    if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            if (typeof input === 'string') {
                if (input.startsWith('/') && !input.startsWith('//')) {
                    input = '.' + input;
                }
            }
            return origFetch.apply(this, [input, init]);
        };
    }

    var basePoki = {
        init: function() { return Promise.resolve(true); },
        initWithVideoHB: function() { return Promise.resolve(true); },
        customEvent: function() {},
        commercialBreak: function(fn) {
            if (typeof fn === 'function') {
                try { fn(); } catch(e) {}
            }
            return Promise.resolve(true);
        },
        rewardedBreak: function(fn) {
            if (typeof fn === 'function') {
                try { fn(true); } catch(e) {}
            }
            return Promise.resolve(true);
        },
        displayAd: function() {},
        destroyAd: function() {},
        getSiteCode: function() { return 2; },
        isAdBlocked: function() { return false; },
        happyTime: function() {},
        gameLoadingStart: function() {},
        gameLoadingFinished: function() {},
        gameLoadingProgress: function() {},
        gameplayStart: function() {},
        gameplayStop: function() {},
        roundStart: function() {},
        roundEnd: function() {},
        setDebug: function() {},
        setDebugTouchOverlayController: function() {},
        muteAd: function() {},
        movePill: function() {},
        openExternalLink: function() {},
        login: function() { return Promise.resolve(); },
        getUser: function() { return Promise.resolve({}); },
        getToken: function() { return Promise.resolve(""); },
        measure: function() {},
        shareableURL: function() { return Promise.resolve(window.location.href); },
        getLanguage: function() { return "en"; },
        getURLParam: function(name) { return ""; },
        logError: function() {}
    };

    window.PokiSDK = new Proxy(basePoki, {
        get: function(target, prop) {
            if (prop in target) return target[prop];
            return function() { return Promise.resolve(); };
        }
    });
    window.pokiSDK = window.PokiSDK;
})();
