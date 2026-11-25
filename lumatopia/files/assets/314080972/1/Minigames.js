var Minigames = pc.createScript('minigames');

// The phone's Minigames (a page on the phone: Phone.js, PhoneView.js): Music Beach's dance show and fashion show, as
// square tiles, queued for from anywhere on the island. The dance show's tile opens the beach's song pick (the records:
// MinigameSongs.js), whose START queues her; the fashion show's queues her at once (as FASHION does on the beach).
// She plays on while the game's queue looks for players - the same queues as
// on the beach (the server's dance/DancetopiaQueueRoom.js and DancetopiaFashionQueueRoom.js), joined with `travel`
// so the show waits for her - and a pill at the top shows the wait (Play solo, Cancel). Once matched she travels to
// the beach with her seat (app.minigameTicket, which the beach's game flow takes: game-flow.mjs _takeTicket) and goes
// straight into the show; after it she comes back to where she was (BeachGate.arrive).
//
// Only while Music Beach is open (LiveOps 'musicBeach'). The songs are the beach's (songs.json, those with music), with
// their jackets; her difficulty is kept here, her mode (tap or arrows) with the beach's own pick (dancetopia.mode).
//
// The pill is HTML (its styles: Minigames.css). Put this on Root.

Minigames.MAX_DANCERS = 6;
Minigames.MAX_MODELS = 8;
Minigames.DIFFICULTY_KEY = 'lumatopia.minigames.difficulty';
Minigames.MODE_KEY = 'dancetopia.mode';
Minigames.NOTE_MS = 2200;       // a note on the pill ("Try again") stays this long
Minigames.GO_MS = 900;          // "Show found!" stays this long before the trip
Minigames.QUEUES = { dance: 'dancetopia_queue', fashion: 'dancetopia_fashion_queue' };
// the tiles' pictures on the phone's Minigames page (HtmlUi/Minigames)
Minigames.TILE_ART = { dance: 314082398, fashion: 314082441 };

Minigames.prototype.initialize = function () {
    this.app.minigames = this;
    this.difficulty = this.load(Minigames.DIFFICULTY_KEY) === 'hard' ? 'hard' : 'easy';
    this.mode = this.load(Minigames.MODE_KEY) === 'bar' ? 'bar' : 'tap';
    this.songs = null;              // [{ id, title, bpm, duration }] once songs.json is in
    this.songsView = null;          // the song pick (MinigameSongs), made the first time it opens
    this._lock = null;              // what the song pick locked (the player, the mouse, the HUD)
    this._songsLoading = false;
    this._queue = null;             // { kind, song, room, count, at, queuedAt, canSolo, soloAsked, found }
    this._note = null;              // { text, until }
    this._tick = 0;
    this._pillKey = '';
    this.buildPill();
    this.on('destroy', function () {
        // the scene going without a match (a trip through the gate, say): out of the queue
        var q = this._queue;
        this._queue = null;
        if (q && !q.found && q.room) q.room.leave();
        this.closeSongs({ quiet: true });
        if (this.songsView) this.songsView.destroy();
        if (this.pill && this.pill.parentNode) this.pill.parentNode.removeChild(this.pill);
        if (this.app.minigames === this) this.app.minigames = null;
    }, this);
};

/* --- What can be done ----------------------------------------------------- */

Minigames.prototype.isAvailable = function () {
    if (typeof DanceTravel === 'undefined') return false;
    return typeof LiveOps === 'undefined' || LiveOps.isOn(this.app, 'musicBeach');
};

Minigames.prototype.canTravel = function () {
    return this.isAvailable() && !DanceTravel.busy;
};

Minigames.prototype.isQueued = function () {
    return !!this._queue;
};

Minigames.prototype.tr = function (key) {
    return this.ui ? this.ui.text(key) : key;
};

Minigames.prototype.load = function (key) {
    try {
        return window.localStorage.getItem(key);
    } catch (e) {
        return null;
    }
};

