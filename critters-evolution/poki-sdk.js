/**
 * Universal Offline Poki SDK & Sitelock Immunizer v2.3
 */
(function() {
    'use strict';

    // 1. SITELOCK IMMUNIZER (Hook atob & eval)
    var origAtob = window.atob;
    window.atob = function(str) {
        if (typeof str === 'string') {
            if (str.indexOf('aHR0cHM6Ly9wb2tpLmNvbS9zaXRlbG9jaw') !== -1 || str.indexOf('sitelock') !== -1) {
                console.log('[Offline PokiSDK] Sitelock payload neutralized in atob');
                return 'javascript:void(0)';
            }
        }
        return origAtob.apply(this, arguments);
    };

    var origEval = window.eval;
    window.eval = function(str) {
        if (typeof str === 'string' && (str.indexOf('aHR0cHM6Ly9wb2tpLmNvbS9zaXRlbG9jaw') !== -1 || str.indexOf('sitelock') !== -1)) {
            console.log('[Offline PokiSDK] Sitelock code neutralized in eval');
            return;
        }
        return origEval.apply(this, arguments);
    };

    // 2. ROOT-RELATIVE PATH REWRITER (/assets/... -> ./assets/...)
    var origXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        if (typeof url === 'string' && url.startsWith('https://tapwap.local:4321/')) { url = url.replace('https://', 'http://'); } if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) {
            url = '.' + url;
        }
        return origXhrOpen.apply(this, [method, url].concat(Array.prototype.slice.call(arguments, 2)));
    };

        if (window.fetch) {
        var origFetch = window.fetch;
        window.fetch = function(input, init) {
            if (typeof input === 'string') {
                if (input.indexOf('https://tapwap.local:4321/') === 0) {
                    input = input.replace('https://tapwap.local:4321/', 'http://tapwap.local:4321/');
                }
                if (input.startsWith('/') && !input.startsWith('//')) {
                    input = '.' + input;
                }
            } else if (input && typeof input === 'object') {
                var u = input.url || '';
                if (u.indexOf('https://tapwap.local:4321/') === 0) {
                    var newU = u.replace('https://tapwap.local:4321/', 'http://tapwap.local:4321/');
                    input = new Request(newU, input);
                }
            }
            return origFetch.apply(this, [input, init]);
        };
    }

    // 3. UNITY POKI BRIDGE STUB
    var bridgeName = null;
    window.initPokiBridge = function(e) {
        bridgeName = e;
        window._pokiUnityName = e;
        console.log('[Offline PokiSDK] initPokiBridge:', e);
        function sendReady() {
            var g = window.unityInstance || window.unityGame;
            if (g) {
                try { g.SendMessage(e, "ready"); } catch(err) {}
            } else {
                setTimeout(sendReady, 50);
            }
        }
        sendReady();
    };

    window.commercialBreak = function(fn) {
        if (typeof fn === 'function') {
            try { fn(); } catch(err) {}
        }
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "commercialBreakCompleted"); } catch(e) {}
        }
        return Promise.resolve(true);
    };

    window.rewardedBreak = function(fn) {
        if (typeof fn === 'function') {
            try { fn(true); } catch(err) {}
        }
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "rewardedBreakCompleted", "true"); } catch(e) {}
        }
        return Promise.resolve(true);
    };

    window.shareableURL = function(e) {
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "shareableURLResolved", window.location.href); } catch(e) {}
        }
        return Promise.resolve(window.location.href);
    };

    window.getUser = function() {
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "getUserResolved", "{}"); } catch(e) {}
        }
        return Promise.resolve({});
    };

    window.getToken = function() {
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "getTokenResolved", ""); } catch(e) {}
        }
        return Promise.resolve("");
    };

    window.login = function() {
        var g = window.unityInstance || window.unityGame;
        var b = bridgeName || window._pokiUnityName;
        if (g && b) {
            try { g.SendMessage(b, "loginResolved"); } catch(e) {}
        }
        return Promise.resolve();
    };

    // 4. POKISDK CLIENT API (Proxy Catch-all v2.3)
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
