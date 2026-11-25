var SkyWorld = pc.createScript('skyWorld');

SkyWorld.attributes.add('sceneName', {
    type: 'string',
    default: 'CloudDunes',
    title: 'Scene',
    description: 'The sky scene. Nothing of it loads with the game: it is appended only when someone goes up, and dropped again when they come down.'
});
SkyWorld.attributes.add('skyTexture', {
    type: 'asset',
    assetType: 'texture',
    title: 'Night Sky',
    description: 'The night panorama (equirect, NightSky.jpg): made into the skybox while up there, so it is never cut off by the camera\'s far clip.'
});

// The sky above the clouds (the user, 2026-11-04): the Cloud Dunes are their own
// scene, so nothing of them loads with the game. Going up (the balloon later;
// F8 in a launch for now) loads only that scene's assets, appends its
// hierarchy (app.scenes.loadSceneHierarchy), turns the island's sun into
// moonlight and its sky off, and moves the player to SkyArrival. Coming down
// puts it all back, destroys the sky's entities and unloads the assets the
// trip loaded, so the memory is given back (never ones the island uses too).
// - The sky scene sits 1000 m up (its SkyWorld entity), so it never overlaps the
//   island while both are loaded; DistanceCulling then hides the island's
//   'cull'-tagged things on its own, the player being far from all of them.
// - The island's light is reused as the moon (GameManager and GraphicsSettings
//   find it by its name, 'Light', for the shadow settings): it takes the colour,
//   intensity and angle of the sky scene's own MoonLight (the user, 2026-11-04:
//   tune it in the Editor), which is then switched off.
// - The sky scene's own render settings come with it (the user, 2026-11-04):
//   ambient, fog (type, colour, start, end, density), exposure and the skybox
//   intensity and rotation, from its Scene Settings in the Editor. The island's
//   are kept and put back on the way down. (Not gravity or lightmapping.)
// - The night sky is the engine's skybox (from Night Sky, made into a cubemap
//   once per trip): the camera's far clip is only 400 m, too short for a sky
//   sphere round a 440 m area. The scene's NightSky sphere is for the Editor
//   only and is switched off too.
// - The trip waits only for what she stands on and sees first (the user,
//   2026-11-05: "teleport as soon as the terrain loaded"): every collider, the
//   dunes under SKY_FIRST_UNDER, the scene's scripts and the night sky. The rest
//   (the station's and train's textures, ~24 MB) streams in once she's up.
// - Events: skyWorld:loading, skyWorld:up, skyWorld:down, skyWorld:failed,
//   skyWorld:complete (the rest has arrived).
// - This file is not preloaded either (the user, 2026-11-05). Root's script
//   component waits for it; whoever sends players up first calls
//   app.loadScripts(['skyWorld'], cb) (AssetLoadGate.js), after which
//   app.skyWorld exists. In a launch, F8 does that by itself.
// Only if the sky scene has no MoonLight / no settings:
var SKY_MOON = { color: [0.92, 0.86, 1.0], intensity: 1.25, rotation: [62, -40, 0] };   // tuned in a launch, 2026-11-04
var SKY_AMBIENT = [0.24, 0.20, 0.46];
var SKY_LIGHT_NAMES = ['MoonLight', 'CloudPreviewLight'];
var SKY_ARRIVAL = [0, 1004, -120];           // if the scene has no SkyArrival
// Entities whose looks load before the trip (with everything under them), on
// top of every collider: the ground she lands on.
var SKY_FIRST_UNDER = ['CloudDunes'];

SkyWorld.prototype.initialize = function () {
    this.app.skyWorld = this;
    this.state = 'island';                   // island | loading | sky
    this.root = null;
    this.assets = [];
    this._waiters = [];
    this._saved = null;
    this._back = null;
    if (this.isTestHost() && this.app.keyboard) this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.on('destroy', function () {
        if (this.app.keyboard) this.app.keyboard.off(pc.EVENT_KEYDOWN, this.onKeyDown, this);
        if (this.app.skyWorld === this) this.app.skyWorld = null;
    }, this);
};