Minigames.prototype.save = function (key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (e) {
        // private windows: kept this visit
    }
};

/* --- The songs (the beach's) ------------------------------------------------ */

Minigames.prototype.loadSongs = function () {
    if (this.songs || this._songsLoading) return;
    var asset = this.app.assets.find('songs.json', 'json');
    if (!asset) {
        this.songs = [];
        return;
    }
    this._songsLoading = true;
    var self = this;
    asset.ready(function () {
        self._songsLoading = false;
        var table = asset.resource || {};
        self.songs = Object.keys(table).filter(function (id) {
            return !!self.app.assets.find(id, 'audio');
        }).map(function (id) {
            var row = table[id] || {};
            return { id: id, title: row.title || id.replace(/[_-]+/g, ' '), bpm: row.bpm || 0, duration: row.duration || 0 };
        });
        var waiting = self._songsWaiting;
        self._songsWaiting = null;
        if (waiting) waiting();
    });
    this.app.assets.load(asset);
};

Minigames.prototype.songTitle = function (id) {
    var song = (this.songs || []).filter(function (s) { return s.id === id; })[0];
    return song ? song.title : String(id || '').replace(/[_-]+/g, ' ');
};

/* --- Picks ------------------------------------------------------------------ */

Minigames.prototype.setDifficulty = function (difficulty) {
    this.difficulty = difficulty === 'hard' ? 'hard' : 'easy';
    this.save(Minigames.DIFFICULTY_KEY, this.difficulty);
};

Minigames.prototype.setMode = function (mode) {
    this.mode = mode === 'bar' ? 'bar' : 'tap';
    this.save(Minigames.MODE_KEY, this.mode);
};

/* --- The queue ---------------------------------------------------------------- */

// kind 'dance' (with `song`) or 'fashion'. The world's own Colyseus client joins the queue (the dance rooms run on
// Lumatopia's server), signed in with her Lumatopia token as the beach's rooms are.
Minigames.prototype.join = function (kind, song) {
    if (this._queue || !this.isAvailable()) return false;
    if (kind === 'dance' && !song) return false;
    var client = this.app.colyseus;
    var token = this.load('token');
    if (!client || !token) {
        this.note(this.tr('Try again'));
        return false;
    }
    var q = this._queue = {
        kind: kind === 'fashion' ? 'fashion' : 'dance', song: song || '', room: null, count: 1,
        at: performance.now(), queuedAt: Date.now(), canSolo: false, soloAsked: false, found: false
    };
    var options = q.kind === 'fashion'
        ? { token: token, travel: true }
        : { token: token, song: song, difficulty: this.difficulty, mode: this.mode, travel: true };
    var self = this;
    client.joinOrCreate(Minigames.QUEUES[q.kind], options).then(function (room) {
        if (self._queue !== q) {
            room.leave();           // (cancelled while it joined)
            return;
        }
        q.room = room;
        room.onMessage('clients', function (n) { q.count = Number(n) || 1; });
        room.onMessage('canSolo', function () { q.canSolo = true; });
        room.onMessage('seat', function (seat) { self.onSeat(q, seat); });
        room.onLeave(function () {
            if (self._queue !== q || q.found) return;
            self._queue = null;
            self.note(self.tr('Try again'));
        });
    }).catch(function (err) {
        if (self._queue !== q) return;
        console.warn('[Minigames] no queue:', err && err.message ? err.message : err);
        self._queue = null;
        self.note(self.tr('Try again'));
    });
    var analytics = this.app.pokiAnalytics;
    if (analytics) analytics.interact('minigames', 'queue-' + q.kind + (q.song ? '-' + q.song : ''));
    this.renderPill();
    return true;
};

Minigames.prototype.cancel = function () {
    var q = this._queue;
    if (!q || q.found) return;
    this._queue = null;
    if (q.room) q.room.leave();
    var analytics = this.app.pokiAnalytics;
    if (analytics) analytics.interact('minigames', 'cancel-' + q.kind + '-' + Math.round((performance.now() - q.at) / 1000) + 's');
    this.renderPill();
};

