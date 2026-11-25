// HTML/CSS view of a wall shelf: its spots standing on a wooden plank, and
// the player's hand props below to put on them. HomeShelves.js keeps the
// shelf, the choice and the server; this file only draws the state it is
// handed and reports taps back. The frame, cards and empty text are the
// backpack's (InventoryPanel.css); ShelfPanel.css adds the shelf.
var ShelfView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        check: 294850300
    };

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._cells = {};
        this._build();
        var self = this;
        ui.onLocaleChange(function () { self._emit('locale'); });
    }

    View.ART = ART;

    View.get = function (app) {
        if (!app._shelfView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('ShelfPanel.css');
            app._shelfView = new View(ui);
        }
        return app._shelfView;
    };

    View.prototype.setHandlers = function (handlers) {
        this.handlers = handlers || {};
    };

    View.prototype._emit = function (name, value) {
        var handler = this.handlers[name];
        if (typeof handler === 'function') handler(value);
    };

    View.prototype._button = function (element, name, value) {
        var self = this;
        element.addEventListener('click', function (event) {
            event.stopPropagation();
            if (element.disabled) return;
            self._emit(name, typeof value === 'function' ? value() : value);
        });
    };

    View.prototype._build = function () {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var self = this;

        var overlay = this.overlay = el('div', 'iv-overlay sh-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'sh-window lui-pop', overlay);
        var panel = el('div', 'iv-panel sh-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        // The shelf: a spot per item, standing on a plank.
        var shelf = el('div', 'sh-shelf', panel);
        this.spotRow = el('div', 'sh-spots', shelf);
        el('div', 'sh-plank', shelf);
        this._spots = [];

        this.hint = el('div', 'sh-hint', panel);

        var main = el('div', 'sh-main', panel);
        this.grid = el('div', 'iv-grid sh-grid', main);
        ui.enableDragScroll(this.grid, 'y');
        this.empty = el('div', 'iv-empty', main);
    };

    View.prototype._spot = function (index) {
        var spot = this._spots[index];
        if (spot) return spot;
        var ui = this.ui;
        var el = ui.el.bind(ui);
        // A div, since it holds the remove button.
        var element = el('div', 'sh-spot', this.spotRow);
        element.setAttribute('role', 'button');
        var icon = el('i', 'sh-spot-icon', element);
        var plus = el('span', 'sh-spot-plus', element);
        plus.textContent = '+';
        this._button(element, 'spot', index);
        // The cross is drawn in CSS: the game font has no multiplication sign.
        var clear = el('button', 'sh-spot-clear', element);
        clear.type = 'button';
        this._button(clear, 'clear', index);
        spot = this._spots[index] = { element: element, icon: icon, plus: plus, clear: clear, value: null };
        return spot;
    };

    View.prototype._cell = function (value) {
        var cell = this._cells[value];
        if (cell) return cell;
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var element = el('button', 'iv-item sh-item lui-pop-item');
        element.type = 'button';
        var icon = el('i', 'iv-item-icon sh-item-icon', element);
        var badge = el('i', 'sh-item-badge', element);
        ui.setTexture(badge, ART.check);
        this._button(element, 'item', value);
        cell = this._cells[value] = { element: element, icon: icon, badge: badge, iconSet: false };
        return cell;
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

    // state: see HomeShelves.prototype.buildViewState in HomeShelves.js.
    View.prototype.render = function (state) {
        if (!state) return;
        this.state = state;
        this.titleText.textContent = state.title;
        this.hint.textContent = state.items.length ? state.hint : '';

        state.spots.forEach(function (entry) {
            var spot = this._spot(entry.index);
            spot.element.classList.toggle('is-selected', !!entry.selected);
            spot.element.classList.toggle('is-filled', !!entry.value);
            spot.element.title = entry.name || '';
            spot.clear.title = state.removeLabel;
            spot.clear.hidden = !entry.value;
            spot.plus.hidden = !!entry.value;
            if (spot.value !== entry.value) {
                spot.value = entry.value;
                if (entry.value) state.getIcon(spot.icon, entry.value);
                else spot.icon.style.backgroundImage = '';
                // A prop landing on the shelf bounces in.
                spot.icon.classList.remove('is-landing');
                void spot.icon.offsetWidth;
                if (entry.value) spot.icon.classList.add('is-landing');
            }
        }, this);
        for (var i = state.spots.length; i < this._spots.length; i++) this._spots[i].element.hidden = true;

        var grid = this.grid;
        var wanted = state.items.map(function (item, index) {
            var cell = this._cell(item.value);
            cell.element.style.setProperty('--lui-i', Math.min(index, 20));
            if (!cell.iconSet) {
                state.getIcon(cell.icon, item.value);
                cell.iconSet = true;
            }
            cell.element.classList.toggle('is-selected', !!item.selected);
            cell.element.classList.toggle('is-shown', !!item.shown);
            cell.element.title = item.shown ? item.name + ' — ' + state.onShelfLabel : item.name;
            cell.badge.hidden = !item.shown;
            return cell.element;
        }, this);
        Array.prototype.slice.call(grid.children).forEach(function (child) {
            if (wanted.indexOf(child) === -1) grid.removeChild(child);
        });
        wanted.forEach(function (element, index) {
            if (grid.children[index] !== element) grid.insertBefore(element, grid.children[index] || null);
        });

        this.empty.hidden = state.items.length > 0;
        this.empty.textContent = state.emptyText;
    };

    return View;
}());
