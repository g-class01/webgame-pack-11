// The island's song pick for the phone's Minigames (Minigames.js): Music Beach's own song select (game-flow.mjs on the
// beach), drawn the same - the same sprites, so picking a song on the island looks as it does there. The songs as a
// carousel of vinyl records across the middle (the middle one big, its cover turning, the tonearm on it, its preview
// playing), under it the song's BPM, length and her best, her difficulty and mode, and START; Pick a song and back in the
// corner. No panel over the world: the lettering sits on the scene on soft fades. START queues her (Minigames.join).
//
// Arrows, the wheel or a swipe turn the carousel; a tap on a side record brings it to the middle, a tap on the middle
// one (or Enter, Space, START) starts it; Esc or back closes. Its styles: MinigameSongs.css (sizes in design pixels at
// 1280x720, --u, like the beach's).
//
// A plain global, not a script: Minigames.js makes one and opens it.
var MinigameSongs = (function () {
    // each record's place by how far it is from the middle one: its distance and its size (the beach's CAROUSEL)
    var CAROUSEL = [{ x: 0, s: 1 }, { x: 250, s: 0.64 }, { x: 420, s: 0.44 }, { x: 520, s: 0 }];
    var WHEEL_STEP = 60;            // wheel delta that turns the carousel by one record
    var SWIPE_PX = 40;
    var PREVIEW_WAIT_MS = 250;      // a record stays in the middle this long before its preview loads
    var PREVIEW_FADE = 0.3;         // seconds a preview takes to fade out
    var PREVIEW_VOLUME = 0.7;

    // the beach's sprites (ui-skin.mjs names: UI/Mix, UI/Vivid, UI/Glossy, UI/Jackets; their UI/L10n copies)
    var S = {
        vinyl: 'mx_vinyl', vinylSel: 'mx_vinyl_sel', cap: 'mx_vinyl_cap', arm: 'mx_tonearm', start: 'mx_btn_start_wide',
        back: 'dt_btn_back', pick: 'vv_lbl_pick', bpm: 'vv_cap_bpm', isNew: 'dt_tag_new', fadeCorner: 'vv_fade_corner',
        fadeBlob: 'vv_fade_blob', track: 'dt_toggle_track', knob: 'dt_pill_pink_ears',
        caption: function (name) { return 'vv_cap_' + name; },
        arc: function (id) { return 'mx_arc_' + id; },
        title: function (id) { return 'vv_title_' + id; },
        jacket: function (id) { return 'jacket_' + id; },
        grade: function (grade) { return 'dt_grade_' + ({ 'S+': 'splus', S: 's', A: 'a', B: 'b', C: 'c', D: 'd' }[grade] || 'd'); },
        digit: function (ch) { return { ':': 'num_colon', ',': 'num_comma', '.': 'num_dot' }[ch] || 'num_' + ch; }
    };
    var BEST_KEY = 'dancetopia.best';      // the beach's best scores (this browser's): song|difficulty[|tap]

    function mmss(seconds) {
        var s = Math.round(seconds);
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    function hue(id) {
        var h = 0;
        for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
        return h % 360;
    }

    function View(app, handlers) {
        this.app = app;
        this.handlers = handlers || {};
        this.songs = [];
        this.selected = 0;
        this.difficulty = 'easy';
        this.mode = 'tap';
        this._open = false;
        this._preview = { id: null, playing: null, assets: [], timer: 0 };
        this._build();
        var self = this;
        this._onKey = function (e) { self._key(e); };
        this._onResize = function () { self._resize(); };
    }

    // a sprite's url: its version in the player's language when there is one
    View.prototype.url = function (name) {
        var assets = this.app.assets;
        var lang = String((this.app.i18n && this.app.i18n.locale) || 'en').split('-')[0].toLowerCase();
        var asset = (lang !== 'en' && assets.find(name + '.' + lang + '.webp', 'texture')) || assets.find(name + '.webp', 'texture');
        var file = asset && asset.getFileUrl();
        return file ? new URL(file, window.location.href).href : '';
    };

    View.prototype._img = function (name, className, alt) {
        var img = document.createElement('img');
        img.className = className || '';
        img.alt = alt || '';
        var src = name ? this.url(name) : '';
        if (src) img.src = src;
        return img;
    };

    View.prototype._el = function (tag, className, parent) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (parent) parent.appendChild(el);
        return el;
    };

    // a number in the white sprite digits
    View.prototype._num = function (text) {
        var span = this._el('span', 'mgs-num');
        span.setAttribute('aria-label', text);
        for (var i = 0; i < text.length; i++) {
            var img = this._img(S.digit(text[i]));
            if (text[i] === ':' || text[i] === ',') img.className = 'g-mid';
            span.appendChild(img);
        }
        return span;
    };

    View.prototype._build = function () {
        var self = this;
        var el = this._el.bind(this);
        var root = this.root = el('div', 'mgs-root mgs-hidden');
        // the sprites the CSS draws (border-image, backgrounds)
        [['vinyl', S.vinyl], ['vinyl_sel', S.vinylSel], ['fade_corner', S.fadeCorner], ['fade_blob', S.fadeBlob],
            ['toggle_track', S.track], ['toggle_knob', S.knob]].forEach(function (pair) {
            root.style.setProperty('--s-' + pair[0], 'url("' + self.url(pair[1]) + '")');
        });

        var head = el('div', 'mgs-head', root);
        var back = el('button', 'mgs-sprite mgs-back', head);
        back.type = 'button';
        back.setAttribute('aria-label', 'Back');
        back.appendChild(this._img(S.back));
        back.addEventListener('click', function () { self._emit('close'); });
        this.headText = this._img(S.pick, 'mgs-head-text', 'Pick a song');
        head.appendChild(this.headText);

        var bottom = el('div', 'mgs-bottom', root);
        var carousel = el('div', 'mgs-carousel', bottom);
        var cards = this.cardsEl = el('div', 'mgs-cards', carousel);
        this.armEl = this._img(S.arm, 'mgs-arm');
        carousel.appendChild(this.armEl);
        cards.addEventListener('pointerdown', function (e) {
            self._downX = e.clientX;
            self._swiped = false;
        });
        cards.addEventListener('pointerup', function (e) {
            if (self._downX === undefined) return;
            var dx = e.clientX - self._downX;
            self._downX = undefined;
            if (Math.abs(dx) < SWIPE_PX) return;
            self._swiped = true;
            self.select(self.selected + (dx < 0 ? 1 : -1));
        });
        root.addEventListener('wheel', function (e) { self._wheel(e); }, { passive: false });

        var below = el('div', 'mgs-below', bottom);
        var focus = this.focusEl = el('div', 'mgs-focus', below);
        this.focusSubEl = el('span', 'mgs-focus-sub', focus);
        this.bestEl = el('span', 'mgs-best mgs-hidden', focus);
        this.newEl = this._img(S.isNew, 'mgs-new mgs-hidden', 'New!');
        focus.appendChild(this.newEl);

        var row = el('div', 'mgs-diff-row', below);
        var toggle = function (options, pick) {
            var box = el('div', 'mgs-diff', row);
            el('span', 'mgs-diff-knob', box);
            options.forEach(function (option) {
                var b = el('button', '', box);
                b.type = 'button';
                b.setAttribute('data-value', option[0]);
                b.appendChild(self._img(S.caption(option[1]), 'mgs-cap', option[1].toUpperCase()));
                b.addEventListener('click', function () { pick(option[0]); });
            });
            return box;
        };
        this.diffEl = toggle([['easy', 'easy'], ['hard', 'hard']], function (v) { self.setDifficulty(v); });
        this.modeEl = toggle([['tap', 'tap'], ['bar', 'arrows']], function (v) { self.setMode(v); });

        var start = el('button', 'mgs-sprite mgs-start', below);
        start.type = 'button';
        start.setAttribute('aria-label', 'Start');
        start.appendChild(this._img(S.start));
        start.addEventListener('click', function () { self.start(); });

        document.body.appendChild(root);
    };

    View.prototype._emit = function (name, value) {
        var handler = this.handlers[name];
        if (typeof handler === 'function') handler(value);
    };

    View.prototype.isOpen = function () {
        return this._open;
    };

    /** Up with `songs` ([{ id, title, bpm, duration }]), her `difficulty` and `mode`, `selected` (a song id) in the middle. */
    View.prototype.open = function (options) {
        this.songs = options.songs || [];
        this.difficulty = options.difficulty === 'hard' ? 'hard' : 'easy';
        this.mode = options.mode === 'bar' ? 'bar' : 'tap';
        var at = this.songs.map(function (s) { return s.id; }).indexOf(options.selected);
        this.selected = at >= 0 ? at : Math.min(this.selected, Math.max(0, this.songs.length - 1));
        this.best = this._loadBest();
        this.headText.src = this.url(S.pick);
        this._renderSongs();
        this._renderToggles();
        this._open = true;
        this.root.classList.remove('mgs-hidden');
        this._resize();
        window.addEventListener('keydown', this._onKey, true);
        window.addEventListener('resize', this._onResize);
    };

    View.prototype.close = function () {
        if (!this._open) return;
        this._open = false;
        this.root.classList.add('mgs-hidden');
        window.removeEventListener('keydown', this._onKey, true);
        window.removeEventListener('resize', this._onResize);
        this._closePreview();
    };

    View.prototype.destroy = function () {
        this.close();
        if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
    };

    View.prototype.start = function () {
        var song = this.songs[this.selected];
        if (!song) return;
        this._emit('start', { song: song.id, difficulty: this.difficulty, mode: this.mode });
    };

    View.prototype.setDifficulty = function (value) {
        this.difficulty = value === 'hard' ? 'hard' : 'easy';
        this._renderToggles();
        this._showFocus();
        this._emit('difficulty', this.difficulty);
    };

    View.prototype.setMode = function (value) {
        this.mode = value === 'bar' ? 'bar' : 'tap';
        this._renderToggles();
        this._showFocus();
        this._emit('mode', this.mode);
    };

    View.prototype._renderToggles = function () {
        var set = function (box, value) {
            box.setAttribute('data-on', box.querySelector('button').getAttribute('data-value') === value ? 'first' : 'second');
            box.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-value') === value); });
        };
        set(this.diffEl, this.difficulty);
        set(this.modeEl, this.mode);
    };

    // the records: each its cover in the hole (turning while it's the middle one), its title bent round the top
    View.prototype._renderSongs = function () {
        var self = this;
        while (this.cardsEl.firstChild) this.cardsEl.removeChild(this.cardsEl.firstChild);
        this.songs.forEach(function (song, i) {
            var card = self._el('button', 'mgs-card', self.cardsEl);
            card.type = 'button';
            card.style.setProperty('--hue', String(hue(song.id)));
            card.setAttribute('aria-label', song.title);
            var art = self._el('span', 'mgs-vinyl-art', card);
            var jacket = self._img(S.jacket(song.id), 'mgs-jacket');
            if (jacket.src) art.appendChild(jacket);
            self._el('span', 'mgs-vinyl-disc', card);
            var arc = self.url(S.arc(song.id));
            if (arc) {
                var bent = self._img(null, 'mgs-vinyl-title', song.title);
                bent.src = arc;
                card.appendChild(bent);
            } else {
                var flat = self.url(S.title(song.id));
                var title = flat ? self._img(S.title(song.id), 'mgs-vinyl-title-flat', song.title) : self._el('span', 'mgs-vinyl-title-flat mgs-title-text');
                if (!flat) title.textContent = song.title;
                card.appendChild(title);
            }
            card.appendChild(self._img(S.cap, 'mgs-vinyl-cap'));
            card.addEventListener('click', function () {
                if (self._swiped) return;           // (the end of a swipe, not a tap)
                if (self.selected === i) self.start();
                else self.select(i);
            });
        });
        this.select(this.selected, true);
    };

    // `instant`: no glide (just opened)
    View.prototype.select = function (i, instant) {
        var n = this.songs.length;
        if (!n) return;
        var next = ((i % n) + n) % n;
        var changed = next !== this.selected;
        this.selected = next;
        var cards = this.cardsEl.children;
        var far = CAROUSEL.length - 1;
        for (var c = 0; c < cards.length; c++) {
            var el = cards[c];
            if (el.classList.contains('mgs-ghost')) continue;
            var k = (c - this.selected + n) % n;
            if (k > n / 2) k -= n;
            // one that wraps round doesn't glide across: a copy shrinks away where it was, it grows in at the other end
            var wrap = !instant && el._k !== undefined && Math.abs(el._k - k) > 1;
            if (wrap && Math.abs(el._k) < far) this._shrinkAway(el, el._k);
            el._k = k;
            if (instant || wrap) {
                el.style.transition = 'none';
                this._place(el, k, wrap);
                void el.offsetWidth;
                el.style.transition = '';
            }
            this._place(el, k);
            el.classList.toggle('holo', k === 0);
        }
        this._showFocus();
        this._wantPreview(this.songs[this.selected].id);
        if (changed || instant) {
            this.armEl.classList.remove('mgs-arm-drop');
            void this.armEl.offsetWidth;
            this.armEl.classList.add('mgs-arm-drop');     // the tonearm lifts and drops onto the new record
        }
    };

    View.prototype._place = function (el, k, gone) {
        var step = CAROUSEL[Math.min(Math.abs(k), CAROUSEL.length - 1)];
        el.style.setProperty('--x', String(Math.sign(k) * step.x));
        el.style.setProperty('--s', String(gone ? 0 : step.s));
        el.style.zIndex = String(10 - Math.abs(k));
        el.classList.toggle('on', k === 0);
        el.classList.toggle('far', !!gone || Math.abs(k) >= CAROUSEL.length - 1);
    };

    View.prototype._shrinkAway = function (el, k) {
        var ghost = el.cloneNode(true);
        ghost.classList.add('mgs-ghost');
        this.cardsEl.appendChild(ghost);
        void ghost.offsetWidth;
        this._place(ghost, k, true);
        ghost.style.zIndex = '0';
        setTimeout(function () { if (ghost.parentNode) ghost.parentNode.removeChild(ghost); }, 300);
    };

    // the middle record's BPM and length, and her best on this difficulty and mode (or New!)
    View.prototype._showFocus = function () {
        var song = this.songs[this.selected];
        var sub = this.focusSubEl;
        while (sub.firstChild) sub.removeChild(sub.firstChild);
        if (!song) return;
        if (song.bpm) {
            sub.appendChild(this._num(String(Math.round(song.bpm))));
            sub.appendChild(this._img(S.bpm, 'mgs-sub-bpm', 'BPM'));
        }
        if (song.duration) sub.appendChild(this._num(mmss(song.duration)));
        var key = song.id + '|' + this.difficulty + (this.mode === 'tap' ? '|tap' : '');
        var best = this.best && this.best[key];
        this.bestEl.classList.toggle('mgs-hidden', !best);
        this.newEl.classList.toggle('mgs-hidden', !!best);
        while (this.bestEl.firstChild) this.bestEl.removeChild(this.bestEl.firstChild);
        if (!best) return;
        this.bestEl.appendChild(this._img(S.grade(best.grade), 'mgs-grade', best.grade));
        this.bestEl.appendChild(this._num(Number(best.score || 0).toLocaleString('en-US')));
    };

    View.prototype._loadBest = function () {
        try {
            return JSON.parse(window.localStorage.getItem(BEST_KEY)) || {};
        } catch (e) {
            return {};
        }
    };

    View.prototype._wheel = function (e) {
        if (!this._open) return;
        e.preventDefault();
        this._wheelSum = (this._wheelSum || 0) + (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
        var now = performance.now();
        if (Math.abs(this._wheelSum) < WHEEL_STEP || now - (this._wheelAt || 0) < 110) return;
        this._wheelAt = now;
        this.select(this.selected + Math.sign(this._wheelSum));
        this._wheelSum = 0;
    };

    // keys here first (capture): the world doesn't walk or jump on them while the songs are up
    View.prototype._key = function (e) {
        if (!this._open) return;
        var k = e.code || e.key;
        var eat = function () {
            e.preventDefault();
            e.stopPropagation();
        };
        if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyA' || k === 'KeyD') {
            eat();
            this.select(this.selected + (k === 'ArrowLeft' || k === 'KeyA' ? -1 : 1));
        } else if (k === 'Enter' || k === 'Space') {
            eat();
            if (!e.repeat) this.start();
        } else if (k === 'Escape') {
            eat();
            this._emit('close');
        } else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'KeyW' || k === 'KeyS' || k === 'Tab') {
            eat();
        }
    };

    View.prototype._resize = function () {
        var u = Math.min(1.3, Math.max(0.55, Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
        this.root.style.setProperty('--u', u + 'px');
        // on phones Poki's button sits in the top left corner: the back button starts right of it (as on the beach)
        var layout = this.app.hudLayout, Hud = window.HudLayout;
        var phone = layout && layout.isTouchPhone ? layout.isTouchPhone() : !!(this.app.touch && pc.platform.mobile);
        var pill = phone ? ((Hud && Hud.pillSize ? Hud.pillSize(window.innerWidth).width : 54) + (Hud && Hud.PILL_GAP_PX || 8)) : 0;
        this.root.style.setProperty('--pill', pill + 'px');
    };

    // ---- the middle record's preview (preview_<id>: the beach's), looping quietly; every clip unloaded on close
    View.prototype._wantPreview = function (id) {
        var p = this._preview;
        if (id === p.id) return;
        p.id = id;
        clearTimeout(p.timer);
        var self = this;
        p.timer = setTimeout(function () { self._startPreview(id); }, PREVIEW_WAIT_MS);
    };

    View.prototype._startPreview = function (id) {
        var p = this._preview;
        if (!this._open || (p.playing && p.playing.id === id)) return;
        this._fadePreview();
        var asset = id && this.app.assets.find('preview_' + id, 'audio');
        if (!asset) return;
        if (p.assets.indexOf(asset) === -1) p.assets.push(asset);
        var self = this;
        asset.ready(function () {
            if (p.assets.indexOf(asset) === -1) return asset.unload();     // (closed while it loaded)
            var manager = self.app.systems.sound && self.app.systems.sound.manager;
            if (!self._open || p.id !== id || (p.playing && p.playing.id === id) || !manager) return;
            p.playing = { id: id, instance: new pc.SoundInstance(manager, asset.resource, { volume: PREVIEW_VOLUME, loop: true }) };
            p.playing.instance.play();
        });
        if (!asset.loaded) this.app.assets.load(asset);
    };

    View.prototype._fadePreview = function () {
        var p = this._preview;
        var inst = p.playing && p.playing.instance;
        p.playing = null;
        if (!inst) return;
        var v = inst.volume;
        var t0 = performance.now();
        var tick = function () {
            var k = Math.min(1, (performance.now() - t0) / (PREVIEW_FADE * 1000));
            inst.volume = v * (1 - k);
            if (k < 1) requestAnimationFrame(tick);
            else inst.stop();
        };
        tick();
    };

    View.prototype._closePreview = function () {
        var p = this._preview;
        clearTimeout(p.timer);
        p.id = null;
        this._fadePreview();
        p.assets.forEach(function (asset) { asset.unload(); });
        p.assets = [];
    };

    return View;
}());
