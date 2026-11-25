var LumatopiaLink = pc.createScript('lumatopiaLink');

// The dance beach's own way into Lumatopia's server, standing in for Lumatopia's GameManager (which only runs in the
// world). On the beach the player's body and the people they see are the beach's (net.mjs and its dance room), but
// their account is Lumatopia's: this joins the Lumatopia room for players off the world ("lumatopia_beach", the same
// room as the world's) with their token, so Lumatopia's shop, phone apps, daily tasks and login rewards, money and
// Lumina work here as they do there.
//
// It is app.gameManager / app.mainGameManager while the beach is up, and does for those scripts what GameManager does:
// app.room, app.localSessionId, app.roomReady and 'room:ready' once in; money and Lumina on the HUD (lumatopia-hud.mjs);
// the inventory passed on as app events. GameManager's own methods are borrowed where the shop and panels call them
// (GameManager.js stays loaded after Lumatopia's scene goes); the world's (homes, cars, the camera that follows from
// behind) answer as a world-less beach would.
//
// Their look is Lumatopia's (equippedCustomize), but the beach dresses her with its own wardrobe (wardrobe.mjs): a
// Lumatopia look is turned into a beach one (as the server's dance/accounts.js lookOf does) and put on her - kept when
// Lumatopia saved it, shown only while the shop tries things on.
//
// Only Lumatopia's own messages may go to this room (an unknown one gets a client thrown out), and a player is never in
// it and the world's room at once (each saves the whole player): DanceTravel.js leaves it before going back.
LumatopiaLink.attributes.add('roomName', {
    type: 'string',
    default: 'lumatopia_beach',
    title: 'Room',
    description: 'The Lumatopia room the beach joins (the server defines it beside "lumatopia").'
});

// the game's version, as GameManager sends it
LumatopiaLink.VERSION = '1.14';
// Lumatopia's look slots and the beach's
LumatopiaLink.SLOTS = { hair: 'hair', hat: 'outfitHat', top: 'top', bottom: 'bottom', shoes: 'shoes' };

// GameManager's own, for the shop and panels
['formatNumberValue', 'getClientInstanceId', 'getEntityRenderBounds', 'findDescendantTextElement', 'playOrAddSound',
    'isPlaceholderUsername', 'generateOfflineUsername', 'getUsernameWordsSource', 'applyAuthoritativeUsername',
    'isLocalSession'].forEach(function (name) {
    if (typeof GameManager !== 'undefined' && GameManager.prototype[name]) LumatopiaLink.prototype[name] = GameManager.prototype[name];
});

LumatopiaLink.prototype.initialize = function () {
    this.room = null;
    this.coins = 0;
    this.lumina = 0;
    this.bases = [];
    this._waitingForInitialSkinSelection = false;
    this._faceBlinkStates = [];
    var wallet = this.app.lumatopiaWallet;
    if (wallet) {
        this.coins = wallet.money;
        this.lumina = wallet.lumina;
    }
    this.app.gameManager = this;
    this.app.mainGameManager = this;
    this.app.tutorialDone = true;
    this.app.players = {};                  // (the world's are gone; the beach's players are net.mjs's)
    this.on('destroy', this.onDestroy, this);
};

LumatopiaLink.prototype.postInitialize = function () {
    var root = this.app.root;
    var game = root.find(function (e) { return !!(e.script && e.script.gameFlow); })[0];
    this.net = game && game.script.net;
    this.flow = game && game.script.gameFlow;
    this.wardrobe = game && game.script.wardrobe;
    this.hud = root.find(function (e) { return !!(e.script && e.script.lumatopiaHud); })[0];
    this.player = root.find(function (e) { return !!(e.script && e.script.playerMove); })[0] || null;
    this.camera = root.find(function (e) { return !!(e.script && e.script.followCamera); })[0] || null;
    this.app.localPlayer = this.player;
    var follow = this.camera && this.camera.script && this.camera.script.followCamera;
    if (follow) this.app.camera = this.cameraAdapter(follow);
    // the bird camera (BirdPhotography) only while she walks about the beach, its camera following her
    var photo = this.app.birdPhotography;
    var flow = this.flow;
    if (photo && photo.canOpen) {
        var canOpen = photo.canOpen.bind(photo);
        photo.canOpen = function () { return !!follow && follow.enabled && (!flow || flow.state === 'hub') && canOpen(); };
        // it starts from where the camera looks: the beach's looks steeply down at her from high up, so the camera
        // is put at her head first, looking level the way it faced (the adapter puts it back on close)
        var open = photo.open.bind(photo);
        var adapter = this.app.camera;
        photo.open = function () {
            if (!photo._active && adapter && adapter._smoothedPivotWorld && photo.canOpen()) adapter.toEyes();
            return open.apply(photo, arguments);
        };
    }
    // Escape is the beach's own in a show (pause): Lumatopia's Settings opens on it only in the hub
    this.app.settingsEscapeBlocked = function () { return !!flow && flow.state !== 'hub'; };
    this.app.on('net:online', this.bindBeachRoom, this);
    if (this.net && this.net.room) this.bindBeachRoom(this.net.room);
    this.join();
};

