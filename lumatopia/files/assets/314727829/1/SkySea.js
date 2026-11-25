var SkySea = pc.createScript('skySea');

SkySea.attributes.add('camera', {
    type: 'entity',
    title: 'Camera',
    description: 'Optional. The camera whose depth map the water reads; empty = the game camera.'
});
SkySea.attributes.add('shallowColor', { type: 'rgb', default: [0.33, 0.66, 1.0], title: 'Shallow Colour' });
SkySea.attributes.add('deepColor', { type: 'rgb', default: [0.14, 0.13, 0.5], title: 'Deep Colour' });
SkySea.attributes.add('skyColor', {
    type: 'rgb',
    default: [0.45, 0.48, 0.95],
    title: 'Reflection Colour',
    description: 'What the water mirrors when seen at a low angle.'
});
SkySea.attributes.add('foamColor', { type: 'rgb', default: [0.97, 0.9, 1.0], title: 'Foam Colour' });
SkySea.attributes.add('glintColor', { type: 'rgb', default: [1.0, 0.95, 1.0], title: 'Glint Colour' });
SkySea.attributes.add('deepDepth', {
    type: 'number',
    default: 1.6,
    min: 0.05,
    title: 'Deep At (m)',
    description: 'Water this deep is almost fully the deep colour.'
});
SkySea.attributes.add('clarity', {
    type: 'number',
    default: 0.35,
    min: 0,
    max: 1,
    title: 'Shallow Opacity',
    description: 'How solid the water is where it is very shallow (0 = clear, the ground shows).'
});
SkySea.attributes.add('foamLine', {
    type: 'number',
    default: 8,
    min: 0,
    max: 40,
    title: 'Foam Line (px)',
    description: 'Width of the foam line where the water meets anything, in screen pixels (0 = no foam).'
});
SkySea.attributes.add('waveScale', { type: 'number', default: 0.35, min: 0.01, title: 'Ripple Size', description: 'Ripples per metre.' });
SkySea.attributes.add('waveSpeed', { type: 'number', default: 0.35, title: 'Ripple Speed' });
SkySea.attributes.add('ripple', { type: 'number', default: 0.35, min: 0, max: 3, title: 'Ripple Strength' });
SkySea.attributes.add('reflection', { type: 'number', default: 0.8, min: 0, max: 1, title: 'Reflection' });
SkySea.attributes.add('glint', { type: 'number', default: 1.2, min: 0, title: 'Moon Glint' });
SkySea.attributes.add('sparkle', { type: 'number', default: 1.0, min: 0, title: 'Stardust Sparkle' });
SkySea.attributes.add('moon', {
    type: 'entity',
    title: 'Moon Light',
    description: 'Directional light the glints come from (MoonLight). Empty = straight above.'
});

// A sea of night-sky water over the cloud dunes (user, 2026-11-06: "add water
// shader to the Cloud dunes, I want depth effect").
//
// The depth comes from the camera's scene depth map, like the beach sea
// (Dancetopia water.mjs): for each pixel the scene behind the water is put back
// into the world, so the water knows how deep it is right there. Shallow water
// over a dune crest is light and see-through, the troughs go deep indigo, and a
// crisp lacy foam line rings anything that stands in it (the island, the station,
// players' legs) and follows them as they move. The line is measured in pixels
// of depth change, so ground lying just under the surface makes no foam blobs. On top: the sky mirrored at low
// angles, the moon's glints on slow ripples, stardust sparkles near the camera,
// and the scene's own exp2 fog so far water melts into the haze like the dunes.
//
// The entity keeps its mesh (a plane) and is tagged "water", so Swimming.js
// treats it as a sea; its cached water list is dropped when the sky loads and
// unloads. The depth map is only asked for while this water exists, so the
// island pays nothing. GLSL only (the project is WebGL2).

SkySea.VS = [
    'attribute vec3 vertex_position;',
    'uniform mat4 matrix_model;',
    'uniform mat4 matrix_viewProjection;',
    'varying vec3 vWorldPos;',
    'void main(void) {',
    '    vec4 world = matrix_model * vec4(vertex_position, 1.0);',
    '    vWorldPos = world.xyz;',
    '    gl_Position = matrix_viewProjection * world;',
    '}'
].join('\n');