// F8 goes up and down, only in a launch (or with ?sky=debug).
SkyWorld.prototype.isTestHost = function () {
    var location = window.location || {};
    return /launch\.playcanvas\.com/.test(location.host || '') || /[?&]sky=debug/.test(location.search || '');
};

SkyWorld.prototype.onKeyDown = function (event) {
    if (event.key !== pc.KEY_F8) return;
    if (event.event) event.event.preventDefault();
    if (this.state === 'sky') this.goDown();
    else this.goUp();
};

/* --- Loading and unloading the sky scene -------------------------------------- */

// What its entities use, in two lists: { first, later }. first is what the
// trip waits for: the colliders of the entities that are on, the looks of
// everything under SKY_FIRST_UNDER, and the scripts on its entities (CloudRim,
// SkyStars: not preloaded, so they arrive before its entities are made).
// later is the rest of the looks (render models with their containers,
// materials and the materials' textures), loaded once she is up.
SkyWorld.prototype.collectAssets = function (data) {
    var registry = this.app.assets;
    var entities = (data && data.entities) || {};
    var first = {};
    var later = {};
    var scriptNames = {};
    var add = function (into, id) {
        if (typeof id === 'number' && id > 0) into[id] = true;
    };
    // on: its own box and every parent's; underFirst: under a SKY_FIRST_UNDER entity
    var on = function (entity) {
        for (var e = entity; e; e = entities[e.parent]) if (e.enabled === false) return false;
        return true;
    };
    var underFirst = function (entity) {
        for (var e = entity; e; e = entities[e.parent]) if (SKY_FIRST_UNDER.indexOf(e.name) !== -1) return true;
        return false;
    };
    for (var key in entities) {
        if (!Object.prototype.hasOwnProperty.call(entities, key)) continue;
        var entity = entities[key];
        var components = entity.components || {};
        var looks = underFirst(entity) ? first : later;
        if (components.render) {
            add(looks, components.render.asset);
            (components.render.materialAssets || []).forEach(function (id) { add(looks, id); });
        }
        if (components.collision) {
            var into = on(entity) ? first : later;
            add(into, components.collision.renderAsset);
            add(into, components.collision.asset);
        }
        if (components.script && components.script.scripts) {
            for (var scriptName in components.script.scripts) scriptNames[scriptName] = true;
        }
    }
    var expand = function (ids, list) {
        var push = function (asset) {
            if (asset && list.indexOf(asset) === -1) list.push(asset);
        };
        Object.keys(ids).forEach(function (id) {
            var asset = registry.get(Number(id));
            if (!asset) return;
            if (asset.type === 'render' && asset.data && asset.data.containerAsset) push(registry.get(asset.data.containerAsset));
            push(asset);
            if (asset.type === 'material' && asset.data) {
                for (var name in asset.data) {
                    if (/Map$/.test(name) && typeof asset.data[name] === 'number') push(registry.get(asset.data[name]));
                }
            }
        });
        return list;
    };
    var firstList = registry.filter(function (asset) {
        if (asset.type !== 'script' || !asset.data || !asset.data.scripts) return false;
        for (var name in asset.data.scripts) if (scriptNames[name]) return true;
        return false;
    });
    expand(first, firstList);
    var laterList = expand(later, []).filter(function (asset) { return firstList.indexOf(asset) === -1; });
    return { first: firstList, later: laterList };
};

SkyWorld.prototype.loadAssets = function (list, callback) {
    var left = list.length;
    if (!left) {
        callback();
        return;
    }
    var one = function () {
        left--;
        if (left === 0) callback();
    };
    var registry = this.app.assets;
    list.forEach(function (asset) {
        if (asset.loaded) {
            one();
            return;
        }
        var finished = false;
        var onError = function (err) {
            console.warn('[SkyWorld] could not load ' + asset.name, err);
            finish();
        };
        var finish = function () {
            if (finished) return;
            finished = true;
            asset.off('error', onError);
            one();
        };
        asset.ready(finish);
        asset.once('error', onError);
        registry.load(asset);
    });
};

