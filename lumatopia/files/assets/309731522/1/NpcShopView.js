// HTML/CSS view of an NPC's shop: Maple buys critters, Finn fish and Piper
// bird photos. An NPC with a collection also has a Collection tab: the catches
// they ask for, how many are handed in, and the costume they give for the lot.
// NpcShop.js keeps the items, prices, sale and hand-ins; this file only draws
// the state it is handed and reports taps back. It borrows the backpack's
// frame, cards and buttons (InventoryPanel.css) and adds its own bits in
// NpcShopPanel.css. One view is shared by every shop NPC.
var NpcShopView = (function () {
    var ART = {
        titleBar: 294877876,
        closeButton: 297366678,
        star: 292481445,
        sellButton: 297737236,
        wearButton: 297737235,
        money: 291824691,
        check: 294850300,
        // The tutorial's pointing hand (frame 0), as on the drone.
        handSprite: 291906229
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
        if (!app._npcShopView) {
            var ui = LumatopiaHtmlUi.get(app);
            ui.useStyle('LumatopiaUi.css');
            ui.useStyle('InventoryPanel.css');
            ui.useStyle('NpcShopPanel.css');
            app._npcShopView = new View(ui);
        }
        return app._npcShopView;
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

        var overlay = this.overlay = el('div', 'iv-overlay ns-overlay', ui.root);
        overlay.hidden = true;
        // A tap on the backdrop leaves the shop.
        overlay.addEventListener('click', function (event) {
            if (event.target === overlay) self._emit('close');
        });
        var win = el('div', 'ns-window lui-pop', overlay);
        var panel = el('div', 'iv-panel ns-panel', win);

        var title = el('div', 'iv-title', win);
        ui.setTexture(title, ART.titleBar);
        this.titleText = el('span', 'iv-title-text lui-outline', title);

        var close = el('button', 'iv-close', win);
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        ui.setTexture(close, ART.closeButton);
        this._button(close, 'close');

        // Collection | Sell, only for an NPC with a collection.
        var tabs = this.tabs = el('div', 'ns-tabs', panel);
        this._tabButtons = {};
        [['collection', ART.star], ['sell', ART.money]].forEach(function (pair) {
            var button = el('button', 'ns-tab', tabs);
            button.type = 'button';
            ui.setTexture(el('i', 'ns-tab-icon', button), pair[1]);
            el('span', 'ns-tab-label', button);
            this._button(button, 'tab', pair[0]);
            this._tabButtons[pair[0]] = button;
        }, this);

        // ---- Collection ------------------------------------------------
        var collect = this.collectPage = el('div', 'ns-page ns-collect', panel);
        var reward = this.reward = el('div', 'ns-reward', collect);
        var art = el('div', 'ns-reward-art', reward);
        this.rewardArt = el('i', 'ns-reward-picture', art);
        this.rewardTag = el('span', 'ns-reward-tag', art);
        var info = el('div', 'ns-reward-info', reward);
        this.rewardName = el('div', 'ns-reward-name lui-outline', info);
        this.rewardLine = el('div', 'ns-reward-line', info);
        // The bar, with the shoes' badge standing on it at the halfway mark.
        var barWrap = el('div', 'ns-progress-wrap', info);
        var bar = el('div', 'ns-progress', barWrap);
        this.progressFill = el('i', 'ns-progress-fill', bar);
        this.progressTick = el('i', 'ns-progress-tick', bar);
        this.progressLabel = el('span', 'ns-progress-label lui-outline', bar);
        var milestone = this.milestone = el('button', 'ns-milestone', barWrap);
        milestone.type = 'button';
        this.milestoneIcon = el('i', 'ns-milestone-icon', milestone);
        this.milestoneTag = el('span', 'ns-milestone-tag lui-outline', milestone);
        ui.setTexture(this.milestoneCheck = el('i', 'ns-milestone-check', milestone), ART.check);
        this._button(milestone, 'wearShoes');
        var wear = this.wearButton = el('button', 'iv-action-button ns-wear', reward);
        wear.type = 'button';
        ui.setTexture(wear, ART.wearButton);
        this.wearText = el('span', 'iv-action-text lui-outline', wear);
        this._button(wear, 'wear');

        this.collectGrid = el('div', 'iv-grid ns-grid ns-collect-grid', collect);
        ui.enableDragScroll(this.collectGrid, 'y');
        this._needCells = {};

        var collectFooter = this.collectFooter = el('div', 'ns-footer', collect);
        this.collectHint = el('div', 'ns-hint', collectFooter);
        var giveAll = this.giveAll = el('button', 'iv-action-button iv-sell ns-give-all', collectFooter);
        giveAll.type = 'button';
        ui.setTexture(giveAll, ART.sellButton);
        this.giveAllText = el('span', 'iv-action-text lui-outline', giveAll);
        this._button(giveAll, 'giveAll');

        // ---- Sell --------------------------------------------------------
        var sell = this.sellPage = el('div', 'ns-page ns-sell', panel);
        this.intro = el('div', 'ns-intro', sell);

        var main = el('div', 'ns-main', sell);
        this.grid = el('div', 'iv-grid ns-grid', main);
        ui.enableDragScroll(this.grid, 'y');
        this.empty = el('div', 'iv-empty', main);

        var footer = el('div', 'ns-footer', sell);
        this.hint = el('div', 'ns-hint', footer);
        var sellAll = this.sellAll = el('button', 'iv-action-button iv-sell ns-sell-all', footer);
        sellAll.type = 'button';
        ui.setTexture(sellAll, ART.sellButton);
        this.sellAllText = el('span', 'iv-action-text lui-outline', sellAll);
        ui.setTexture(el('i', 'iv-money-icon', sellAll), ART.money);
        this.sellAllPrice = el('span', 'iv-action-text lui-outline', sellAll);
        this._button(sellAll, 'sellAll');

        // A quest's hand (Photo for Piper) over the card or tab to tap.
        this.hand = el('i', 'ns-hand', overlay);
        this.hand.hidden = true;
        ui.setSpriteFrame(this.hand, ART.handSprite, 0);
        this._guide = null;
        this._guideFrame = 0;
    };

    // The hand rides on whatever it points at, re-read every frame: the cards
    // pop in, the grid scrolls and the window resizes under it.
    View.prototype._guideTarget = function (guide) {
        if (!guide) return null;
        if (guide.target === 'tab') return this._tabButtons[guide.key] || null;
        if (guide.target === 'need') return this._needCells[guide.key] ? this._needCells[guide.key].element : null;
        if (guide.target === 'item') return this._cells[guide.key] ? this._cells[guide.key].element : null;
        return null;
    };

    View.prototype._setGuide = function (guide) {
        this._guide = guide || null;
        if (!this._guide) {
            this.hand.hidden = true;
            if (this._guideFrame) cancelAnimationFrame(this._guideFrame);
            this._guideFrame = 0;
            return;
        }
        if (!this._guideFrame) this._placeHand();
    };

    View.prototype._placeHand = function () {
        this._guideFrame = 0;
        var target = this.isOpen() ? this._guideTarget(this._guide) : null;
        var rect = target && target.parentNode && !target.closest('[hidden]') ? target.getBoundingClientRect() : null;
        if (!rect || !rect.width) {
            this.hand.hidden = true;
        } else {
            // The fingertip is near the picture's top left, so that corner
            // goes to the middle of the target and the hand hangs below it.
            var size = this.hand.offsetWidth || 0;
            this.hand.hidden = false;
            this.hand.style.left = (rect.left + rect.width * 0.5 - size * 0.18) + 'px';
            this.hand.style.top = (rect.top + rect.height * 0.5 - size * 0.06) + 'px';
        }
        var self = this;
        this._guideFrame = requestAnimationFrame(function () {
            if (self._guide) self._placeHand();
        });
    };

    View.prototype._cell = function (item) {
        var cell = this._cells[item.key];
        if (cell) return cell;
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var element = el('button', 'iv-item ns-item lui-pop-item');
        element.type = 'button';
        var icon = el('i', 'iv-item-icon', element);
        var stars = el('span', 'iv-item-stars', element);
        var count = el('span', 'iv-item-count', element);
        var price = el('span', 'ns-price', element);
        ui.setTexture(el('i', 'ns-price-icon', price), ART.money);
        var priceText = el('span', 'ns-price-text', price);
        this._button(element, 'sell', item.key);
        cell = this._cells[item.key] = { element: element, icon: icon, iconKey: '', stars: stars, starCount: -1, count: count, priceText: priceText };
        return cell;
    };

    // One card per catch the collection asks for: its picture, "given/needed"
    // and how many the player is carrying. Done cards get the check.
    View.prototype._needCell = function (item) {
        var cell = this._needCells[item.key];
        if (cell) return cell;
        var ui = this.ui;
        var el = ui.el.bind(ui);
        var element = el('button', 'iv-item ns-item ns-need lui-pop-item');
        element.type = 'button';
        var icon = el('i', 'iv-item-icon', element);
        var have = el('span', 'iv-item-count', element);
        ui.setTexture(el('i', 'ns-need-check', element), ART.check);
        var label = el('span', 'ns-price ns-need-label', element);
        var labelText = el('span', 'ns-price-text', label);
        this._button(element, 'give', item.key);
        cell = this._needCells[item.key] = { element: element, icon: icon, iconKey: '', have: have, labelText: labelText };
        return cell;
    };

    View.prototype._renderCollection = function (state, previous) {
        var c = state.collection;
        this.rewardName.textContent = c.rewardName;
        this.rewardLine.textContent = c.line;
        this.rewardTag.textContent = c.rewardTag;
        if (this._rewardArtId !== c.rewardArt) {
            this._rewardArtId = c.rewardArt;
            this.ui.setTexture(this.rewardArt, c.rewardArt);
        }
        this.reward.classList.toggle('is-complete', !!c.complete);
        this.progressFill.style.width = Math.round(Math.max(0, Math.min(1, c.progress)) * 100) + '%';
        this.progressLabel.textContent = c.progressLabel;
        var m = c.milestone;
        this.milestone.hidden = !m;
        this.progressTick.hidden = !m;
        this.progressLabel.classList.toggle('has-milestone', !!m);
        if (m) {
            var left = Math.round(m.at * 1000) / 10 + '%';
            this.milestone.style.left = left;
            this.progressTick.style.left = left;
            this.milestoneIconKey = this._setIcon(this.milestoneIcon, m.icon, this.milestoneIconKey);
            this.milestone.classList.toggle('is-unlocked', !!m.unlocked);
            this.milestone.disabled = !m.canWear;
            this.milestone.title = m.title;
            this.milestoneTag.textContent = m.label;
            this.milestoneTag.hidden = !m.label;
            this.milestoneCheck.hidden = !m.unlocked;
        }
        this.wearButton.hidden = !c.showWear;
        this.wearButton.disabled = !c.canWear;
        this.wearText.textContent = c.wearLabel;

        var grid = this.collectGrid;
        var wanted = c.items.map(function (item, index) {
            var cell = this._needCell(item);
            cell.element.style.setProperty('--lui-i', Math.min(index, 20));
            cell.iconKey = this._setIcon(cell.icon, item.icon, cell.iconKey);
            cell.element.classList.toggle('is-done', !!item.done);
            cell.element.classList.toggle('is-ready', !!item.ready);
            cell.element.disabled = !item.ready;
            cell.element.title = item.name;
            cell.have.textContent = item.have > 0 ? 'x' + item.have : '';
            cell.have.hidden = !(item.have > 0) || item.done;
            cell.labelText.textContent = item.label;
            return cell.element;
        }, this);
        Array.prototype.slice.call(grid.children).forEach(function (child) {
            if (wanted.indexOf(child) === -1) grid.removeChild(child);
        });
        wanted.forEach(function (element, index) {
            if (grid.children[index] !== element) grid.insertBefore(element, grid.children[index] || null);
        });
        if (!previous || previous.shopKey !== state.shopKey) grid.scrollTop = 0;

        this.collectFooter.hidden = !!c.complete;
        this.collectHint.textContent = c.hint;
        this.giveAll.hidden = !!c.complete;
        this.giveAll.disabled = !c.canGiveAll;
        this.giveAllText.textContent = c.giveAllLabel;
    };

    // The shoes' badge pops at the halfway mark.
    View.prototype.celebrateMilestone = function () {
        var badge = this.milestone;
        badge.classList.remove('is-celebrating');
        void badge.offsetWidth;
        badge.classList.add('is-celebrating');
    };

    // The costume pops when the last catch is handed in.
    View.prototype.celebrate = function () {
        var reward = this.reward;
        reward.classList.remove('is-celebrating');
        void reward.offsetWidth;
        reward.classList.add('is-celebrating');
    };

    View.prototype._setIcon = function (element, icon, current) {
        var key = !icon ? '' : (icon.sprite ? 's' + icon.sprite + ':' + icon.frame : 't' + icon.texture);
        if (current === key) return key;
        element.style.backgroundImage = '';
        element.style.backgroundSize = '';
        element.style.backgroundPosition = '';
        if (icon && icon.sprite) this.ui.setSpriteFrame(element, icon.sprite, icon.frame);
        else if (icon && icon.texture) this.ui.setTexture(element, icon.texture);
        return key;
    };

    View.prototype._setStars = function (container, count, current) {
        if (current === count) return count;
        container.textContent = '';
        for (var i = 0; i < count; i++) this.ui.setTexture(this.ui.el('i', 'iv-star', container), ART.star);
        return count;
    };

    View.prototype.show = function () {
        this.ui.showPanel(this.overlay);
    };

    View.prototype.hide = function () {
        this._setGuide(null);
        this.ui.hidePanel(this.overlay);
    };

    View.prototype.isOpen = function () {
        return this.ui.isPanelOpen(this.overlay);
    };

    // state: see NpcShop.prototype.buildViewState in NpcShop.js.
    View.prototype.render = function (state) {
        if (!state) return;
        var previous = this.state;
        this.state = state;
        this.titleText.textContent = state.title;
        this.intro.textContent = state.intro;

        var tab = state.collection ? state.tab : 'sell';
        this.tabs.hidden = !state.collection;
        if (state.collection) {
            state.tabs.forEach(function (entry) {
                var button = this._tabButtons[entry.id];
                if (!button) return;
                button.classList.toggle('is-active', entry.id === tab);
                button.querySelector('.ns-tab-label').textContent = entry.label;
            }, this);
            this._renderCollection(state, previous);
        }
        this.collectPage.hidden = tab !== 'collection';
        this.sellPage.hidden = tab !== 'sell';

        var grid = this.grid;
        var wanted = state.items.map(function (item, index) {
            var cell = this._cell(item);
            cell.element.style.setProperty('--lui-i', Math.min(index, 20));
            cell.iconKey = this._setIcon(cell.icon, item.icon, cell.iconKey);
            cell.starCount = this._setStars(cell.stars, item.stars, cell.starCount);
            cell.count.textContent = item.quantity > 1 ? 'x' + item.quantity : '';
            cell.count.hidden = !(item.quantity > 1);
            cell.priceText.textContent = item.price;
            return cell.element;
        }, this);
        Array.prototype.slice.call(grid.children).forEach(function (child) {
            if (wanted.indexOf(child) === -1) grid.removeChild(child);
        });
        wanted.forEach(function (element, index) {
            if (grid.children[index] !== element) grid.insertBefore(element, grid.children[index] || null);
        });
        var live = {};
        state.items.forEach(function (item) { live[item.key] = true; });
        Object.keys(this._cells).forEach(function (key) { if (!live[key]) delete this._cells[key]; }, this);
        if (!previous || previous.shopKey !== state.shopKey) grid.scrollTop = 0;

        this.empty.hidden = state.items.length > 0;
        this.empty.textContent = state.emptyText;
        this.hint.textContent = state.items.length > 0 ? state.hint : '';
        this.sellAll.hidden = state.items.length === 0;
        this.sellAllText.textContent = state.sellAllLabel;
        this.sellAllPrice.textContent = state.total;
        this._setGuide(state.guide || null);
    };

    return View;
}());
