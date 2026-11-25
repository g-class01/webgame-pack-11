// HTML/CSS view of the balloon build site's panel (BalloonProject.js decides
// what it shows and does the giving; this file only draws the state it is
// handed and reports the clicks). It sits at the right of the screen with no
// backdrop, so the site stays in view: the balloon's progress for everyone,
// then wood, stone and coins, each with how much has come in, what the player
// has and the buttons to give. The frame is the backpack's (InventoryPanel.css);
// BalloonSitePanel.css places the window and draws the rows.
//
// The trophy at the window's top-left corner (2026-11-04) turns the panel to
// the builders' ranking: the top ten, best first (medals for the first three),
// each with what they gave and their points, and the player's own place under
// them when they are not in it. Shown only while state.ranking is there.
var BalloonSiteView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        button: 297737234,
        backButton: 297737235,                  // the blue button (180 x 85)
        trophyButton: 314324096,                // BalloonTrophyButton.png (HtmlUi)
        medals: [313411652, 313411653, 313411654]   // rank_1..3.webp: gold, silver, bronze
    };

    function View(ui) {
        this.ui = ui;
        this.handlers = {};
        this.state = null;
        this._build();
    }

    View.ART = ART;

    View.get = function (app) {
        if (!app._balloonSiteView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('BalloonSitePanel.css');
            app._balloonSiteView = new View(ui);
        }
        return app._balloonSiteView;
    };

    View.prototype.setHandlers = function (handlers) {
        this.handlers = handlers || {};
    };

    View.prototype._emit = function (name, value) {
        var handler = this.handlers[name];
        if (typeof handler === 'function') handler(value);
    };

    View.prototype._button = function (className, parent, art, onClick) {
        var button = this.ui.el('button', className, parent);
        button.type = 'button';
        if (art) this.ui.setTexture(button, art);
        button.addEventListener('click', function (event) {
            event.stopPropagation();
            if (!button.disabled) onClick();
        });
        return button;
    };

    View.prototype._build = function () {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var self = this;

        // A click beside the window closes it; the overlay itself is clear.
        var overlay = this.overlay = el('div', 'iv-overlay bs-overlay', ui.root);
        overlay.hidden = true;
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'bs-window lui-pop', overlay);
        var panel = el('div', 'iv-panel bs-panel', win);

        var title = el('div', 'iv-title bs-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = this._button('iv-close bs-close', win, ART.closeButton, function () { self._emit('close'); });
        close.setAttribute('aria-label', 'Close');

        this.trophy = this._button('bs-trophy', win, ART.trophyButton, function () { self._emit('trophy'); });
        this.trophy.hidden = true;

        // The giving page.
        var give = this.givePage = el('div', 'bs-page bs-give-page', panel);
        this.intro = el('div', 'bs-intro', give);
        var total = el('div', 'bs-total', give);
        this.totalFill = el('i', 'bs-total-fill', total);
        this.totalText = el('span', 'bs-total-text lui-outline', total);
        this.rowsElement = el('div', 'bs-rows', give);
        this.gave = el('div', 'bs-gave', give);
        this.rows = {};

        // The ranking page.
        var ranks = this.rankPage = el('div', 'bs-page bs-rank-page', panel);
        this.rankBuilders = el('div', 'bs-rank-builders', ranks);
        this.rankList = el('div', 'bs-rank-list', ranks);
        ui.enableDragScroll(this.rankList, 'y');
        this.rankNote = el('div', 'bs-rank-note', ranks);
        this.rankMine = el('div', 'bs-rank-mine', ranks);
        this.rankBack = this._button('bs-rank-back', ranks, ART.backButton, function () { self._emit('back'); });
        this._rankKey = '';
        this._mineKey = '';
    };

    View.prototype._row = function (id) {
        var row = this.rows[id];
        if (row) return row;
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var root = el('div', 'bs-row', this.rowsElement);
        row = this.rows[id] = { root: root, iconId: 0, buttonsKey: '' };
        row.icon = el('i', 'bs-icon', root);
        var main = el('div', 'bs-main', root);
        var head = el('div', 'bs-head', main);
        row.name = el('span', 'bs-name', head);
        row.count = el('span', 'bs-count', head);
        row.fill = el('i', 'bs-fill', el('span', 'bs-bar', main));
        var foot = el('div', 'bs-foot', main);
        row.have = el('span', 'bs-have', foot);
        row.buttons = el('div', 'bs-buttons', foot);
        return row;
    };

    // One line of the ranking: the place (a medal for the first three), the
    // name and what they gave, and the points.
    View.prototype._rankRow = function (data, parent, index, pointsLabel) {
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var root = el('div', 'bs-rank-row lui-pop-item', parent);
        root.style.setProperty('--lui-i', String(index));
        root.classList.toggle('bs-rank-you', !!data.you);
        var badge = el('span', 'bs-rank-badge', root);
        var medal = data.rank >= 1 && data.rank <= ART.medals.length ? ART.medals[data.rank - 1] : 0;
        if (medal) {
            badge.classList.add('bs-rank-medal');
            ui.setTexture(badge, medal);
            badge.setAttribute('aria-label', data.rankText);
        } else {
            badge.textContent = data.rankText;
        }
        var main = el('div', 'bs-rank-main', root);
        el('span', 'bs-rank-name', main).textContent = data.name;
        var gave = el('span', 'bs-rank-gave', main);
        data.gave.forEach(function (part) {
            var item = el('span', 'bs-rank-part', gave);
            var icon = el('i', 'bs-rank-icon', item);
            if (part.icon) ui.setTexture(icon, part.icon);
            el('span', '', item).textContent = part.text;
        });
        var score = el('div', 'bs-rank-score', root);
        el('b', '', score).textContent = data.score;
        el('small', '', score).textContent = pointsLabel;
        return root;
    };

    View.prototype._renderRanking = function (ranking) {
        var self = this;
        this.trophy.setAttribute('aria-label', ranking.title);
        this.rankBuilders.textContent = ranking.builders || '';
        this.rankBuilders.hidden = !ranking.builders;
        var note = ranking.loading ? ranking.loadingText : (ranking.empty || ranking.join || '');
        this.rankNote.textContent = note;
        this.rankNote.hidden = !note;
        this.rankBack.textContent = ranking.backLabel;
        // Rebuilt only when it changed: a rebuilt line plays its entrance again.
        var key = JSON.stringify(ranking.rows) + '|' + ranking.pointsLabel;
        if (key !== this._rankKey) {
            this._rankKey = key;
            this.rankList.textContent = '';
            ranking.rows.forEach(function (row, index) {
                self._rankRow(row, self.rankList, index, ranking.pointsLabel);
            });
        }
        this.rankList.hidden = !ranking.rows.length;
        var mineKey = JSON.stringify(ranking.mine) + '|' + ranking.pointsLabel;
        if (mineKey !== this._mineKey) {
            this._mineKey = mineKey;
            this.rankMine.textContent = '';
            if (ranking.mine) this._rankRow(ranking.mine, this.rankMine, 0, ranking.pointsLabel);
        }
        this.rankMine.hidden = !ranking.mine;
    };

    View.prototype.render = function (state) {
        this.state = state;
        var ranking = state.ranking || null;
        var ranked = !!(ranking && ranking.open);
        this.titleText.textContent = ranked ? ranking.title : state.title;
        this.overlay.classList.toggle('bs-ranking', ranked);
        this.trophy.hidden = !ranking;
        this.trophy.classList.toggle('bs-trophy-on', ranked);
        if (ranking) this._renderRanking(ranking);

        // The thanks after giving take the intro's place.
        this.intro.textContent = state.message || state.intro;
        this.intro.classList.toggle('bs-thanks', !!state.message);
        this.totalFill.style.width = (Math.max(0, Math.min(1, state.percent)) * 100).toFixed(1) + '%';
        this.totalText.textContent = state.percentText;
        this.overlay.classList.toggle('bs-done', !!state.done);
        var self = this;
        state.rows.forEach(function (data) {
            var row = self._row(data.id);
            if (row.iconId !== data.icon) {
                row.iconId = data.icon;
                self.ui.setTexture(row.icon, data.icon);
            }
            row.name.textContent = data.name;
            row.count.textContent = data.count;
            row.fill.style.width = (data.fill * 100).toFixed(1) + '%';
            row.root.classList.toggle('bs-full', !!data.full);
            row.have.textContent = data.have;
            var key = JSON.stringify(data.buttons);
            if (key === row.buttonsKey) return;
            row.buttonsKey = key;
            row.buttons.textContent = '';
            data.buttons.forEach(function (button) {
                var element = self.ui.el('button', 'bs-give', row.buttons);
                element.type = 'button';
                element.textContent = button.label;
                element.disabled = !button.enabled;
                self.ui.setTexture(element, ART.button);
                element.addEventListener('click', function (event) {
                    event.stopPropagation();
                    if (!element.disabled) self._emit('give', { kind: button.kind, amount: button.amount });
                });
            });
        });
        this.gave.textContent = state.gave || '';
        this.gave.hidden = !state.gave;
        this.overlay.classList.toggle('bs-busy', !!state.busy);
    };

    View.prototype.open = function () {
        this.ui.showPanel(this.overlay);
    };

    View.prototype.close = function () {
        this.ui.hidePanel(this.overlay);
    };

    View.prototype.isOpen = function () {
        return this.ui.isPanelOpen(this.overlay);
    };

    return View;
})();