SkySea.FS = [
    '#include "gammaPS"',
    '#include "tonemappingPS"',
    '#include "screenDepthPS"',
    'varying vec3 vWorldPos;',
    'uniform vec3 view_position;',
    'uniform float uTime;',
    'uniform vec3 uShallow;',
    'uniform vec3 uDeep;',
    'uniform vec3 uSky;',
    'uniform vec3 uFoam;',
    'uniform vec3 uGlint;',
    'uniform vec3 uMoonDir;',
    'uniform vec3 uFogColor;',
    'uniform vec4 uSea;      // deep at (m), foam line (px), shallow opacity, sparkle',
    'uniform vec4 uWave;     // ripples per metre, ripple speed, reflection, glint',
    'uniform vec2 uMisc;     // ripple strength, exp2 fog density (0 = none)',
    '',
    '// hashes without sin(), steady far from the origin',
    'float hash(vec2 p) {',
    '    vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '    p3 += dot(p3, p3.yzx + 33.33);',
    '    return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float noise(vec2 p) {',
    '    vec2 i = floor(p), f = fract(p);',
    '    vec2 u = f * f * (3.0 - 2.0 * f);',
    '    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float ripples(vec2 a, vec2 b) {',
    '    return noise(a) + 0.5 * noise(b);',
    '}',
    '',
    'void main(void) {',
    '    float t = uTime;',
    '    vec2 p = vWorldPos.xz;',
    '    vec3 toPix = vWorldPos - view_position;',
    '    float dist = length(toPix);',
    '    vec3 V = -toPix / max(dist, 1e-4);',
    '',
    '    // how deep the water is under this pixel: the scene behind it, put back into the world',
    '    vec3 fwd = -vec3(matrix_view[0][2], matrix_view[1][2], matrix_view[2][2]);',
    '    float viewZ = max(dot(toPix, fwd), 1e-4);',
    '    float sceneZ = getLinearScreenDepth(gl_FragCoord.xy * screen_size.zw);',
    '    vec3 behind = view_position + toPix * (sceneZ / viewZ);',
    '    // a depth in front of the water only happens on anti-aliased edges of things standing out of it',
    '    // (the depth map holds the thing, the pixel is partly water): no foam fringe there',
    '    bool edge = sceneZ < viewZ - 0.02;',
    '    float depth = edge ? 100.0 : max(vWorldPos.y - behind.y, 0.0);',
    '    // looking in at a low angle the light crosses more water',
    '    float through = edge ? 100.0 : max(sceneZ - viewZ, 0.0) * dist / viewZ;',
    '    float d = mix(depth, through, 0.2);',
    '',
    '    // slow ripples: two drifting noises, their slope tilts the normal',
    '    float s = uWave.x, sp = uWave.y * t;',
    '    vec2 q1 = p * s + vec2(sp, sp * 0.6);',
    '    vec2 q2 = p * s * 2.1 - vec2(sp * 0.7, -sp * 0.4);',
    '    float e = 0.2;',
    '    float h0 = ripples(q1, q2);',
    '    float hx = ripples(q1 + vec2(e, 0.0), q2 + vec2(e * 2.1, 0.0)) - h0;',
    '    float hz = ripples(q1 + vec2(0.0, e), q2 + vec2(0.0, e * 2.1)) - h0;',
    '    vec3 N = normalize(vec3(-hx * uMisc.x, 1.0, -hz * uMisc.x));',
    '',
    '    // colour by depth: light shallows over the dune crests, indigo in the troughs',
    '    float deep = 1.0 - exp(-2.3 * d / uSea.x);',
    '    vec3 col = mix(uShallow, uDeep, deep);',
    '',
    '    // the night sky mirrored, strongest at low angles',
    '    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);',
    '    col = mix(col, uSky, clamp(fres * uWave.z, 0.0, 1.0));',
    '',
    '    // moonlight glinting on the ripples',
    '    vec3 H = normalize(uMoonDir + V);',
    '    float spec = pow(clamp(dot(N, H), 0.0, 1.0), 900.0);',
    '    col += uGlint * spec * uWave.w;',
    '',
    '    // stardust: a tiny glint in some of the little cells, each twinkling in its own time, near the camera only',
    '    vec2 sc = p * 3.0;',
    '    vec2 ci = floor(sc);',
    '    float r = hash(ci);',
    '    vec2 off = vec2(hash(ci + 7.1), hash(ci + 3.3)) * 0.6 + 0.2;',
    '    float len = length(fract(sc) - off);',
    '    float aa = fwidth(len);',
    '    float tw = 0.5 + 0.5 * sin(t * (1.2 + 2.5 * r) + r * 40.0);',
    '    float star = (1.0 - smoothstep(0.05 - aa, 0.05 + aa, len)) * step(0.82, r) * tw * tw;',
    '    star *= (1.0 - smoothstep(8.0, 30.0, dist)) * uSea.w;',
    '    col += uGlint * star;',
    '',
    '    // foam: a crisp lacy line along the waterline, wherever the water meets anything. It is measured in',
    '    // pixels of depth change (the slope capped, so edges of things deep under the water draw no lines),',
    '    // so ground lying just under the surface makes no blobs; only real meeting lines get foam.',
    '    float lace = noise(p * 2.2 + vec2(t * 0.12, -t * 0.09));',
    '    float px = depth / clamp(fwidth(depth), 1e-4, 0.03);',
    '    float rim = (1.0 - smoothstep(1.0, uSea.y * (0.6 + 0.8 * lace), px)) * step(1e-4, uSea.y);',
    '    rim = max(rim, (1.0 - smoothstep(0.0, 0.025, depth)) * step(1e-4, uSea.y));',
    '    float foam = clamp(rim, 0.0, 1.0);',
    '    col = mix(col, uFoam, foam);',
    '',
    '    // see-through in the shallows so the cloud ground shows, solid once deep',
    '    float alpha = max(max(mix(uSea.z, 1.0, deep), foam), clamp(star, 0.0, 1.0));',
    '    alpha = max(alpha, clamp(fres * uWave.z, 0.0, 1.0));',
    '',
    '    // the scene\'s exp2 fog, as the dunes get it',
    '    if (uMisc.y > 0.0) {',
    '        float fd = viewZ * uMisc.y;',
    '        float f = clamp(exp(-fd * fd), 0.0, 1.0);',
    '        col = mix(uFogColor, col, f);',
    '        alpha = mix(1.0, alpha, f);',
    '    }',
    '    gl_FragColor = vec4(gammaCorrectOutput(toneMap(col)), alpha);',
    '}'
].join('\n');