// Loads what the trip needs (collectAssets' first), then appends its hierarchy
// (colliders and ground in place) and calls back; the rest loads after that.
// callback(err, root).
SkyWorld.prototype.prepare = function (callback) {
    if (this.root && !this.root.destroyed) {
        callback(null, this.root);
        return;
    }
    this._waiters.push(callback);
    if (this._preparing) return;
    this._preparing = true;
    var self = this;
    var done = function (err, root) {
        self._preparing = false;
        var waiters = self._waiters;
        self._waiters = [];
        waiters.forEach(function (cb) { cb(err, root); });
    };
    var scenes = this.app.scenes;
    var item = scenes.find(this.sceneName);
    if (!item) {
        done(new Error('no scene named ' + this.sceneName));
        return;
    }
    scenes.loadSceneData(item, function (err, loaded) {
        if (err) {
            done(err);
            return;
        }
        var settings = loaded.data && loaded.data.settings;
        self._settings = settings ? JSON.parse(JSON.stringify(settings)) : null;
        var sets = self.collectAssets(loaded.data);
        var assets = sets.first;
        if (self.skyTexture && assets.indexOf(self.skyTexture) === -1) assets.push(self.skyTexture);
        var rest = sets.later.filter(function (asset) { return assets.indexOf(asset) === -1; });
        // Only what this trip loads is the sky's to free again: the scene also
        // uses island assets (its potted plant: WoodenFurnituresMaterial, the
        // WoodenRemake atlas), and freeing those left the wooden furniture
        // white after a trip (user, 2026-11-05).
        self._own = {};
        assets.concat(rest).forEach(function (asset) {
            if (!asset.loaded && !asset.loading) self._own[asset.id] = true;
        });
        self.loadAssets(assets, function () {
            scenes.loadSceneHierarchy(loaded, function (err2, root) {
                if (err2 || !root) {
                    done(err2 || new Error('no hierarchy'));
                    return;
                }
                self.root = root;
                self.assets = assets.concat(rest);
                self._moon = null;
                SKY_LIGHT_NAMES.forEach(function (name) {
                    var moon = root.findByName(name);
                    if (!moon) return;
                    if (!self._moon && moon.light) {
                        var e = moon.getEulerAngles();
                        self._moon = {
                            color: [moon.light.color.r, moon.light.color.g, moon.light.color.b],
                            intensity: moon.light.intensity,
                            rotation: [e.x, e.y, e.z]
                        };
                    }
                    moon.enabled = false;
                });
                var preview = root.findByName('NightSky');
                if (preview) preview.enabled = false;
                done(null, root);
                // The rest (the station's textures, the train...): each model or
                // texture shows as it lands.
                var restStarted = performance.now();
                self.loadAssets(rest, function () {
                    if (self.root !== root) return;
                    self.restMs = Math.round(performance.now() - restStarted);
                    self.app.fire('skyWorld:complete');
                    console.log('[SkyWorld] the rest of the sky (' + rest.length + ' assets) arrived in ' + self.restMs + ' ms');
                });
            });
        });
    });
};

// Its entities go, then the assets the trip loaded (meshes, textures) are
// freed: never one the island had already, nor one the island has started to
// draw meanwhile (a wooden piece placed during the trip). Scripts stay
// registered: a script file cannot be taken back, and loading it again would
// define its script twice.
SkyWorld.prototype.unloadSky = function () {
    if (this.root && !this.root.destroyed) this.root.destroy();
    this.root = null;
    var assets = this.assets;
    var own = this._own || {};
    this.assets = [];
    this._own = {};
    var self = this;
    var inUse = null;
    var islandUses = function (asset) {
        if (!inUse) inUse = self.assetsInUse();
        return !!inUse[asset.id];
    };
    var unloadLate = function (asset) {
        // still on its way (down again before the rest arrived): freed when it lands,
        // unless she has gone back up meanwhile or the island draws it by then
        if (self.state !== 'island' || self.assets.indexOf(asset) !== -1) return;
        inUse = null;
        if (!islandUses(asset)) asset.unload();
    };
    for (var i = assets.length - 1; i >= 0; i--) {
        var asset = assets[i];
        if (!asset || asset.type === 'script' || !own[asset.id]) continue;
        if (asset.loaded) {
            if (!islandUses(asset)) asset.unload();
        } else if (asset.loading) {
            asset.once('load', unloadLate);
        }
    }
    var item = this.app.scenes.find(this.sceneName);
    if (item) this.app.scenes.unloadSceneData(item);
};

