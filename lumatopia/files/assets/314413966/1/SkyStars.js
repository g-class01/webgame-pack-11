var SkyStars = pc.createScript('skyStars');

SkyStars.attributes.add('count', { type: 'number', default: 2600, min: 0, max: 8000, title: 'Stars' });
SkyStars.attributes.add('minElevation', {
    type: 'number', default: 14, min: 0, max: 60, title: 'Lowest Star (deg)',
    description: 'No stars below this angle above the horizon (where the cloud towers are, and the sky glows).'
});
SkyStars.attributes.add('radius', {
    type: 'number', default: 360, min: 50, max: 390, title: 'Distance (m)',
    description: 'How far from the camera the stars are drawn; must stay inside the camera\'s far clip (400 m).'
});
SkyStars.attributes.add('starSize', {
    type: 'vec2', default: [0.55, 1.9], title: 'Star Size (m)',
    description: 'Smallest and largest star, in metres at that distance (about 0.33 m per pixel on a 1080p screen).'
});
SkyStars.attributes.add('brightness', { type: 'number', default: 1.6, min: 0, max: 5, title: 'Brightness' });
SkyStars.attributes.add('twinkle', { type: 'number', default: 0.45, min: 0, max: 1, title: 'Twinkle' });
SkyStars.attributes.add('moonSize', { type: 'number', default: 9, min: 0, max: 40, title: 'Moon Size (deg)', description: 'How wide the moon looks, in degrees of sky.' });
SkyStars.attributes.add('moonBrightness', { type: 'number', default: 1.4, min: 0, max: 5, title: 'Moon Brightness' });
SkyStars.attributes.add('seed', { type: 'number', default: 4242, title: 'Seed' });

// Sharp stars and moon for the sky above the clouds (the user, 2026-11-04: the
// skybox panorama made them blurry). The skybox (SkyWorld.js, from NightSky.jpg)
// keeps only the soft gradient and nebula; the stars are tiny sprites on a
// sphere round the camera, so they are crisp at any screen size, and the moon is
// one sprite where the moonlight comes from (the island's Light, which SkyWorld
// turns into the moon: it shines from its +Y side).
// - Built here at runtime, from a seed (every player sees the same sky); no
//   model or texture assets. Three meshes, one draw call each, additive, no
//   depth writes; they twinkle by fading in turn (one uniform each per frame).
// - The group follows the camera every frame, so the sky never comes closer.
//   The moon is placed again on skyWorld:up (SkyWorld turns the light after the
//   scene, and so this script, has loaded).
//   Stars are drawn closer than the far clip, so none sit low enough to cover
//   the cloud towers (minElevation).
// - Everything made here is destroyed with the sky scene.
SkyStars.LAYERS = 3;

SkyStars.prototype.initialize = function () {
    this._made = [];
    this._time = 0;
    this.group = new pc.Entity('SkyStarsGroup');
    this.entity.addChild(this.group);
    this.build();
    this.app.on('skyWorld:up', this.placeMoon, this);
    this.on('attr', this.rebuild, this);
    this.on('enable', function () { if (this.group) this.group.enabled = true; }, this);
    this.on('disable', function () { if (this.group) this.group.enabled = false; }, this);
    this.on('destroy', function () {
        this.app.off('skyWorld:up', this.placeMoon, this);
        this.clear();
    }, this);
};

SkyStars.prototype.rebuild = function () {
    this.clear();
    this.group = new pc.Entity('SkyStarsGroup');
    this.entity.addChild(this.group);
    this.build();
};

SkyStars.prototype.clear = function () {
    if (this.group && !this.group.destroyed) this.group.destroy();
    this.group = null;
    for (var i = 0; i < this._made.length; i++) {
        if (this._made[i] && this._made[i].destroy) this._made[i].destroy();
    }
    this._made = [];
    this._layers = null;
    this._moon = null;
};