// A show of her own now (the dance queue says when it can: canSolo).
Minigames.prototype.playSolo = function () {
    var q = this._queue;
    if (!q || q.found || q.kind !== 'dance' || !q.canSolo || q.soloAsked || !q.room) return;
    q.soloAsked = true;
    q.room.send('solo');
    var analytics = this.app.pokiAnalytics;
    if (analytics) analytics.interact('minigames', 'solo-' + Math.round((performance.now() - q.at) / 1000) + 's');
    this.renderPill();
};

// Matched: the queue lets her go, and she travels to the beach with the seat (its room holds it for her, and waits).
Minigames.prototype.onSeat = function (q, seat) {
    if (this._queue !== q || q.found) return;
    q.found = true;
    if (!this.canTravel()) {
        // the beach closed meanwhile, or a trip is under way: the seat goes unused (the show doesn't wait for long)
        this._queue = null;
        if (q.room) q.room.leave();
        this.note(this.tr('Try again'));
        return;
    }
    try {
        q.room.send('confirm');
    } catch (e) {
        // the queue lets go of her by itself
    }
    var player = this.app.localPlayer;
    var at = player && !player.destroyed ? player.getPosition() : null;
    var ticket = this.app.minigameTicket = {
        kind: q.kind, seat: seat, song: q.song, difficulty: this.difficulty, mode: this.mode, count: q.count,
        queuedAt: q.queuedAt, back: at ? { x: at.x, y: at.y, z: at.z } : null
    };
    this.renderPill();
    var phone = this.app.phone;
    if (phone && phone.isOpen()) phone.close({ skipCommercialBreak: true, quiet: true });
    var app = this.app;
    var self = this;
    setTimeout(function () {
        if (app.minigameTicket !== ticket) return;
        if (typeof DanceTravel === 'undefined' || DanceTravel.busy) {
            app.minigameTicket = null;
            if (self._queue === q) {
                self._queue = null;
                self.note(self.tr('Try again'));
            }
            return;
        }
        DanceTravel.toBeach(app);
    }, Minigames.GO_MS);
};

Minigames.prototype.note = function (text) {
    this._note = { text: text, until: performance.now() + Minigames.NOTE_MS };
    this.renderPill();
};

/* --- What the phone shows (its Minigames page) ---------------------------------- */

Minigames.prototype.waitText = function (q) {
    var sec = Math.floor((performance.now() - q.at) / 1000);
    return Math.floor(sec / 60) + ':' + (sec % 60 < 10 ? '0' : '') + (sec % 60);
};

Minigames.prototype.queueState = function () {
    var q = this._queue;
    if (!q) return null;
    var max = q.kind === 'fashion' ? Minigames.MAX_MODELS : Minigames.MAX_DANCERS;
    return {
        kind: q.kind,
        label: q.found ? this.tr('Show found!') : this.tr(q.kind === 'fashion' ? 'Finding models' : 'Finding dancers'),
        sub: q.kind === 'dance' ? this.songTitle(q.song) : this.tr('Fashion Show'),
        time: this.waitText(q),
        count: Math.min(max, q.count) + '/' + max,
        found: q.found,
        solo: q.kind === 'dance' && q.canSolo && !q.soloAsked && !q.found,
        soloLabel: this.tr('Play solo'),
        cancel: !q.found,
        cancelLabel: this.tr('Cancel')
    };
};

// See PhoneView's _renderMinigames: the wait (if she's queued), then the two shows as square tiles.
Minigames.prototype.buildPhoneState = function () {
    this.loadSongs();                   // (so the song pick opens at once)
    var queued = !!this._queue;
    return {
        title: this.tr('Minigames'),
        queue: this.queueState(),
        hint: this.tr('You go to Music Beach when the show starts.'),
        tiles: [
            { id: 'dance', label: this.tr('Dance Show'), art: Minigames.TILE_ART.dance, disabled: queued },
            { id: 'fashion', label: this.tr('Fashion Show'), art: Minigames.TILE_ART.fashion, disabled: queued }
        ]
    };
};