SkySea.prototype.initialize = function () {
    this.time = 0;
    this.material = null;
    this.swapped = [];
    this.cam = null;
    this.depthOn = false;
    this.lookTimer = 0;
    this._v3 = {};
    this._v4 = {};
    this._v2 = new Float32Array(2);
    this._moonDir = new Float32Array([0, 1, 0]);

    // The water material is only swapped in once the camera gives it a depth map;
    // until then the plane keeps its plain editor material.
    this.wantDepth(true);
    this.setup();
    this.forgetSwimWaters();

    // The plane's mesh may arrive a little later in the editor viewport.
    if (!this.swapped.length && this.entity.render) {
        this._retry = this.setup.bind(this);
        this.app.assets.on('load', this._retry);
    }
    this.on('enable', function () { this.wantDepth(true); this.setup(); }, this);
    this.on('disable', function () { this.wantDepth(false); }, this);
    this.on('destroy', function () {
        if (this._retry) this.app.assets.off('load', this._retry);
        for (var i = 0; i < this.swapped.length; i++) this.swapped[i][0].material = this.swapped[i][1];
        this.wantDepth(false);
        if (this.material) this.material.destroy();
        this.forgetSwimWaters();
    }, this);
};

// Swimming.js builds its water list once; the sky sea comes and goes with the trip up.
SkySea.prototype.forgetSwimWaters = function () {
    if (window.LumatopiaSwim) {
        window.LumatopiaSwim._waters = null;
        window.LumatopiaSwim._pendingUntil = 0;
    }
};

SkySea.prototype.setup = function () {
    var render = this.entity.render;
    var mis = render && render.meshInstances;
    if (!mis || !mis.length || this.swapped.length || !this.depthOn) return;
    if (!this.material) {
        this.material = new pc.ShaderMaterial({
            uniqueName: 'SkySea',
            vertexGLSL: SkySea.VS,
            fragmentGLSL: SkySea.FS,
            attributes: { vertex_position: pc.SEMANTIC_POSITION }
        });
        this.material.blendType = pc.BLEND_NORMAL;
        this.material.update();
    }
    for (var i = 0; i < mis.length; i++) {
        this.swapped.push([mis[i], mis[i].material]);
        mis[i].material = this.material;
    }
    render.castShadows = false;
    render.receiveShadows = false;
    if (this._retry) {
        this.app.assets.off('load', this._retry);
        this._retry = null;
    }
    this.uniforms(0);
};

