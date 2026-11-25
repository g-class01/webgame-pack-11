// HTML/CSS view of the Discord invite, opened by walking into the Discord sign
// on the main island (DiscordSign.js). The Discord mark, an invitation, a
// "Join Discord" button that opens the link, and a close button. While it is
// up the game takes no keys (the panel itself already covers the screen for
// clicks and touches); Esc closes it. DiscordSign.js decides when it shows and
// what the buttons do; this file only draws it and reports the presses. The
// frame is the backpack's (InventoryPanel.css); DiscordPanel.css sizes it.
var DiscordView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        button: 297737234,
        mark: 304260468   // discord-mark-blue.png, the sign's own picture
    };

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._build();
        var self = this;
        ui.onLocaleChange(function () { if (self.state) self.render(self.state); });
        // Capture, so menu hotkeys (wardrobe, phone, settings...) and movement
        // never reach the game while the invite is up. Key releases still go
        // through, so a key held when the panel opened is not left stuck.
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
        if (!app._discordView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('DiscordPanel.css');
            app._discordView = new View(ui);
        }
        return app._discordView;
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

    View.prototype._build = function () {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var self = this;

        var overlay = this.overlay = el('div', 'iv-overlay dc-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'dc-window lui-pop', overlay);
        var panel = el('div', 'iv-panel dc-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close dc-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        var mark = el('div', 'dc-mark', panel);
        ui.setTexture(el('i', 'dc-mark-image', mark), ART.mark);

        this.headline = el('div', 'dc-headline lui-outline', panel);
        this.note = el('div', 'dc-note', panel);

        var actions = el('div', 'dc-actions', panel);
        var join = el('button', 'dc-button', actions);
        join.type = 'button';
        ui.setTexture(join, ART.button);
        this.joinText = el('span', 'dc-button-text lui-outline', join);
        this._button(join, 'join');
    };

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

    // state: { title, headline, note, join }
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        var ui = this.ui;
        this.titleText.textContent = ui.text(state.title);
        this.headline.textContent = ui.text(state.headline);
        this.note.textContent = ui.text(state.note);
        this.joinText.textContent = ui.text(state.join);
    };

    return View;
}());