// Asset ids the world draws right now ({ id: true }): the model, its .glb, the
// materials and their textures of every render component that is on. Ones
// that are off (culled far away) ask for theirs again when switched on.
// Walked once per trip down.
SkyWorld.prototype.assetsInUse = function () {
    var registry = this.app.assets;
    var used = {};
    var idOf = function (ref) {
        return ref && typeof ref === 'object' ? ref.id : ref;
    };
    var store = (this.app.systems.render && this.app.systems.render.store) || {};
    for (var key in store) {
        var entity = store[key] && store[key].entity;
        var render = entity && entity.render;
        if (!render || !render.enabled || !entity._enabledInHierarchy) continue;
        var model = registry.get(idOf(render.asset));
        if (model) {
            used[model.id] = true;
            var container = model.data && idOf(model.data.containerAsset);
            if (container) used[container] = true;
        }
        var materials = render.materialAssets || [];
        for (var i = 0; i < materials.length; i++) {
            var material = registry.get(idOf(materials[i]));
            if (!material || used[material.id]) continue;
            used[material.id] = true;
            var data = material.data || {};
            for (var name in data) {
                if (/Map$/.test(name) && typeof data[name] === 'number') used[data[name]] = true;
            }
        }
    }
    return used;
};

/* --- Going up and down -------------------------------------------------------- */

SkyWorld.prototype.goUp = function () {
    var player = this.app.localPlayer;
    if (this.state !== 'island' || !player) return;
    this.state = 'loading';
    this.app.fire('skyWorld:loading');
    var self = this;
    var started = performance.now();
    this.prepare(function (err, root) {
        if (err || !root) {
            console.warn('[SkyWorld] the sky did not load', err);
            self.state = 'island';
            self.app.fire('skyWorld:failed');
            return;
        }
        self.loadMs = Math.round(performance.now() - started);
        self._back = { position: player.getPosition().clone(), yaw: player.getEulerAngles().y };
        self.setSkyLook(true);
        var arrival = root.findByName('SkyArrival');
        var at = arrival ? arrival.getPosition() : new pc.Vec3(SKY_ARRIVAL[0], SKY_ARRIVAL[1], SKY_ARRIVAL[2]);
        self.movePlayer(player, at, arrival ? arrival.getEulerAngles().y : 0);
        self.state = 'sky';
        self.app.fire('skyWorld:up');
        console.log('[SkyWorld] up: the ground loaded in ' + self.loadMs + ' ms (the rest follows)');
    });
};

SkyWorld.prototype.goDown = function () {
    if (this.state !== 'sky') return;
    var player = this.app.localPlayer;
    this.setSkyLook(false);
    if (player && this._back) this.movePlayer(player, this._back.position, this._back.yaw);
    this.state = 'island';
    this.unloadSky();
    this.app.fire('skyWorld:down');
    console.log('[SkyWorld] down: the sky unloaded');
};