// The beach's own room (net.mjs): chat goes there (Chat.js reads app.chatRoom), where the people she sees are, and its
// lines come to Chat as GameManager passes Lumatopia's on
LumatopiaLink.prototype.bindBeachRoom = function (room) {
    if (!room || room === this.app.chatRoom) return;
    var app = this.app;
    app.chatRoom = room;
    room.onMessage('chatMessage', function (data) { app.fire('chatMessage', data); });
    room.onMessage('chatRejected', function (data) { app.fire('chatRejected', data); });
};

LumatopiaLink.prototype.update = function (dt) {
    // a Lumatopia menu up (the shop, the phone and its apps...): the beach's own hub buttons step aside (game-flow.mjs;
    // checked here, as the phone switches GameUI off while it's up)
    var menu = (typeof LumatopiaMenus !== 'undefined' && LumatopiaMenus.isOpen(this.app)) || !!this.app.skinShopOpen;
    if (menu !== this._menu && this.flow && this.flow.root) {
        this._menu = menu;
        this.flow.root.classList.toggle('gf-under-menu', menu);
    }
    // the bird camera up: the beach's name tags and quest markers (HTML, over the viewfinder) out of its way
    var photo = !!this.app.birdPhotoModeActive;
    if (photo !== this._photo) {
        this._photo = photo;
        document.querySelectorAll('.qs-root, .net-tags').forEach(function (el) { el.style.visibility = photo ? 'hidden' : ''; });
    }
    // the beach's players by their beach session (Chat.js finds a speaker's bubble through app.players)
    this._playersIn = (this._playersIn || 0) - dt;
    if (this._playersIn > 0 || !this.net || !this.net.avatars) return;
    this._playersIn = 0.5;
    var players = {};
    this.net.avatars.forEach(function (avatar, id) { players[id] = avatar.root; });
    this.app.players = players;
};

LumatopiaLink.prototype.onDestroy = function () {
    this._destroyed = true;
    this.app.off('net:online', this.bindBeachRoom, this);
    if (this.app.chatRoom) this.app.chatRoom = null;
    if (this.room && this.app.room === this.room) {
        // (DanceTravel has normally left already, waiting for the save)
        try { this.room.leave(true); } catch (e) { /* gone already */ }
    }
    if (this.app.gameManager === this) this.app.gameManager = null;
    if (this.app.mainGameManager === this) this.app.mainGameManager = null;
};

// ------------------------------------------------------------------ the room
LumatopiaLink.prototype.url = function () {
    return new URLSearchParams(window.location.search).get('server') || (this.net && this.net.serverUrl) || '';
};

LumatopiaLink.prototype.join = async function () {
    var url = this.url();
    var token = null;
    try { token = localStorage.getItem('token'); } catch (e) { /* no storage */ }
    // without their token the room would make a new account: the beach only joins as the player who came from Lumatopia
    if (!url || !token || typeof Colyseus === 'undefined') return;
    var room;
    try {
        var client = new Colyseus.Client(url);
        room = await client.joinOrCreate(this.roomName, {
            token: token,
            clientInstanceId: this.getClientInstanceId(),
            version: LumatopiaLink.VERSION
        });
    } catch (err) {
        console.warn('[LumatopiaLink] could not join ' + this.roomName + ':', err && (err.message || err));
        if (!this._destroyed) setTimeout(this.join.bind(this), 5000);
        return;
    }
    if (this._destroyed) {
        room.leave(true);
        return;
    }
    this.room = room;
    room.players = {};
    this.bindRoom(room);
    // as GameManager: the shop and panels bind their own handlers now (synchronously, before the room's first messages)
    this.app.room = room;
    this.app.localSessionId = room.sessionId;
    this.app.roomReady = true;
    this.app.fire('room:ready', room);
};

