// HTML/CSS view of the floor panel (HomeFloors.js), opened by standing in the
// floor circle by your home: a little house drawn floor by floor (the floors
// you have, the next one glowing, the rest still to come), which floor it is,
// what it costs and a Build button. HomeFloors.js hands over finished,
// translated text and reports nothing back but the presses. The frame, title
// bar and close button are the backpack's (InventoryPanel.css); HomeFloorsPanel.css
// does the rest.
var HomeFloorsView = (function () {
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
        this._build();
        var self = this;
        ui.onLocaleChange(function () { self._emit('locale'); });
        // Capture, so movement and menu hotkeys never reach the game while the
        // panel is up; Esc closes it.
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
        if (!app._homeFloorsView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('HomeFloorsPanel.css');
            app._homeFloorsView = new View(ui);
        }
        return app._homeFloorsView;
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

        var overlay = this.overlay = el('div', 'iv-overlay hf-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = this.window = el('div', 'hf-window lui-pop', overlay);
        var panel = el('div', 'iv-panel hf-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close hf-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        // The house, top floor first.
        var picture = el('div', 'hf-picture', panel);
        this.roof = el('div', 'hf-roof', picture);
        this.stack = el('div', 'hf-stack', picture);
        el('div', 'hf-ground', picture);

        this.headline = el('div', 'hf-headline lui-outline', panel);
        this.note = el('div', 'hf-note', panel);

        var price = this.price = el('div', 'hf-price', panel);
        ui.setTexture(el('i', 'hf-price-icon', price), ART.money);
        this.priceText = el('span', 'hf-price-text', price);
        price.setAttribute('data-lui-currency', 'money');

        var actions = el('div', 'hf-actions', panel);
        var build = this.buildButton = el('button', 'hf-build', actions);
        build.type = 'button';
        ui.setTexture(build, ART.button);
        this.buildText = el('span', 'hf-build-text lui-outline', build);
        this._button(build, 'build');
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

    // Not enough money: the price shakes.
    View.prototype.shake = function () {
        var price = this.price;
        price.classList.remove('is-short-shake');
        void price.offsetWidth;
        price.classList.add('is-short-shake');
    };

    // state: { title, headline, built, max, cost, canBuy, short, note, button, pending }
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        var el = this.ui.el.bind(this.ui);
        this.titleText.textContent = state.title;
        this.headline.textContent = state.headline;
        this.note.textContent = state.note;
        this.note.classList.toggle('is-short', !!state.short);

        // max floors, top first: still to come, the next one, then built.
        this.stack.textContent = '';
        for (var floor = state.max; floor >= 1; floor--) {
            var block = el('div', 'hf-floor', this.stack);
            var kind = floor <= state.built ? 'built' : (floor === state.built + 1 && state.canBuy ? 'next' : 'later');
            block.setAttribute('data-kind', kind);
            el('i', 'hf-window-left', block);
            el('i', 'hf-window-right', block);
            if (kind === 'next') el('span', 'hf-plus lui-outline', block).textContent = '+';
        }
        this.roof.setAttribute('data-floors', String(state.built));

        this.price.hidden = !state.canBuy;
        this.priceText.textContent = Number(state.cost || 0).toLocaleString('en-US');
        this.price.classList.toggle('is-short', !!state.short);
        this.buildButton.hidden = !state.canBuy;
        this.buildButton.disabled = !!state.pending;
        this.buildButton.classList.toggle('is-pending', !!state.pending);
        this.buildText.textContent = state.button;
    };

    return View;
}());