// Night above the clouds: the island's sky sphere off, its sun as the moon,
// a violet ambient. Everything is put back as it was when coming down.
SkyWorld.prototype.setSkyLook = function (sky) {
    var root = this.app.root;
    var skybox = root.findByName('Skybox');
    var gameManager = this.app.gameManager;
    var light = (gameManager && gameManager.light && !gameManager.light.destroyed) ? gameManager.light : root.findByName('Light');
    var scene = this.app.scene;
    if (sky) {
        if (this._saved) return;
        this._saved = {
            skybox: skybox ? skybox.enabled : null,
            light: light && light.light ? {
                color: light.light.color.clone(),
                intensity: light.light.intensity,
                rotation: light.getLocalEulerAngles().clone()
            } : null,
            ambient: scene.ambientLight.clone(),
            fog: {
                type: scene.fog.type,
                color: scene.fog.color.clone(),
                start: scene.fog.start,
                end: scene.fog.end,
                density: scene.fog.density
            },
            exposure: scene.exposure,
            sky: scene.skybox,
            skyMip: scene.skyboxMip,
            skyIntensity: scene.skyboxIntensity,
            skyRotation: scene.skyboxRotation.clone()
        };
        if (skybox) skybox.enabled = false;
        var night = this.skyTexture && this.skyTexture.resource;
        if (night) {
            night.projection = pc.TEXTUREPROJECTION_EQUIRECT;
            this._skyCube = pc.EnvLighting.generateSkyboxCubemap(night, 512);
            scene.skybox = this._skyCube;
            scene.skyboxMip = 0;
            scene.skyboxIntensity = 1;            // the sky scene's own, if it has one, below
        }
        var moon = this._moon || SKY_MOON;
        if (light && light.light) {
            light.light.color = new pc.Color(moon.color[0], moon.color[1], moon.color[2]);
            light.light.intensity = moon.intensity;
            light.setLocalEulerAngles(moon.rotation[0], moon.rotation[1], moon.rotation[2]);
        }
        this.applySkySettings(scene);
        return;
    }
    var saved = this._saved;
    this._saved = null;
    if (!saved) return;
    if (skybox && saved.skybox !== null) skybox.enabled = saved.skybox;
    if (light && light.light && saved.light) {
        light.light.color = saved.light.color;
        light.light.intensity = saved.light.intensity;
        light.setLocalEulerAngles(saved.light.rotation);
    }
    scene.ambientLight = saved.ambient;
    scene.fog.type = saved.fog.type;
    scene.fog.color.copy(saved.fog.color);
    scene.fog.start = saved.fog.start;
    scene.fog.end = saved.fog.end;
    scene.fog.density = saved.fog.density;
    scene.exposure = saved.exposure;
    scene.skybox = saved.sky || null;
    scene.skyboxMip = saved.skyMip;
    scene.skyboxIntensity = saved.skyIntensity;
    scene.skyboxRotation = saved.skyRotation;
    if (this._skyCube) {
        this._skyCube.destroy();
        this._skyCube = null;
    }
};

// The sky scene's ambient, fog, exposure and skybox intensity/rotation (its Scene
// Settings in the Editor), each only if the scene has it.
SkyWorld.prototype.applySkySettings = function (scene) {
    var render = this._settings && this._settings.render;
    if (!render) {
        scene.ambientLight = new pc.Color(SKY_AMBIENT[0], SKY_AMBIENT[1], SKY_AMBIENT[2]);
        return;
    }
    var ambient = render.global_ambient;
    if (ambient) scene.ambientLight = new pc.Color(ambient[0], ambient[1], ambient[2]);
    if (typeof render.fog === 'string') {
        scene.fog.type = render.fog;
        if (render.fog_color) scene.fog.color.set(render.fog_color[0], render.fog_color[1], render.fog_color[2]);
        if (typeof render.fog_start === 'number') scene.fog.start = render.fog_start;
        if (typeof render.fog_end === 'number') scene.fog.end = render.fog_end;
        if (typeof render.fog_density === 'number') scene.fog.density = render.fog_density;
    }
    if (typeof render.exposure === 'number') scene.exposure = render.exposure;
    if (typeof render.skyboxIntensity === 'number') scene.skyboxIntensity = render.skyboxIntensity;
    var r = render.skyboxRotation;
    if (r) scene.skyboxRotation = new pc.Quat().setFromEulerAngles(r[0], r[1], r[2]);
};

// As TeleportButton.movePlayerTo, then the new place goes to the server at once.
SkyWorld.prototype.movePlayer = function (player, position, yaw) {
    if (player.parent !== this.app.root) this.app.root.addChild(player);
    player.setPosition(position);
    player.setEulerAngles(0, yaw, 0);
    var rigidbody = player.rigidbody;
    if (rigidbody) {
        rigidbody.enabled = true;
        if (rigidbody.teleport) rigidbody.teleport(position, player.getRotation());
        rigidbody.linearVelocity = new pc.Vec3();
        rigidbody.angularVelocity = new pc.Vec3();
    }
    if (player.collision) player.collision.enabled = true;
    var gameManager = this.app.gameManager;
    if (gameManager && typeof gameManager.sendMove === 'function') {
        var p = player.getPosition();
        gameManager.sendMove(p.x, p.y, p.z, player.getRotation(), 0, 0, false, false, '');
    }
};
