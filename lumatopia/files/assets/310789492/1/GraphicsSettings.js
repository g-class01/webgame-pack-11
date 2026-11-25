// Graphics quality (2026-10-11): the Graphics page in Settings (SettingsUI.js
// and SettingsView.js draw it; this script owns the choices). Four presets and
// three options; the sun is always on, and antialiasing stays a project
// setting (WebGL fixes it when the game starts).
//
//   Low    no shadows, no bloom, 1x resolution           (phones start here)
//   Mid    no shadows, bloom, the usual resolution cap   (computers start here)
//   High   shadows (1024, one cascade), bloom
//   Ultra  shadows (4096, three cascades), bloom, the screen's own sharpness
//
// The options (Bloom, Shadows, Resolution) can be set one by one; the preset
// then reads Custom. Choices are kept per device in localStorage. Resolution
// is applied by GameManager.applyDisplayScaling, which reads getResolution().
// Should the game run slowly after a heavier choice, a short tip suggests a
// lower setting once the menu is closed (at most once a session).
var GraphicsSettings = pc.createScript('graphicsSettings');

GraphicsSettings.attributes.add('slowFps', {
    type: 'number', default: 24, min: 5, title: 'Slow FPS',
    description: 'Average frames per second under which the "running slow" tip shows after a heavier setting.'
});
GraphicsSettings.attributes.add('watchSeconds', {
    type: 'number', default: 10, min: 2, title: 'Watch Seconds',
    description: 'How long the frame rate is watched (menus closed) after a heavier setting.'
});

GraphicsSettings.PRESETS = {
    low: { bloom: false, shadows: 'off', resolution: 'low' },
    mid: { bloom: true, shadows: 'off', resolution: 'normal' },
    high: { bloom: true, shadows: 'high', resolution: 'normal' },
    ultra: { bloom: true, shadows: 'ultra', resolution: 'sharp' }
};
GraphicsSettings.PRESET_ORDER = ['low', 'mid', 'high', 'ultra'];
GraphicsSettings.SHADOWS = {
    off: null,
    high: { resolution: 1024, cascades: 1 },
    ultra: { resolution: 4096, cascades: 3 }
};
GraphicsSettings.OPTIONS = {
    bloom: [false, true],
    shadows: ['off', 'high', 'ultra'],
    resolution: ['low', 'normal', 'sharp']
};
GraphicsSettings.STORAGE_KEY = 'LumatopiaGraphicsV1';

GraphicsSettings.prototype.initialize = function () {
    this.app.graphicsSettings = this;
    this._settings = null;
    this._watch = null;
    this._warned = false;
    this.on('destroy', function () {
        if (this.app.graphicsSettings === this) this.app.graphicsSettings = null;
    }, this);
};

// After GameManager.initialize, which sets up phones its own way first.
GraphicsSettings.prototype.postInitialize = function () {
    this._settings = this.load();
    this.apply();
};

GraphicsSettings.prototype.isMobile = function () {
    var app = this.app;
    return !!(app.isMobileHardware !== undefined ? app.isMobileHardware : app.isMobile);
};

// The preset each device starts on: what it had before this menu existed.
GraphicsSettings.prototype.getRecommended = function () {
    return this.isMobile() ? 'low' : 'mid';
};

GraphicsSettings.prototype.copyPreset = function (name) {
    var preset = GraphicsSettings.PRESETS[name] || GraphicsSettings.PRESETS.mid;
    return { bloom: preset.bloom, shadows: preset.shadows, resolution: preset.resolution };
};

GraphicsSettings.prototype.load = function () {
    var saved = null;
    try {
        saved = JSON.parse(window.localStorage.getItem(GraphicsSettings.STORAGE_KEY) || 'null');
    } catch (e) {
        saved = null;
    }
    var settings = this.copyPreset(this.getRecommended());
    if (saved && typeof saved === 'object') {
        if (typeof saved.bloom === 'boolean') settings.bloom = saved.bloom;
        if (GraphicsSettings.OPTIONS.shadows.indexOf(saved.shadows) !== -1) settings.shadows = saved.shadows;
        if (GraphicsSettings.OPTIONS.resolution.indexOf(saved.resolution) !== -1) settings.resolution = saved.resolution;
    }
    return settings;
};

GraphicsSettings.prototype.save = function () {
    try {
        window.localStorage.setItem(GraphicsSettings.STORAGE_KEY, JSON.stringify(this._settings));
    } catch (e) { /* private mode: kept for this visit only */ }
};

GraphicsSettings.prototype.get = function () {
    if (!this._settings) this._settings = this.load();
    return this._settings;
};

GraphicsSettings.prototype.getResolution = function () {
    return this.get().resolution;
};

// The preset the current choices match, or 'custom'.
GraphicsSettings.prototype.getPreset = function () {
    var s = this.get();
    for (var i = 0; i < GraphicsSettings.PRESET_ORDER.length; i++) {
        var name = GraphicsSettings.PRESET_ORDER[i];
        var p = GraphicsSettings.PRESETS[name];
        if (p.bloom === s.bloom && p.shadows === s.shadows && p.resolution === s.resolution) return name;
    }
    return 'custom';
};

