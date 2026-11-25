// HTML/CSS view of the home glam (HomeGlam.js): the bar at the top of the
// screen while the player is in their own home, the panel it opens, the "+8"
// that floats up when a piece adds to it and the new-level banner. HomeGlam.js
// decides what shows and when and hands over finished, translated text; this
// file only draws it and reports the presses. The panel's frame, title bar and
// close button are the backpack's (InventoryPanel.css); HomeGlamPanel.css does
// the rest.
var HomeGlamView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        button: 297737234,
        money: 291824691
    };

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._gainTimer = null;
        this._bannerTimer = null;
        this._hudShown = false;
        this._build();
        var self = this;
        ui.onLocaleChange(function () { self._emit('locale'); });
        // Capture, so movement and menu hotkeys never reach the game while the
        // panel is up. Esc and H (the key that opens it) close it.
        this._onKeyDown = function (event) {
            if (!self.isOpen()) return;
            event.stopImmediatePropagation();
            var key = event.key;
            if (key === 'Escape' || event.keyCode === 27 || key === 'h' || key === 'H') {
                event.preventDefault();
                self._emit('close');
            }
        };
    }

    View.ART = ART;

    View.get = function (app) {
        if (!app._homeGlamView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('HomeGlamPanel.css');
            app._homeGlamView = new View(ui);
        }
        return app._homeGlamView;
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
            self._emit(name);
        });
    };

    View.prototype._setIcon = function (element, icon) {
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        if (icon && icon.sprite) this.ui.setSpriteFrame(element, icon.sprite, icon.frame);
        else if (icon && icon.texture) this.ui.setTexture(element, icon.texture);
    };

    View.prototype._money = function (parent, amount, prefix) {
        var el = this.ui.el.bind(this.ui);
        var chip = el('span', 'hg-money', parent);
        this.ui.setTexture(el('i', 'hg-money-icon', chip), ART.money);
        el('span', 'hg-money-amount', chip).textContent = (prefix || '') + Number(amount || 0).toLocaleString('en-US');
        return chip;
    };

    View.prototype._build = function () {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var self = this;

        // ---- The bar, the "+8" and the banner: over the world, not a menu.
        var hud = this.hud = el('div', 'hg-hud', ui.root);
        hud.hidden = true;
        var pill = this.pill = el('button', 'hg-pill', hud);
        pill.type = 'button';
        this._button(pill, 'open');
        el('i', 'hg-spark', pill);
        var pillBody = el('span', 'hg-pill-body', pill);
        this.pillLevel = el('span', 'hg-pill-level lui-outline', pillBody);
        var pillMeter = el('span', 'hg-pill-meter', pillBody);
        this.pillFill = el('i', 'hg-pill-fill', pillMeter);
        this.pillScore = el('span', 'hg-pill-score lui-outline', pill);
        this.pillKey = el('span', 'hg-key', pill);
        this.pillKey.textContent = 'H';
        this.gain = el('span', 'hg-gain lui-outline', hud);
        this.gain.hidden = true;

        var banner = this.banner = el('div', 'hg-banner', ui.root);
        banner.hidden = true;
        this.bannerTitle = el('div', 'hg-banner-title lui-outline', banner);
        this.bannerLevel = el('div', 'hg-banner-level lui-outline', banner);
        this.bannerReward = el('div', 'hg-banner-reward', banner);

        // ---- The panel.
        var overlay = this.overlay = el('div', 'iv-overlay hg-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'hg-window lui-pop', overlay);
        var panel = el('div', 'iv-panel hg-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close hg-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        var head = el('div', 'hg-head', panel);
        var headTop = el('div', 'hg-head-top', head);
        this.levelName = el('div', 'hg-level lui-outline', headTop);
        this.scoreText = el('div', 'hg-score', headTop);
        var bar = el('div', 'hg-bar', head);
        this.barFill = el('i', 'hg-bar-fill', bar);
        var next = el('div', 'hg-next', head);
        this.nextText = el('span', 'hg-next-text', next);
        this.nextReward = el('span', 'hg-next-reward', next);

        var tip = this.tip = el('div', 'hg-tip', panel);
        var tipCard = el('div', 'hg-tip-card', tip);
        this.tipIcon = el('i', 'hg-icon', tipCard);
        var tipWords = el('div', 'hg-tip-words', tip);
        this.tipLabel = el('div', 'hg-tip-label', tipWords);
        this.tipName = el('div', 'hg-tip-name lui-outline', tipWords);
        var find = this.findButton = el('button', 'hg-find', tip);
        find.type = 'button';
        ui.setTexture(find, ART.button);
        this.findText = el('span', 'hg-find-text lui-outline', find);
        this._button(find, 'find');

        var scroll = this.scroll = el('div', 'hg-scroll', panel);
        ui.enableDragScroll(scroll, 'y');
        this.setsLabel = el('div', 'hg-section', scroll);
        this.setsGrid = el('div', 'hg-sets', scroll);
        this.extrasLabel = el('div', 'hg-section', scroll);
        this.extras = el('div', 'hg-extras', scroll);
        this.note = el('div', 'hg-note', scroll);
    };

    /* ---- The bar ------------------------------------------------------- */

    // pill: { level, score, progress (0..1), showKey }
    View.prototype.setPill = function (pill) {
        if (!pill) return;
        this.pillLevel.textContent = pill.level;
        this.pillScore.textContent = String(pill.score);
        this.pillFill.style.width = Math.round(Math.max(0, Math.min(1, pill.progress)) * 100) + '%';
        this.pillKey.hidden = !pill.showKey;
    };

    View.prototype.setHudVisible = function (visible) {
        visible = !!visible;
        if (visible === this._hudShown) return;
        this._hudShown = visible;
        this.hud.hidden = !visible;
        if (visible) {
            this.hud.removeAttribute('data-poki-playtest-skip');
            this.hud.classList.remove('is-in');
            void this.hud.offsetWidth;
            this.hud.classList.add('is-in');
        } else {
            this.hud.setAttribute('data-poki-playtest-skip', 'true');
        }
        this.ui.setCaptureHold('homeGlam', visible);
    };

    View.prototype.isHudVisible = function () {
        return this._hudShown;
    };

    // A piece just added to the glam: "+8" floats up from the bar, which bumps.
    View.prototype.showGain = function (text) {
        var gain = this.gain;
        clearTimeout(this._gainTimer);
        gain.textContent = text;
        gain.hidden = false;
        gain.classList.remove('is-up');
        this.pill.classList.remove('is-bump');
        void gain.offsetWidth;
        gain.classList.add('is-up');
        this.pill.classList.add('is-bump');
        var self = this;
        this._gainTimer = setTimeout(function () {
            gain.hidden = true;
            gain.classList.remove('is-up');
            self.pill.classList.remove('is-bump');
        }, 1500);
    };

    // banner: { title, level, reward }
    View.prototype.showBanner = function (banner, durationMs) {
        clearTimeout(this._bannerTimer);
        this.bannerTitle.textContent = banner.title;
        this.bannerLevel.textContent = banner.level;
        this.bannerReward.textContent = '';
        this.bannerReward.hidden = !(banner.reward > 0);
        if (banner.reward > 0) this._money(this.bannerReward, banner.reward, '+').classList.add('is-big');
        var element = this.banner;
        element.hidden = false;
        element.removeAttribute('data-poki-playtest-skip');
        element.classList.remove('is-in', 'is-out');
        void element.offsetWidth;
        element.classList.add('is-in');
        this.ui.setCaptureHold('homeGlamBanner', true);
        var self = this;
        this._bannerTimer = setTimeout(function () {
            element.classList.add('is-out');
            self._bannerTimer = setTimeout(function () {
                element.hidden = true;
                element.classList.remove('is-in', 'is-out');
                element.setAttribute('data-poki-playtest-skip', 'true');
                self.ui.setCaptureHold('homeGlamBanner', false);
            }, 300);
        }, durationMs || 3200);
    };

    /* ---- The panel ----------------------------------------------------- */

    View.prototype.show = function () {
        this.ui.showPanel(this.overlay);
        window.addEventListener('keydown', this._onKeyDown, true);
    };

    View.prototype.hide = function () {
        window.removeEventListener('keydown', this._onKeyDown, true);
        this.ui.hidePanel(this.overlay);
    };

    View.prototype.isOpen = function () {
        return this.ui.isPanelOpen(this.overlay);
    };

    // state: {
    //   title, level, score, progress, next, nextReward,
    //   tip: { label, name, icon, find, canFind } or null,
    //   setsLabel, sets: [{ name, bonus, done, pieces: [{ name, icon, have }] }],
    //   extrasLabel, extras: [{ label, done, chip }], note }
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        var ui = this.ui;
        var el = ui.el.bind(ui);

        this.titleText.textContent = state.title;
        this.levelName.textContent = state.level;
        this.scoreText.textContent = String(state.score);
        this.barFill.style.width = Math.round(Math.max(0, Math.min(1, state.progress)) * 100) + '%';
        this.nextText.textContent = state.next;
        this.nextReward.textContent = '';
        this.nextReward.hidden = !(state.nextReward > 0);
        if (state.nextReward > 0) this._money(this.nextReward, state.nextReward);

        var tip = state.tip;
        this.tip.hidden = !tip;
        if (tip) {
            this.tipLabel.textContent = tip.label;
            this.tipName.textContent = tip.name;
            this._setIcon(this.tipIcon, tip.icon);
            this.findText.textContent = tip.find;
            this.findButton.hidden = !tip.canFind;
        }

        this.setsLabel.textContent = state.setsLabel;
        this.setsGrid.textContent = '';
        (state.sets || []).forEach(function (set, index) {
            var card = el('div', 'hg-set lui-pop-item', this.setsGrid);
            card.style.setProperty('--lui-i', Math.min(index, 12));
            card.classList.toggle('is-done', !!set.done);
            var top = el('div', 'hg-set-head', card);
            el('span', 'hg-set-name', top).textContent = set.name;
            el('span', 'hg-set-bonus', top).textContent = '+' + set.bonus;
            var row = el('div', 'hg-set-pieces', card);
            set.pieces.forEach(function (piece) {
                var cell = el('div', 'hg-piece', row);
                cell.classList.toggle('is-have', !!piece.have);
                cell.title = piece.name;
                this._setIcon(el('i', 'hg-icon', el('span', 'hg-piece-bubble', cell)), piece.icon);
                el('i', 'hg-tick', cell);
            }, this);
        }, this);

        this.extrasLabel.textContent = state.extrasLabel;
        this.extras.textContent = '';
        (state.extras || []).forEach(function (extra) {
            var chip = el('div', 'hg-extra', this.extras);
            chip.classList.toggle('is-done', !!extra.done);
            el('i', 'hg-tick', chip);
            el('span', 'hg-extra-label', chip).textContent = extra.label;
            if (extra.chip) el('span', 'hg-extra-chip', chip).textContent = extra.chip;
        }, this);

        this.note.textContent = state.note;
    };

    return View;
}());