LumatopiaLink.prototype.bindRoom = function (room) {
    var self = this;
    var app = this.app;
    room.onMessage('coinUpdateConfirmation', function (data) { self.setMoneyTextValue(data && data.newBalance); });
    room.onMessage('luminaUpdateConfirmation', function (data) {
        if (!data) return;
        self.setLuminaTextValue(data.newBalance);
        app.fire('lumina:changed', data);
    });
    room.onMessage('customize', function (data) {
        if (data) localStorage.setItem('customize', JSON.stringify(data));
    });
    room.onMessage('equippedCustomize', function (data) {
        if (!data || !data.customize || data.sessionId !== room.sessionId) return;
        localStorage.setItem('equippedCustomize', JSON.stringify(data.customize));
        app.customize = typeof normalizeAvatarOutfit === 'function' ? normalizeAvatarOutfit(data.customize) : data.customize;
        app.awaitingInitialCustomize = null;
        self.wearLumatopiaLook(data.customize);
    });
    room.onMessage('inventory:update', function (data) {
        app.itemInventory = data || { fish: [], critters: [], furniture: [] };
        app.fire('inventory:update', app.itemInventory);
    });
    room.onMessage('inventory:itemAdded', function (data) {
        if (data && data.inventory) {
            app.itemInventory = data.inventory;
            app.fire('inventory:update', app.itemInventory);
        }
        app.fire('inventory:itemAdded', data);
    });
    room.onMessage('newUserRegistered', function (data) {
        if (data && data.token) localStorage.setItem('token', data.token);
    });
    // a new name from Settings (rerollUsername), as GameManager takes it
    room.onMessage('usernameChanged', function (data) {
        if (!data) return;
        if (!data.success || typeof data.username !== 'string' || !data.username.trim()) {
            app.fire('username:changeFailed', data.error || 'Could not change nickname');
            return;
        }
        self.applyAuthoritativeUsername(data.username.trim(), data.token);
    });
    // the rest is the world's (or the panels' own, bound on 'room:ready'); chat and emotes are the beach room's
    room.onMessage('*', function () {});

    // their money and Lumina as the room holds them, and every player's record as GameManager keeps it (room.players)
    var $ = Colyseus.getStateCallbacks(room);
    $(room.state).players.onAdd(function (player, key) {
        room.players[key] = player;
        if (key !== room.sessionId) return;
        $(player).listen('money', function (value) { self.setMoneyTextValue(value); });
        $(player).listen('lumina', function (value) { self.setLuminaTextValue(value); });
    });
    $(room.state).players.onRemove(function (player, key) { delete room.players[key]; });
    room.onLeave(function (code) {
        if (app.room === room) app.roomReady = false;
        self.room = null;
        // dropped (not a leave: 1000, or 4000 consented): back in after a moment
        if (!self._destroyed && code !== 1000 && code !== 4000 && !(typeof DanceTravel !== 'undefined' && DanceTravel.busy)) {
            setTimeout(self.join.bind(self), 3000);
        }
    });
};

// ------------------------------------------------------------------ the HUD
LumatopiaLink.prototype.setMoneyTextValue = function (value) {
    this.coins = Number(value) || 0;
    var hud = this.hud && this.hud.script && this.hud.script.lumatopiaHud;
    if (hud) hud.setMoney(this.coins);
};

LumatopiaLink.prototype.setLuminaTextValue = function (value) {
    this.lumina = Math.max(0, Math.floor(Number(value) || 0));
    var hud = this.hud && this.hud.script && this.hud.script.lumatopiaHud;
    if (hud) hud.setLumina(this.lumina);
};

// ------------------------------------------------------------------ her look
// a Lumatopia look (equippedCustomize, or the shop's normalised customize) as the beach's (dance/accounts.js lookOf)
LumatopiaLink.prototype.beachLook = function (customize) {
    var c = customize || {};
    var look = {};
    for (var slot in LumatopiaLink.SLOTS) {
        var value = slot === 'hat' ? (typeof c.outfitHat === 'string' ? c.outfitHat : c.hat) : c[LumatopiaLink.SLOTS[slot]];
        if (typeof value === 'string') look[slot] = value;
    }
    var face = Number(c.face);
    look.face = Number.isInteger(face) && face >= 0 ? face : 0;
    var skin = Number(c.skinTone);
    if (Number.isInteger(skin) && skin >= 0) look.skin = skin;
    if (typeof c.hairColor === 'string') look.hairColor = c.hairColor.toUpperCase();
    return look;
};

// Lumatopia saved a look: hers, and the beach's room is told (wardrobe.wearLook)
LumatopiaLink.prototype.wearLumatopiaLook = function (customize) {
    if (!this.wardrobe || !this.wardrobe.wearLook) return;
    this.wardrobe.preview(null);
    this.wardrobe.wearLook(Object.assign({}, this.wardrobe.look || {}, this.beachLook(customize)));
};

// the shop putting a look on her (trying things on, or hers back): shown, not kept
LumatopiaLink.prototype.applyAvatarCustomization = function (entity, customize) {
    if (!this.wardrobe || !this.wardrobe.preview) return;
    this.wardrobe.preview(Object.assign({}, this.wardrobe.look || {}, this.beachLook(customize)));
};