// Same numbers on every device: mulberry32.
SkyStars.prototype.random = function (seed) {
    var s = seed >>> 0;
    return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

SkyStars.prototype.makeTexture = function (size, draw) {
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    draw(canvas.getContext('2d'), size);
    var texture = new pc.Texture(this.app.graphicsDevice, {
        name: 'SkyStarsTexture',
        width: size,
        height: size,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });
    texture.setSource(canvas);
    this._made.push(texture);
    return texture;
};

SkyStars.prototype.makeMaterial = function (texture, intensity) {
    var material = new pc.StandardMaterial();
    material.diffuse.set(0, 0, 0);
    material.emissive.set(1, 1, 1);
    material.emissiveMap = texture;
    material.emissiveVertexColor = true;
    material.emissiveIntensity = intensity;
    material.useLighting = false;
    material.useSkybox = false;
    material.useFog = false;
    material.blendType = pc.BLEND_ADDITIVE;
    material.depthWrite = false;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    this._made.push(material);
    return material;
};

// Quads facing the middle (where the camera is), one per star.
SkyStars.prototype.makeMesh = function (stars) {
    var positions = [];
    var uvs = [];
    var colors = [];
    var indices = [];
    var t = new pc.Vec3();
    var b = new pc.Vec3();
    var up = pc.Vec3.UP;
    for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var d = s.dir;
        t.cross(Math.abs(d.y) > 0.99 ? pc.Vec3.RIGHT : up, d).normalize();
        b.cross(d, t).normalize();
        var cx = d.x * s.dist, cy = d.y * s.dist, cz = d.z * s.dist;
        var h = s.size * 0.5;
        var base = positions.length / 3;
        var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (var c = 0; c < 4; c++) {
            var u = corners[c][0] * h, v = corners[c][1] * h;
            positions.push(cx + t.x * u + b.x * v, cy + t.y * u + b.y * v, cz + t.z * u + b.z * v);
            uvs.push((corners[c][0] + 1) * 0.5, (corners[c][1] + 1) * 0.5);
            colors.push(s.color[0], s.color[1], s.color[2], 255);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setUvs(0, uvs);
    mesh.setColors32(colors);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    this._made.push(mesh);
    return mesh;
};

SkyStars.prototype.addMesh = function (name, mesh, material) {
    var entity = new pc.Entity(name);
    var instance = new pc.MeshInstance(mesh, material);
    instance.cull = false;                       // the group sits on the camera: always in view
    entity.addComponent('render', { castShadows: false, receiveShadows: false });
    entity.render.meshInstances = [instance];
    this.group.addChild(entity);
    return entity;
};

SkyStars.prototype.build = function () {
    var rand = this.random(this.seed | 0);
    // a soft round star with a faint four-point glint
    var starTex = this.makeTexture(64, function (ctx, n) {
        var g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
        g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
        var arm = ctx.createLinearGradient(0, 0, n, 0);
        arm.addColorStop(0, 'rgba(255,255,255,0)'); arm.addColorStop(0.5, 'rgba(255,255,255,0.5)'); arm.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = arm; ctx.fillRect(0, n / 2 - 1, n, 2);
        var arm2 = ctx.createLinearGradient(0, 0, 0, n);
        arm2.addColorStop(0, 'rgba(255,255,255,0)'); arm2.addColorStop(0.5, 'rgba(255,255,255,0.5)'); arm2.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = arm2; ctx.fillRect(n / 2 - 1, 0, 2, n);
    });
    var tints = [[255, 255, 255], [255, 236, 250], [228, 236, 255], [255, 246, 214], [214, 250, 255], [255, 214, 240]];
    var layers = [];
    for (var l = 0; l < SkyStars.LAYERS; l++) layers.push([]);
    var minSin = Math.sin(this.minElevation * pc.math.DEG_TO_RAD);
    var count = Math.max(0, this.count | 0);
    for (var i = 0; i < count; i++) {
        // more of them overhead, fewer near the horizon
        var y = minSin + (1 - minSin) * Math.pow(rand(), 0.8);
        var a = rand() * Math.PI * 2;
        var r = Math.sqrt(Math.max(0, 1 - y * y));
        var big = Math.pow(rand(), 4);           // most are tiny, a few are bright
        var tint = tints[Math.floor(rand() * tints.length)];
        var fade = 0.45 + 0.55 * rand() * (0.5 + 0.5 * y);   // dimmer down low
        layers[i % SkyStars.LAYERS].push({
            dir: new pc.Vec3(r * Math.cos(a), y, r * Math.sin(a)),
            dist: this.radius,
            size: this.starSize.x + (this.starSize.y - this.starSize.x) * big,
            color: [Math.round(tint[0] * fade), Math.round(tint[1] * fade), Math.round(tint[2] * fade)]
        });
    }
    this._layers = [];
    for (var k = 0; k < layers.length; k++) {
        var material = this.makeMaterial(starTex, this.brightness);
        this.addMesh('SkyStars' + k, this.makeMesh(layers[k]), material);
        this._layers.push({ material: material, speed: 0.6 + 0.5 * rand(), phase: rand() * Math.PI * 2 });
    }

    // the moon: a soft full disc with a halo round it
    var moonTex = this.makeTexture(256, function (ctx, n) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n);
        var c = n / 2;
        var halo = ctx.createRadialGradient(c, c, n * 0.16, c, c, n * 0.5);
        halo.addColorStop(0, 'rgba(190,170,255,0.55)');
        halo.addColorStop(1, 'rgba(190,170,255,0)');
        ctx.fillStyle = halo; ctx.fillRect(0, 0, n, n);
        var disc = ctx.createRadialGradient(c - n * 0.04, c - n * 0.04, 0, c, c, n * 0.17);
        disc.addColorStop(0, 'rgba(255,252,236,1)');
        disc.addColorStop(0.85, 'rgba(252,240,214,1)');
        disc.addColorStop(1, 'rgba(240,226,206,1)');
        ctx.beginPath(); ctx.arc(c, c, n * 0.17, 0, Math.PI * 2); ctx.fillStyle = disc; ctx.fill();
        // a few soft maria
        ctx.globalAlpha = 0.16; ctx.fillStyle = '#b8a8c8';
        [[-0.05, -0.04, 0.05], [0.05, 0.02, 0.035], [-0.01, 0.07, 0.03], [0.07, -0.07, 0.02]].forEach(function (m) {
            ctx.beginPath(); ctx.arc(c + m[0] * n, c + m[1] * n, m[2] * n, 0, Math.PI * 2); ctx.fill();
        });
        ctx.globalAlpha = 1;
    });
    var moonQuad = [{ dir: new pc.Vec3(0, 0, 1), dist: this.radius * 0.98, size: 1, color: [255, 255, 255] }];
    this._moonMaterial = this.makeMaterial(moonTex, this.moonBrightness);
    // moonSize is the disc's width in degrees; the disc is 34% of the quad (the rest is halo)
    this._moonSize = 2 * this.radius * 0.98 * Math.tan(this.moonSize * 0.5 * pc.math.DEG_TO_RAD) / 0.34;
    this._moon = this.addMesh('SkyMoon', this.makeMesh(moonQuad), this._moonMaterial);
    this.placeMoon();
};

