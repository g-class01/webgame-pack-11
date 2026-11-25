// HTML/CSS view of the jack-in-the-box tip: shown once, after a player's first
// lost round. A screenshot of a player catching a jester who is fully out,
// the rule in one line, a word about his fake-outs and a "Got it!" button.
// JackBoxGame.js decides when; this file only draws the state it is handed and
// reports the close. The frame is the backpack's (InventoryPanel.css);
// JackBoxTipPanel.css sizes the window and draws the picture and the text.
var JackBoxTipView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        button: 297737234
    };

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._build();
        var self = this;
        ui.onLocaleChange(function () { if (self.state) self.render(self.state); });
    }

    View.ART = ART;

    View.get = function (app) {
        if (!app._jackBoxTipView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('JackBoxTipPanel.css');
            app._jackBoxTipView = new View(ui);
        }
        return app._jackBoxTipView;
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

        var overlay = this.overlay = el('div', 'iv-overlay jt-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'jt-window lui-pop', overlay);
        var panel = el('div', 'iv-panel jt-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close jt-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        // The picture: a player bumping into a jester who is fully out.
        this.shot = el('div', 'jt-shot', panel);
        this.shotImage = el('i', 'jt-shot-image', this.shot);

        this.rule = el('div', 'jt-rule lui-outline', panel);
        this.note = el('div', 'jt-note', panel);

        var actions = el('div', 'jt-actions', panel);
        var ok = this.ok = el('button', 'jt-button', actions);
        ok.type = 'button';
        ui.setTexture(ok, ART.button);
        this.okText = el('span', 'jt-button-text lui-outline', ok);
        this._button(ok, 'close');
    };

    View.prototype.show = function () {
        this.ui.showPanel(this.overlay);
    };

    View.prototype.hide = function () {
        this.ui.hidePanel(this.overlay);
    };

    View.prototype.isOpen = function () {
        return this.ui.isPanelOpen(this.overlay);
    };

    // state: { title, rule, note, ok, image } (image: a texture asset id, or 0)
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        var ui = this.ui;
        this.titleText.textContent = ui.text(state.title);
        this.rule.textContent = ui.text(state.rule);
        this.note.textContent = ui.text(state.note);
        this.okText.textContent = ui.text(state.ok);
        this.shot.hidden = !state.image;
        if (state.image && this._image !== state.image) {
            this._image = state.image;
            ui.setTexture(this.shotImage, state.image);
        }
    };

    return View;
}());