// A tile tapped on the phone: the dance show's song pick, or the fashion show's queue.
Minigames.prototype.openTile = function (id) {
    if (this._queue || !this.isAvailable()) return false;
    if (id === 'fashion') return this.join('fashion');
    if (id === 'dance') return this.openSongs();
    return false;
};

/* --- The song pick (MinigameSongs.js) ------------------------------------------------ */

Minigames.prototype.openSongs = function () {
    if (typeof MinigameSongs === 'undefined' || this._queue || !this.isAvailable()) return false;
    if (!this.songs) {
        // songs.json first (small): the pick opens as it comes in
        var self = this;
        this._songsWaiting = function () { self.openSongs(); };
        this.loadSongs();
        return true;
    }
    if (!this.songs.length) return false;
    if (this.songsView && this.songsView.isOpen()) return true;
    if (!this.songsView) {
        var mg = this;
        if (this.ui) this.ui.useStyle('MinigameSongs.css');
        this.songsView = new MinigameSongs(this.app, {
            start: function (pick) { mg.startSong(pick); },
            close: function () { mg.closeSongs(); },
            difficulty: function (value) { mg.setDifficulty(value); },
            mode: function (value) { mg.setMode(value); }
        });
    }
    this.lockForSongs(true);
    this.songsView.open({ songs: this.songs, difficulty: this.difficulty, mode: this.mode, selected: this._lastSong });
    var analytics = this.app.pokiAnalytics;
    if (analytics) {
        var self2 = this;
        if (analytics.openMenu) analytics.openMenu('minigame-songs', function () { self2.closeSongs({ quiet: true }); });
        analytics.visible('panel', 'minigame-songs');
    }
    return true;
};

// `options.queued`: closed by START (no ad break: she's off to play)
Minigames.prototype.closeSongs = function (options) {
    if (!this.songsView || !this.songsView.isOpen()) return;
    this.songsView.close();
    this.lockForSongs(false);
    var analytics = this.app.pokiAnalytics;
    if (analytics && analytics.closeMenu) {
        analytics.closeMenu('minigame-songs', options && (options.queued || options.quiet) ? { skipCommercialBreak: true } : null);
    }
};

Minigames.prototype.startSong = function (pick) {
    this.setDifficulty(pick.difficulty);
    this.setMode(pick.mode);
    this._lastSong = pick.song;
    this.closeSongs({ queued: true });
    this.join('dance', pick.song);
};

// While the song pick is up she stands still, the mouse is free, and the HUD (and the quest tracker in the pick's
// corner) steps aside - as the beach's song select has it.
Minigames.prototype.lockForSongs = function (on) {
    var app = this.app;
    var locks = app.uiInputLocks = app.uiInputLocks || {};
    var manager = app.gameManager;
    var player = app.localPlayer || (manager && manager.getLocalPlayerEntity && manager.getLocalPlayerEntity());
    var controller = player && (manager && manager.getCharacterControllerScript ? manager.getCharacterControllerScript(player) : player.script && player.script.characterController);
    var mouse = null;
    var scripts = app.root.findComponents ? app.root.findComponents('script') : [];
    for (var i = 0; i < scripts.length && !mouse; i++) if (scripts[i] && scripts[i].mouseInput) mouse = scripts[i].mouseInput;
    if (on) {
        if (this._lock) return;
        var gameUI = app.root.findByName('GameUI');
        this._lock = { controller: controller, mouse: mouse, preventMouseLock: mouse ? mouse.preventMouseLock : false, gameUI: gameUI, gameUiOn: !!(gameUI && gameUI.enabled) };
        locks.minigameSongs = true;
        if (controller) {
            controller.canMove = false;
            controller.canJump = false;
            controller.jumpHeld = false;
            if (controller.resetMovementState) controller.resetMovementState();
        }
        if (mouse) {
            mouse.preventMouseLock = true;
            mouse.lookButtonDown = false;
            mouse.panButtonDown = false;
        }
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
        if (gameUI) gameUI.enabled = false;
        document.documentElement.classList.add('mgs-open');
        return;
    }
    var lock = this._lock;
    if (!lock) return;
    this._lock = null;
    delete locks.minigameSongs;
    document.documentElement.classList.remove('mgs-open');
    if (lock.gameUI && !lock.gameUI.destroyed) lock.gameUI.enabled = lock.gameUiOn;
    if (lock.mouse) lock.mouse.preventMouseLock = lock.preventMouseLock === true;
    if (!Object.keys(locks).length && lock.controller) {
        lock.controller.canMove = true;
        lock.controller.canJump = true;
        lock.controller.jumpHeld = false;
        if (lock.controller.resetMovementState) lock.controller.resetMovementState();
    }
};