// The game camera: Root's "Camera" (what the game's scripts use), else the
// first camera drawing the World layer. Bloom (Bloom.js, the engine's post
// effect queue) points the game camera at an offscreen target, so a render
// target alone doesn't rule a camera out (user, 2026-11-06: in game the water
// stayed the flat editor plane because the camera was skipped for that). One
// drawing to a target of its own, outside a post effect queue (a preview
// camera), is only a last resort.
SkySea.prototype.findCamera = function () {
    if (this.camera && this.camera.camera) return this.camera.camera;
    var world = this.app.scene.layers.getLayerByName('World');
    var draws = function (c) {
        return c && c.enabled && c.entity.enabled && (!world || c.layers.indexOf(world.id) >= 0);
    };
    var toScreen = function (c) {
        var queue = c.postEffects;
        return !c.renderTarget || !!(queue && queue.effects && queue.effects.length);
    };
    var named = this.app.root.findByName('Camera');
    if (named && draws(named.camera)) return named.camera;
    var cams = this.app.systems.camera.cameras;
    var fallback = null;
    for (var i = 0; i < cams.length; i++) {
        if (!draws(cams[i])) continue;
        if (toScreen(cams[i])) return cams[i];
        fallback = fallback || cams[i];
    }
    return fallback;
};

SkySea.prototype.wantDepth = function (on) {
    if (on && !this.depthOn) {
        this.cam = this.findCamera();
        if (!this.cam) return;                       // looked for again on a slow timer
        this.cam.requestSceneDepthMap(true);
        this.depthOn = true;
    } else if (!on && this.depthOn) {
        if (this.cam && this.cam.entity && !this.cam.entity._destroyed) this.cam.requestSceneDepthMap(false);
        this.depthOn = false;
    }
};

SkySea.prototype.lin3 = function (key, c) {
    var a = this._v3[key] || (this._v3[key] = new Float32Array(3));
    a[0] = Math.pow(c.r, 2.2);
    a[1] = Math.pow(c.g, 2.2);
    a[2] = Math.pow(c.b, 2.2);
    return a;
};

SkySea.prototype.vec4 = function (key, x, y, z, w) {
    var a = this._v4[key] || (this._v4[key] = new Float32Array(4));
    a[0] = x;
    a[1] = y;
    a[2] = z;
    a[3] = w;
    return a;
};

SkySea.prototype.uniforms = function (dt) {
    var m = this.material;
    if (!m) return;
    this.time = (this.time + dt) % 3600;
    var scene = this.app.scene;
    var fog = scene.fog;
    var fogType = fog ? fog.type : scene.fog;
    m.setParameter('uTime', this.time);
    m.setParameter('uShallow', this.lin3('shallow', this.shallowColor));
    m.setParameter('uDeep', this.lin3('deep', this.deepColor));
    m.setParameter('uSky', this.lin3('sky', this.skyColor));
    m.setParameter('uFoam', this.lin3('foam', this.foamColor));
    m.setParameter('uGlint', this.lin3('glint', this.glintColor));
    m.setParameter('uFogColor', this.lin3('fog', fog && fog.color ? fog.color : pc.Color.BLACK));
    m.setParameter('uSea', this.vec4('sea', Math.max(0.05, this.deepDepth), Math.max(0, this.foamLine), this.clarity, this.sparkle));
    m.setParameter('uWave', this.vec4('wave', this.waveScale, this.waveSpeed, this.reflection, this.glint));
    this._v2[0] = this.ripple;
    this._v2[1] = fogType === 'exp2' && fog ? fog.density : 0;
    m.setParameter('uMisc', this._v2);
    // the light shines along its -Y; the glint wants the direction towards it
    var moon = this.moon && this.moon.light ? this.moon : null;
    if (moon) {
        var up = moon.up;
        this._moonDir[0] = up.x;
        this._moonDir[1] = up.y;
        this._moonDir[2] = up.z;
    }
    m.setParameter('uMoonDir', this._moonDir);
};

SkySea.prototype.update = function (dt) {
    if (!this.depthOn) {
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
            this.lookTimer = 1;
            this.wantDepth(true);
            this.setup();
        }
    }
    this.uniforms(dt);
};