LumatopiaLink.prototype.applyFaceMaterial = function () {};       // (the beach's wardrobe dresses the face too)

// ------------------------------------------------------------------ the player, the camera
LumatopiaLink.prototype.resolveLocalPlayerEntity = function () { return this.player; };
LumatopiaLink.prototype.getLocalPlayerEntity = function () { return this.player; };
LumatopiaLink.prototype.resolveGameplayCameraEntity = function () { return this.camera; };

// what the shop and phone lock while they're up, as on Lumatopia's CharacterController: here, the beach's walking
LumatopiaLink.prototype.getCharacterControllerScript = function () {
    var pm = this.player && this.player.script && this.player.script.playerMove;
    if (!pm) return null;
    if (!this._controller) {
        this._controller = {
            get canMove() { return pm.enabled; },
            set canMove(value) {
                if (!value && pm._release) pm._release();
                pm.enabled = !!value;
            },
            canJump: true,
            get _angle() { return pm.yaw || 0; }
        };
    }
    return this._controller;
};

// ------------------------------------------------------------------ the camera
// Lumatopia's follow camera as the bird camera (BirdPhotography) uses it, over the beach's followCamera: switched off
// while photographing, its field of view back when it's on again (the beach's camera never sets it), and the point it
// pushes in towards a little over her feet.
LumatopiaLink.prototype.cameraAdapter = function (follow) {
    var entity = follow.entity;
    var fov = entity.camera.fov;
    var pivot = new pc.Vec3();
    var saved = null;                       // the camera as the beach had it, while photographing
    return {
        // to her eyes, looking level (and a step behind them, which the photo mode's entry then moves through)
        toEyes: function () {
            saved = { position: entity.getPosition().clone(), rotation: entity.getRotation().clone() };
            var forward = entity.forward;
            var yaw = Math.atan2(-forward.x, -forward.z) * pc.math.RAD_TO_DEG;
            entity.setEulerAngles(-5, yaw, 0);
            entity.setPosition(this._smoothedPivotWorld.clone().sub(entity.forward.clone().mulScalar(0.5)));
        },
        entity: entity,
        defaultFov: fov,
        get target() { return follow.target; },
        get _smoothedPivotWorld() {
            var target = follow.target;
            return target ? pivot.copy(target.getPosition()).add(pc.Vec3.UP.clone().mulScalar(1.2)) : null;
        },
        get enabled() { return follow.enabled; },
        set enabled(on) {
            follow.enabled = !!on;
            if (!on) return;
            entity.camera.fov = fov;
            if (saved) {
                entity.setPosition(saved.position);
                entity.setRotation(saved.rotation);
                saved = null;
            }
        }
    };
};

// ------------------------------------------------------------------ private rooms
// Settings' Play with friends: private rooms are the world's. Create (and Invite) and Join go back to Lumatopia, whose
// GameManager makes or joins the room as it connects (app.createPrivateRoom / app.joinPrivateRoomId, kept across the
// trip by DanceTravel); a new room's Invite page opens on arrival (SettingsUI, app.showInviteOnArrival).
LumatopiaLink.prototype.invitesFromWorld = true;

LumatopiaLink.prototype.switchRoom = async function (roomId) {
    var app = this.app;
    if (roomId) {
        app.joinPrivateRoomId = roomId;
        app.createPrivateRoom = false;
    } else {
        app.joinPrivateRoomId = null;
        app.createPrivateRoom = true;
        app.showInviteOnArrival = true;
    }
    if (typeof DanceTravel !== 'undefined') await DanceTravel.toLumatopia(app);
    return null;
};

// ------------------------------------------------------------------ the world's, which the beach hasn't
LumatopiaLink.prototype.startGameAfterSkinSelection = function () {};
LumatopiaLink.prototype.isLocalPlayerInsideHomeBase = function () { return false; };
LumatopiaLink.prototype.getLocalFurnitureTutLineBase = function () { return null; };
LumatopiaLink.prototype.tryDropLikeFurnitureDetector = function () {};
LumatopiaLink.prototype.getLocalBaseState = function () { return null; };
LumatopiaLink.prototype.getLocalBaseIndex = function () { return -1; };
LumatopiaLink.prototype.getStaticHomeBaseEntities = function () { return []; };
LumatopiaLink.prototype.findStaticHomeBaseEntity = function () { return null; };
LumatopiaLink.prototype.getLocalCarryCount = function () { return 0; };
LumatopiaLink.prototype.spawnMoneyCollectEffect = function () {};
LumatopiaLink.prototype.scheduleLeaderboardRefresh = function () {};
