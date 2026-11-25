// HTML/CSS view of the Vampire Vault: the legendary vampire outfit, one piece
// per rewarded ad. Scripts/VampireShop.js keeps the pieces, the ad and the
// server; this file only draws what it is handed and reports presses. The big
// picture on the left is the HUD button's art again: a backdrop, the two kids,
// bats and sparkles as flat layers that VampireShopPanel.css moves (no frame
// sheet). The highlight that runs over the cards and lands on the piece that
// was won is startRoulette().
//
// Art is referenced by asset id. Change an id here (or the texture behind it
// in the Editor) to change the picture.
var VampireShopView = (function () {
    var ART = {
        closeButton: 297366678,
        adButton: 297737235,    // blue, 180 x 85
        wearButton: 297737234,  // green, 180 x 85
        closeWide: 297737236,   // yellow, 180 x 85
        adIcon: 305530492,
        check: 294850300,
        backdrop: 310936457,    // HtmlUi/VaultBackdrop.webp
        boy: 310936458,         // HtmlUi/VaultBoy.webp
        girl: 310936459,        // HtmlUi/VaultGirl.webp
        bat: 310936462,         // HtmlUi/VaultBat.webp
        sparkle: 310936463      // HtmlUi/VaultSparkle.png
    };

    // The highlight's hops: quick at first, slowing to a stop on the winner.
    var HOP_FIRST_MS = 70;
    var HOP_LAST_MS = 480;
    var HOP_EASE = 2.6;
    var HOPS_MIN = 12;
    var HOPS_MAX = 20;

    // Cards shrink so the whole set shows at once, down to this share of their
    // full size and never under this many pixels (a very small phone held
    // sideways); a set that needs less than that scrolls.
    var CARD_MIN = 0.5;
    var CARD_MIN_PX = 34;

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._cards = {};
        this._order = [];
        this._spinTimer = null;
        this._toastTimer = null;
        this._build();
        var self = this;
        ui.onLocaleChange(function () { if (self.state) self.render(self.state); });
        // The list's box changes with the window, the layout and the length of
        // the lines above it.
        var fit = function () { self._fitCards(); };
        if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(this.grid);
        else window.addEventListener('resize', fit);
        // Capture, so menu hotkeys and movement never reach the game while
        // the vault is up. Key releases still go through.
        this._onKeyDown = function (event) {
            if (!self.isOpen()) return;
            event.stopImmediatePropagation();
            if (event.key === 'Escape' || event.keyCode === 27) {
                event.preventDefault();
                self._emit('close');
            }
        };
    }

    View.ART = ART;

    View.get = function (app) {
        if (!app._vampireShopView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('VampireShopPanel.css');
            app._vampireShopView = new View(ui);
        }
        return app._vampireShopView;
    };

    View.prototype.setHandlers = function (handlers) {
        this.handlers = handlers || {};
    };

    View.prototype._emit = function (name, value) {
        var handler = this.handlers[name];
        if (typeof handler === 'function') handler(value);
    };

    View.prototype._button = function (element, name) {
        var self = this;
        element.addEventListener('click', function (event) {
            event.stopPropagation();
            if (element.disabled) return;
            self._emit(name);
        });
    };

    View.prototype._build = function () {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var self = this;

        var overlay = this.overlay = el('div', 'vv-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = this.window = el('div', 'vv-window lui-pop', overlay);

        var close = this.closeButton = el('button', 'vv-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        // The picture.
        var hero = el('div', 'vv-hero', win);
        var stage = el('div', 'vv-stage', hero);
        var disc = el('div', 'vv-disc', stage);
        ui.setTexture(el('i', 'vv-backdrop', disc), ART.backdrop);
        el('i', 'vv-shine', disc);
        var kids = el('div', 'vv-kids', stage);
        ui.setTexture(el('i', 'vv-kid vv-girl', kids), ART.girl);
        ui.setTexture(el('i', 'vv-kid vv-boy', kids), ART.boy);
        for (var b = 1; b <= 3; b++) {
            ui.setTexture(el('i', '', el('div', 'vv-bat vv-bat-' + b, stage)), ART.bat);
        }
        for (var s = 1; s <= 4; s++) {
            ui.setTexture(el('i', 'vv-sparkle vv-sparkle-' + s, stage), ART.sparkle);
        }

        // The list.
        var side = el('div', 'vv-side', win);
        this.title = el('div', 'vv-title lui-outline', side);
        this.note = el('div', 'vv-note', side);
        var count = el('div', 'vv-count', side);
        this.countLabel = el('span', 'vv-count-label', count);
        var meter = el('span', 'vv-meter', count);
        this.meterFill = el('i', 'vv-meter-fill', meter);
        this.countText = el('span', 'vv-count-text', count);
        this.grid = el('div', 'vv-grid', side);
        ui.enableDragScroll(this.grid, 'y');
        this.odds = el('div', 'vv-odds', side);

        this.done = el('div', 'vv-done lui-outline', side);
        // A plain way out beside the ad, as big as it (Poki QA, 2026-10-16: a
        // rewarded button always comes with a standard one at least its size,
        // next to or above it). It does what the cross does.
        var actions = el('div', 'vv-actions', side);
        var decline = this.declineButton = el('button', 'vv-decline', actions);
        decline.type = 'button';
        ui.setTexture(decline, ART.closeWide);
        this.declineText = el('span', 'lui-outline', decline);
        this._button(decline, 'close');
        var ad = this.adButton = el('button', 'vv-ad', actions);
        ad.type = 'button';
        ui.setTexture(ad, ART.adButton);
        ui.setTexture(el('i', 'vv-ad-icon', ad), ART.adIcon);
        this.adText = el('span', 'vv-ad-text lui-outline', ad);
        this._button(ad, 'watch');

        // The piece that was won, over the whole window.
        var result = this.result = el('div', 'vv-result', win);
        result.hidden = true;
        el('i', 'vv-result-rays', result);
        this.resultTitle = el('div', 'vv-result-title lui-outline', result);
        var card = el('div', 'vv-result-card', result);
        this.resultIcon = el('i', 'vv-result-icon', card);
        var resultActions = el('div', 'vv-result-actions', result);
        var wear = el('button', 'vv-button', resultActions);
        wear.type = 'button';
        ui.setTexture(wear, ART.wearButton);
        this.wearText = el('span', 'lui-outline', wear);
        this._button(wear, 'wear');
        var ok = el('button', 'vv-button vv-button-ok', resultActions);
        ok.type = 'button';
        ui.setTexture(ok, ART.adButton);
        this.okText = el('span', 'lui-outline', ok);
        this._button(ok, 'ok');
    };

    View.prototype._setIcon = function (element, icon) {
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        if (icon && icon.sprite) this.ui.setSpriteFrame(element, icon.sprite, icon.frame);
        else if (icon && icon.texture) this.ui.setTexture(element, icon.texture);
    };

    // The biggest size at which every card fits the list's box without
    // scrolling, whatever number of columns that takes. Never above the
    // stylesheet's own size.
    View.prototype._fitCards = function () {
        var grid = this.grid;
        var first = grid.firstElementChild;
        var count = this._order.length;
        if (!first || !count || !grid.clientWidth || !grid.clientHeight) return;
        grid.style.removeProperty('--vv-card');
        var full = first.offsetWidth;
        var style = window.getComputedStyle(grid);
        var gap = parseFloat(style.columnGap) || 0;
        var width = grid.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
        var height = grid.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
        var best = 0;
        for (var columns = 1; columns <= count; columns++) {
            var rows = Math.ceil(count / columns);
            best = Math.max(best, Math.min(
                (width - gap * (columns - 1)) / columns,
                (height - gap * (rows - 1)) / rows
            ));
        }
        var least = Math.min(full, Math.max(full * CARD_MIN, CARD_MIN_PX));
        var size = Math.floor(Math.max(least, Math.min(full, best)));
        if (size < full) grid.style.setProperty('--vv-card', size + 'px');
    };

    View.prototype.show = function () {
        this.result.hidden = true;
        this.ui.showPanel(this.overlay);
        this._fitCards();
        window.addEventListener('keydown', this._onKeyDown, true);
    };

    View.prototype.hide = function () {
        window.removeEventListener('keydown', this._onKeyDown, true);
        this.stopRoulette();
        this.ui.hidePanel(this.overlay);
    };

    View.prototype.isOpen = function () {
        return this.ui.isPanelOpen(this.overlay);
    };

    // state: { title, note, countLabel, odds, watch, complete, pieces: [{ key,
    //          icon, owned }], busy, canWatch }
    // The cards are kept between renders (re-inserting one would replay its
    // entrance), so only what changed is touched.
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        var ui = this.ui;
        this.title.textContent = ui.text(state.title);
        this.note.textContent = ui.text(state.note);
        this.countLabel.textContent = ui.text(state.countLabel);
        this.odds.textContent = ui.text(state.odds);
        this.adText.textContent = ui.text(state.watch);
        this.declineText.textContent = ui.text('Close');
        this.done.textContent = ui.text(state.complete);

        var pieces = state.pieces || [];
        var keys = pieces.map(function (piece) { return piece.key; });
        if (keys.join('|') !== this._order.join('|')) {
            this.grid.textContent = '';
            this._cards = {};
            this._order = keys;
            pieces.forEach(function (piece, index) {
                var card = ui.el('div', 'vv-card lui-pop-item', this.grid);
                card.style.setProperty('--lui-i', Math.min(index, 20));
                this._setIcon(ui.el('i', 'vv-card-icon', card), piece.icon);
                ui.setTexture(ui.el('i', 'vv-card-check', card), ART.check);
                this._cards[piece.key] = card;
            }, this);
        }
        var owned = 0;
        pieces.forEach(function (piece) {
            var card = this._cards[piece.key];
            if (card) card.classList.toggle('is-owned', !!piece.owned);
            if (piece.owned) owned++;
        }, this);
        this._renderCount(owned, pieces.length);
        this._fitCards();

        var complete = pieces.length > 0 && owned >= pieces.length;
        this.adButton.hidden = complete;
        this.adButton.disabled = !!state.busy || !state.canWatch;
        this.done.hidden = !complete;
        this.odds.hidden = complete;
        this.closeButton.disabled = !!state.busy;
        this.declineButton.disabled = !!state.busy;
    };

    View.prototype._renderCount = function (owned, total) {
        var text = owned + '/' + total;
        var changed = this.countText.textContent && this.countText.textContent !== text;
        this.countText.textContent = text;
        this.meterFill.style.width = (total > 0 ? Math.min(100, owned / total * 100) : 0) + '%';
        if (changed) {
            this.countText.classList.remove('is-up');
            void this.countText.offsetWidth;
            this.countText.classList.add('is-up');
        }
    };

    // Runs the highlight over the cards in `pool` (keys, in grid order) and
    // stops it on `winner`. onHop is called at every hop (for the tick sound),
    // onDone once the winner has popped. With one card left the highlight
    // blinks on it instead.
    View.prototype.startRoulette = function (pool, winner, onHop, onDone) {
        this.stopRoulette();
        var self = this;
        var order = this._order.filter(function (key) { return pool.indexOf(key) !== -1; });
        if (order.indexOf(winner) === -1) order.push(winner);
        Object.keys(this._cards).forEach(function (key) {
            this._cards[key].classList.toggle('is-pool', order.indexOf(key) !== -1);
            this._cards[key].classList.remove('is-lit', 'is-won');
        }, this);
        this.grid.classList.add('is-spinning');

        var single = order.length === 1;
        var count = order.length;
        var target = order.indexOf(winner);
        // About two laps and then on to the winner: never fewer than a dozen
        // hops (a short list goes round more often) and never more than
        // twenty (a long list starts part of the way round), so the run takes
        // three to four seconds whatever is left.
        var hops = single ? 7 : Math.max(HOPS_MIN, Math.min(HOPS_MAX, count * 2 + target + 1));
        var first = single ? 0 : ((target - (hops - 1)) % count + count) % count;
        var step = 0;
        var lit = null;

        var hop = function () {
            self._spinTimer = null;
            if (lit) lit.classList.remove('is-lit');
            var key = single ? winner : order[(first + step) % count];
            var card = self._cards[key];
            // One card: on, off, on... ending on.
            var show = !single || step % 2 === 0;
            lit = show ? card : null;
            if (lit) {
                lit.classList.add('is-lit');
                if (typeof lit.scrollIntoView === 'function') {
                    try { lit.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { }
                }
                if (onHop) onHop(step, hops);
            }
            step++;
            if (step < hops) {
                var t = hops > 1 ? step / (hops - 1) : 1;
                var delay = single ? 150 : HOP_FIRST_MS + (HOP_LAST_MS - HOP_FIRST_MS) * Math.pow(t, HOP_EASE);
                self._spinTimer = setTimeout(hop, delay);
                return;
            }
            // Landed.
            self._spinTimer = setTimeout(function () {
                self._spinTimer = null;
                self.grid.classList.remove('is-spinning');
                if (card) {
                    card.classList.remove('is-lit');
                    card.classList.add('is-won', 'is-owned');
                }
                if (onDone) onDone();
            }, 520);
        };
        hop();
    };

    View.prototype.stopRoulette = function () {
        if (this._spinTimer) clearTimeout(this._spinTimer);
        this._spinTimer = null;
        this.grid.classList.remove('is-spinning');
        Object.keys(this._cards).forEach(function (key) {
            this._cards[key].classList.remove('is-lit', 'is-pool');
        }, this);
    };

    // result: { icon, title, wear, ok }
    View.prototype.showResult = function (result) {
        this._setIcon(this.resultIcon, result.icon);
        this.resultTitle.textContent = this.ui.text(result.title);
        this.wearText.textContent = this.ui.text(result.wear);
        this.okText.textContent = this.ui.text(result.ok);
        this.result.hidden = true;
        // Restart its entrance.
        void this.result.offsetWidth;
        this.result.hidden = false;
    };

    View.prototype.hideResult = function () {
        this.result.hidden = true;
    };

    View.prototype.toast = function (text, kind) {
        var ui = this.ui;
        if (this._toast && this._toast.parentNode) this._toast.parentNode.removeChild(this._toast);
        clearTimeout(this._toastTimer);
        var toast = this._toast = ui.el('div', 'lui-toast lui-outline vv-toast' + (kind === 'error' ? ' is-error' : ''), this.window);
        toast.textContent = ui.text(text);
        var self = this;
        this._toastTimer = setTimeout(function () {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
            if (self._toast === toast) self._toast = null;
        }, 2300);
    };

    return View;
}());