// The moon sits where the moonlight comes from: the light's +Y side.
SkyStars.prototype.placeMoon = function () {
    if (!this._moon) return;
    var gm = this.app.gameManager;
    var light = gm && gm.light && !gm.light.destroyed ? gm.light : this.app.root.findByName('Light');
    var dir = light ? light.up.clone() : new pc.Vec3(0, 0.5, 0.85);
    if (dir.y < 0.05) dir.y = 0.05;
    dir.normalize();
    // the quad was built facing +z at the right distance: turn it to face dir, size it
    var m = new pc.Mat4().setLookAt(pc.Vec3.ZERO, dir.clone().mulScalar(-1), pc.Vec3.UP);
    this._moon.setLocalRotation(new pc.Quat().setFromMat4(m));
    var s = this._moonSize;
    this._moon.setLocalScale(s, s, 1);
};

SkyStars.prototype.update = function (dt) {
    if (!this.group) return;
    var cam = this.app.systems.camera.cameras[0];
    if (cam) this.group.setPosition(cam.entity.getPosition());
    this._time += dt;
    var tw = Math.max(0, Math.min(1, this.twinkle));
    var layers = this._layers || [];
    for (var i = 0; i < layers.length; i++) {
        var L = layers[i];
        L.material.emissiveIntensity = this.brightness * (1 - tw * 0.5 + tw * 0.5 * Math.sin(this._time * L.speed * 2 + L.phase));
        L.material.update();
    }
};