/* --- The pill ---------------------------------------------------------------------- */

Minigames.prototype.buildPill = function () {
    if (typeof LumatopiaHtmlUi === 'undefined') return;
    var ui = this.ui = LumatopiaHtmlUi.get(this.app);
    ui.useStyle('Minigames.css');
    var el = ui.el.bind(ui);
    var pill = this.pill = el('div', 'mg-pill', ui.root);
    pill.hidden = true;
    el('i', 'mg-pill-dot', pill);
    var text = el('span', 'mg-pill-text', pill);
    this.pillLabel = el('b', 'mg-pill-label', text);
    this.pillSub = el('span', 'mg-pill-sub', text);
    var nums = this.pillNums = el('span', 'mg-pill-nums', pill);
    this.pillTime = el('span', 'mg-pill-time', nums);
    this.pillCount = el('span', 'mg-pill-count', nums);
    var solo = this.pillSolo = el('button', 'mg-pill-solo', pill);
    solo.type = 'button';
    var cancel = this.pillCancel = el('button', 'mg-pill-cancel', pill);
    cancel.type = 'button';
    cancel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"></path></svg>';
    var self = this;
    var tap = function (element, fn) {
        element.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        element.addEventListener('click', function (event) {
            event.stopPropagation();
            fn.call(self);
        });
    };
    tap(solo, this.playSolo);
    tap(cancel, this.cancel);
    ui.onLocaleChange(function () {
        self._pillKey = '';
        self.renderPill();
    });
};

Minigames.prototype.renderPill = function () {
    if (!this.pill) return;
    var note = this._note && performance.now() < this._note.until ? this._note : null;
    if (!note) this._note = null;
    var q = this.queueState();
    var shown = !!(q || note);
    var key = shown ? JSON.stringify([q, note && note.text]) : '';
    if (key === this._pillKey) return;
    this._pillKey = key;
    this.pill.hidden = !shown;
    if (!shown) return;
    this.pill.classList.toggle('is-note', !q);
    this.pill.classList.toggle('is-found', !!(q && q.found));
    this.pill.setAttribute('data-kind', q ? q.kind : '');
    this.pillLabel.textContent = q ? q.label : note.text;
    this.pillSub.textContent = q ? q.sub : '';
    this.pillSub.hidden = !q;
    this.pillNums.hidden = !q || q.found;
    if (q) {
        this.pillTime.textContent = q.time;
        this.pillCount.textContent = q.count;
    }
    this.pillSolo.hidden = !(q && q.solo);
    this.pillSolo.textContent = q ? q.soloLabel : '';
    this.pillCancel.hidden = !(q && q.cancel);
    this.pillCancel.setAttribute('aria-label', q ? q.cancelLabel : '');
};

Minigames.prototype.update = function (dt) {
    this._tick -= dt;
    if (this._tick > 0) return;
    this._tick = 0.25;
    // the beach closed while she waited: out of the queue
    if (this._queue && !this._queue.found && !this.isAvailable()) this.cancel();
    this.renderPill();
};