GraphicsSettings.prototype.getState = function () {
    var s = this.get();
    return {
        preset: this.getPreset(),
        recommended: this.getRecommended(),
        bloom: s.bloom,
        shadows: s.shadows,
        resolution: s.resolution
    };
};

GraphicsSettings.prototype.setPreset = function (name) {
    if (!GraphicsSettings.PRESETS[name]) return;
    this.change(this.copyPreset(name));
};

GraphicsSettings.prototype.setOption = function (key, value) {
    var allowed = GraphicsSettings.OPTIONS[key];
    if (!allowed || allowed.indexOf(value) === -1) return;
    var next = this.copy(this.get());
    next[key] = value;
    this.change(next);
};

GraphicsSettings.prototype.reset = function () {
    this.setPreset(this.getRecommended());
};

GraphicsSettings.prototype.copy = function (s) {
    return { bloom: s.bloom, shadows: s.shadows, resolution: s.resolution };
};

// How heavy a set of choices is, to tell a step up from a step down.
GraphicsSettings.prototype.cost = function (s) {
    return (s.bloom ? 1 : 0) +
        GraphicsSettings.OPTIONS.shadows.indexOf(s.shadows) * 2 +
        GraphicsSettings.OPTIONS.resolution.indexOf(s.resolution) * 2;
};

GraphicsSettings.prototype.change = function (next) {
    var before = this.get();
    if (before.bloom === next.bloom && before.shadows === next.shadows && before.resolution === next.resolution) return;
    var heavier = this.cost(next) > this.cost(before);
    this._settings = next;
    this.save();
    this.apply();
    // A step up is watched once the menus are closed; a step down calls it off.
    if (heavier) this._watch = { pending: true, time: 0, frames: 0 };
    else this._watch = null;
    this.app.fire('graphics:changed', this.getState());
    if (this.app.pokiAnalytics) this.app.pokiAnalytics.measure('settings', 'graphics', this.getPreset());
};

GraphicsSettings.prototype.getCamera = function () {
    var gameManager = this.app.gameManager;
    var camera = gameManager && gameManager.camera;
    return camera && !camera.destroyed ? camera : this.app.root.findByName('Camera');
};

GraphicsSettings.prototype.getLight = function () {
    var gameManager = this.app.gameManager;
    var light = gameManager && gameManager.light;
    if (!light || light.destroyed) light = this.app.root.findByName('Light');
    return light && light.light ? light : null;
};

GraphicsSettings.prototype.apply = function () {
    var s = this.get();
    var camera = this.getCamera();
    var bloom = camera && camera.script && camera.script.bloom;
    if (bloom && bloom.enabled !== s.bloom) bloom.enabled = s.bloom;

    var light = this.getLight();
    if (light) {
        // The sun always shines; only its shadows change.
        var shadow = GraphicsSettings.SHADOWS[s.shadows];
        var component = light.light;
        if (!shadow) {
            if (component.castShadows) component.castShadows = false;
        } else {
            if (component.shadowResolution !== shadow.resolution) component.shadowResolution = shadow.resolution;
            if (component.numCascades !== shadow.cascades) component.numCascades = shadow.cascades;
            if (!component.castShadows) component.castShadows = true;
        }
    }

    var gameManager = this.app.gameManager;
    if (gameManager && typeof gameManager.applyDisplayScaling === 'function') gameManager.applyDisplayScaling();
};

// The tip after a heavier choice: watched only while no menu is open, so the
// menu's own pause does not count, and shown once a session at most.
GraphicsSettings.prototype.update = function (dt) {
    var watch = this._watch;
    if (!watch || this._warned) return;
    if (typeof LumatopiaMenus !== 'undefined' && LumatopiaMenus.isOpen(this.app)) return;
    if (!(dt > 0) || dt > 1) return;
    watch.time += dt;
    watch.frames++;
    if (watch.time < Number(this.watchSeconds || 10)) return;
    var fps = watch.frames / watch.time;
    this._watch = null;
    if (fps >= Number(this.slowFps || 24)) return;
    this._warned = true;
    this.showTip(this.tr('Game running slow? Try a lower graphics setting.'));
    if (this.app.pokiAnalytics) this.app.pokiAnalytics.measure('settings', 'graphics-slow', this.getPreset());
};

GraphicsSettings.prototype.tr = function (text) {
    var i18n = this.app.i18n;
    if (!i18n || typeof i18n.getText !== 'function') return text;
    try { return i18n.getText(text) || text; } catch (e) { return text; }
};

GraphicsSettings.prototype.showTip = function (text) {
    var ui = this.app.root.findByName('GameUI');
    var pool = this.app.poolManager;
    if (ui && pool && typeof pool.createUILogText === 'function') pool.createUILogText(text, ui, pc.Color.YELLOW);
};
