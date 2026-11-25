/**
 * Builds a permanent dirt-path ribbon from terrain samples authored by
 * EditorTools/DirtPath.user.js.
 *
 * The saved rows are in this entity's local space. Each row contains an
 * accumulated distance followed by five position/normal pairs:
 *
 * [distance, px,py,pz,nx,ny,nz, ... five lanes total]
 *
 * Keeping the projected samples in the scene makes the runtime result
 * independent of physics initialization order and prevents the path from
 * floating above sloped terrain.
 */
var DirtPath = pc.createScript('dirtPath');

DirtPath.attributes.add('pathData', {
    type: 'string',
    default: '{"version":1,"lanes":5,"paths":[]}',
    title: 'Path Data',
    description: 'Terrain-projected ribbon data written by the Dirt Path editor brush.'
});

DirtPath.attributes.add('materialAsset', {
    type: 'asset',
    assetType: 'material',
    title: 'Dirt Material',
    description: 'Material cloned for the generated dirt ribbon. A brown fallback is used when empty.'
});

DirtPath.attributes.add('groundEntity', {
    type: 'entity',
    title: 'Editor Ground',
    description: 'Terrain collider root used by the editor brush. It is not used at runtime.'
});

DirtPath.attributes.add('uvMeters', {
    type: 'number',
    default: 2,
    min: 0.05,
    max: 100,
    title: 'Texture Length (m)',
    description: 'World-space path length covered by one vertical texture repeat.'
});

DirtPath.attributes.add('surfaceOffset', {
    type: 'number',
    default: 0.025,
    min: 0,
    max: 0.5,
    title: 'Surface Offset',
    description: 'Moves the ribbon along its saved normals to prevent z-fighting.'
});

DirtPath.attributes.add('softEdges', {
    type: 'boolean',
    default: true,
    title: 'Soft Edges',
    description: 'Uses vertex opacity to feather both sides and the ends of each path section.'
});

DirtPath.attributes.add('castShadows', {
    type: 'boolean',
    default: false,
    title: 'Cast Shadows'
});

DirtPath.attributes.add('receiveShadows', {
    type: 'boolean',
    default: true,
    title: 'Receive Shadows'
});

DirtPath.attributes.add('fallbackColor', {
    type: 'rgb',
    default: [0.38, 0.19, 0.07],
    title: 'Fallback Color',
    description: 'Used until a Dirt Material is assigned and loaded.'
});

var DIRT_PATH_VERSION = 1;
var DIRT_PATH_LANES = 5;
var DIRT_PATH_ROW_STRIDE = 1 + DIRT_PATH_LANES * 6;
var DIRT_PATH_MAX_ID = 4294967295;
var DIRT_PATH_EPSILON = 1e-8;

function dirtPathFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
}

function dirtPathRound(value) {
    var rounded = Math.round(value * 100000) / 100000;
    return rounded === 0 ? 0 : rounded;
}

function dirtPathNormalizeNormal(x, y, z) {
    var length = Math.sqrt(x * x + y * y + z * z);
    if (!isFinite(length) || length < DIRT_PATH_EPSILON) return null;

    return [
        dirtPathRound(x / length),
        dirtPathRound(y / length),
        dirtPathRound(z / length)
    ];
}

function dirtPathNormalizeRow(row, previousDistance) {
    if (!Array.isArray(row) || row.length !== DIRT_PATH_ROW_STRIDE) {
        return null;
    }

    for (var valueIndex = 0; valueIndex < row.length; valueIndex++) {
        if (!dirtPathFiniteNumber(row[valueIndex])) return null;
    }

    if (
        row[0] < 0 ||
        (
            previousDistance !== null &&
            row[0] <= previousDistance + DIRT_PATH_EPSILON
        )
    ) {
        return null;
    }

    var result = new Array(DIRT_PATH_ROW_STRIDE);
    result[0] = dirtPathRound(row[0]);

    for (var lane = 0; lane < DIRT_PATH_LANES; lane++) {
        var offset = 1 + lane * 6;
        var normal = dirtPathNormalizeNormal(
            row[offset + 3],
            row[offset + 4],
            row[offset + 5]
        );
        if (!normal) return null;

        result[offset] = dirtPathRound(row[offset]);
        result[offset + 1] = dirtPathRound(row[offset + 1]);
        result[offset + 2] = dirtPathRound(row[offset + 2]);
        result[offset + 3] = normal[0];
        result[offset + 4] = normal[1];
        result[offset + 5] = normal[2];
    }

    return result;
}

function dirtPathNormalizePath(path, seenIds) {
    if (!path || typeof path !== 'object' || !Array.isArray(path.rows)) {
        return null;
    }

    var id = Number(path.id);
    if (
        !isFinite(id) ||
        Math.floor(id) !== id ||
        id < 0 ||
        id > DIRT_PATH_MAX_ID ||
        seenIds['$' + id]
    ) {
        return null;
    }

    var rows = [];
    var previousDistance = null;

    for (var rowIndex = 0; rowIndex < path.rows.length; rowIndex++) {
        var row = dirtPathNormalizeRow(path.rows[rowIndex], previousDistance);
        if (!row) return null;
        rows.push(row);
        previousDistance = row[0];
    }

    if (rows.length < 2) return null;

    seenIds['$' + id] = true;
    return {
        id: id,
        rows: rows
    };
}

/**
 * Parses and validates serialized path data.
 *
 * Invalid path sections are skipped as a whole. This deliberately avoids
 * connecting two valid rows across a corrupt or missing terrain sample.
 *
 * @param {string|object} input - Serialized or decoded path data.
 * @returns {{version:number,lanes:number,paths:Array}}
 */
function dirtPathParseData(input) {
    var value = input;

    if (typeof value === 'string') {
        if (!value.trim()) {
            return {
                version: DIRT_PATH_VERSION,
                lanes: DIRT_PATH_LANES,
                paths: []
            };
        }

        try {
            value = JSON.parse(value);
        } catch (error) {
            return {
                version: DIRT_PATH_VERSION,
                lanes: DIRT_PATH_LANES,
                paths: []
            };
        }
    }

    if (
        !value ||
        typeof value !== 'object' ||
        Number(value.version) !== DIRT_PATH_VERSION ||
        Number(value.lanes) !== DIRT_PATH_LANES ||
        !Array.isArray(value.paths)
    ) {
        return {
            version: DIRT_PATH_VERSION,
            lanes: DIRT_PATH_LANES,
            paths: []
        };
    }

    var paths = [];
    var seenIds = Object.create(null);

    for (var pathIndex = 0; pathIndex < value.paths.length; pathIndex++) {
        var path = dirtPathNormalizePath(value.paths[pathIndex], seenIds);
        if (path) paths.push(path);
    }

    return {
        version: DIRT_PATH_VERSION,
        lanes: DIRT_PATH_LANES,
        paths: paths
    };
}

function dirtPathSerializeData(input) {
    return JSON.stringify(dirtPathParseData(input));
}

function dirtPathGetLaneAlpha(lane, rowIndex, rowCount, softEdges) {
    if (!softEdges) return 255;

    var sideAlpha = (
        lane === 0 ||
        lane === DIRT_PATH_LANES - 1
    ) ? 0 : 255;

    if (
        rowCount >= 4 &&
        (rowIndex === 0 || rowIndex === rowCount - 1)
    ) {
        return 0;
    }
    return sideAlpha;
}

/**
 * Converts path rows into local-space indexed mesh streams.
 *
 * Kept as a pure function so the geometry contract can be tested without a
 * graphics device.
 */
function dirtPathBuildGeometry(input, options) {
    var data = dirtPathParseData(input);
    var settings = options || {};
    var uvMeters = Math.max(Number(settings.uvMeters) || 2, 0.05);
    var surfaceOffset = Math.max(Number(settings.surfaceOffset) || 0, 0);
    var softEdges = settings.softEdges !== false;
    var positions = [];
    var normals = [];
    var uvs = [];
    var colors = [];
    var indices = [];

    for (var pathIndex = 0; pathIndex < data.paths.length; pathIndex++) {
        var path = data.paths[pathIndex];
        var baseVertex = positions.length / 3;

        for (var rowIndex = 0; rowIndex < path.rows.length; rowIndex++) {
            var row = path.rows[rowIndex];

            for (var lane = 0; lane < DIRT_PATH_LANES; lane++) {
                var offset = 1 + lane * 6;
                var normalX = row[offset + 3];
                var normalY = row[offset + 4];
                var normalZ = row[offset + 5];

                positions.push(
                    row[offset] + normalX * surfaceOffset,
                    row[offset + 1] + normalY * surfaceOffset,
                    row[offset + 2] + normalZ * surfaceOffset
                );
                normals.push(normalX, normalY, normalZ);
                uvs.push(
                    lane / (DIRT_PATH_LANES - 1),
                    row[0] / uvMeters
                );

                var alpha = dirtPathGetLaneAlpha(
                    lane,
                    rowIndex,
                    path.rows.length,
                    softEdges
                );
                colors.push(255, 255, 255, alpha);
            }
        }

        for (
            var segmentIndex = 0;
            segmentIndex < path.rows.length - 1;
            segmentIndex++
        ) {
            for (var cellLane = 0; cellLane < DIRT_PATH_LANES - 1; cellLane++) {
                var a = baseVertex +
                    segmentIndex * DIRT_PATH_LANES +
                    cellLane;
                var b = a + 1;
                var c = a + DIRT_PATH_LANES;
                var d = c + 1;

                // Winding faces the saved upward terrain normals.
                indices.push(a, c, b, b, c, d);
            }
        }
    }

    return {
        positions: positions,
        normals: normals,
        uvs: uvs,
        colors: colors,
        indices: indices,
        pathCount: data.paths.length
    };
}

DirtPath.prototype.initialize = function () {
    this._meshEntity = null;
    this._mesh = null;
    this._meshInstance = null;
    this._material = null;
    this._ownsMaterial = false;
    this._materialWaitingFor = null;
    this._destroyed = false;

    this.on('attr', this._onAttributeChanged, this);
    this.on('enable', this._onEnable, this);
    this.on('disable', this._onDisable, this);
    this.on('destroy', this._onDestroy, this);

    this.rebuild();
};

DirtPath.prototype._onAttributeChanged = function () {
    if (this._destroyed) return;
    this.rebuild();
};

DirtPath.prototype._onEnable = function () {
    if (this._destroyed) return;
    if (this._meshEntity) {
        this._meshEntity.enabled = true;
    } else {
        this.rebuild();
    }
};

DirtPath.prototype._onDisable = function () {
    if (this._meshEntity) this._meshEntity.enabled = false;
};

DirtPath.prototype._onDestroy = function () {
    this._destroyed = true;
    this._clearGenerated();
};

DirtPath.prototype._clearGenerated = function () {
    var meshWasAttached = !!(
        this._meshEntity &&
        this._meshEntity.render &&
        this._meshEntity.render.meshInstances &&
        this._meshEntity.render.meshInstances.length
    );

    if (this._meshEntity && this._meshEntity.render) {
        // RenderComponent owns attached MeshInstances. Detaching them releases
        // their mesh reference in PlayCanvas 2.8, so do not destroy it twice.
        this._meshEntity.render.meshInstances = [];
    }

    if (
        !meshWasAttached &&
        this._mesh &&
        typeof this._mesh.destroy === 'function'
    ) {
        this._mesh.destroy();
    }

    if (
        this._ownsMaterial &&
        this._material &&
        typeof this._material.destroy === 'function'
    ) {
        this._material.destroy();
    }

    if (this._meshEntity && typeof this._meshEntity.destroy === 'function') {
        this._meshEntity.destroy();
    }

    this._meshEntity = null;
    this._mesh = null;
    this._meshInstance = null;
    this._material = null;
    this._ownsMaterial = false;
};

DirtPath.prototype._configureMaterial = function (material) {
    if (!material) return material;

    material.name = (material.name || 'Dirt Material') + ' (Dirt Path)';

    if ('opacityVertexColor' in material) {
        material.opacityVertexColor = true;
        material.opacityVertexColorChannel = 'a';
    }

    if (
        'opacityDither' in material &&
        pc.DITHER_BAYER8 !== undefined &&
        pc.BLEND_NONE !== undefined
    ) {
        material.opacityDither = pc.DITHER_BAYER8;
        material.blendType = pc.BLEND_NONE;
        material.depthWrite = true;
        material.alphaTest = 0;
    } else {
        if ('blendType' in material && pc.BLEND_NORMAL !== undefined) {
            material.blendType = pc.BLEND_NORMAL;
        }
        if ('depthWrite' in material) material.depthWrite = false;
        if ('alphaTest' in material) material.alphaTest = 0.001;
        if ('alphaToCoverage' in material) {
            material.alphaToCoverage = true;
        }
    }

    if (typeof material.update === 'function') material.update();
    return material;
};

DirtPath.prototype._createFallbackMaterial = function () {
    var material = new pc.StandardMaterial();
    var color = this.fallbackColor;

    if (material.diffuse && color) {
        material.diffuse.set(color.r, color.g, color.b);
    }
    material.useMetalness = true;
    material.metalness = 0;
    material.gloss = 0.18;

    this._ownsMaterial = true;
    return this._configureMaterial(material);
};

DirtPath.prototype._resolveMaterial = function () {
    var asset = this.materialAsset;

    if (!asset) return this._createFallbackMaterial();

    if (asset.resource) {
        if (typeof asset.resource.clone === 'function') {
            this._ownsMaterial = true;
            return this._configureMaterial(asset.resource.clone());
        }

        this._ownsMaterial = false;
        return asset.resource;
    }

    if (
        this._materialWaitingFor !== asset &&
        typeof asset.ready === 'function'
    ) {
        this._materialWaitingFor = asset;
        var self = this;
        asset.ready(function () {
            if (self._destroyed || self.materialAsset !== asset) return;
            self._materialWaitingFor = null;
            self.rebuild();
        });
    }

    if (this.app && this.app.assets && typeof this.app.assets.load === 'function') {
        this.app.assets.load(asset);
    }

    return this._createFallbackMaterial();
};

DirtPath.prototype.rebuild = function () {
    this._clearGenerated();

    if (
        this._destroyed ||
        !this.enabled ||
        !this.entity ||
        !this.app ||
        !this.app.graphicsDevice
    ) {
        return;
    }

    var geometry = dirtPathBuildGeometry(this.pathData, {
        uvMeters: this.uvMeters,
        surfaceOffset: this.surfaceOffset,
        softEdges: this.softEdges
    });

    if (!geometry.positions.length || !geometry.indices.length) return;

    var mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(geometry.positions);
    mesh.setNormals(geometry.normals);
    mesh.setUvs(0, geometry.uvs);
    if (
        typeof pc.calculateTangents === 'function' &&
        typeof mesh.setVertexStream === 'function' &&
        pc.SEMANTIC_TANGENT !== undefined
    ) {
        mesh.setVertexStream(
            pc.SEMANTIC_TANGENT,
            pc.calculateTangents(
                geometry.positions,
                geometry.normals,
                geometry.uvs,
                geometry.indices
            ),
            4
        );
    }

    if (typeof mesh.setColors32 === 'function') {
        mesh.setColors32(geometry.colors);
    } else if (typeof mesh.setColors === 'function') {
        var floatColors = new Array(geometry.colors.length);
        for (var colorIndex = 0; colorIndex < geometry.colors.length; colorIndex++) {
            floatColors[colorIndex] = geometry.colors[colorIndex] / 255;
        }
        mesh.setColors(floatColors);
    }

    mesh.setIndices(geometry.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);

    var generated = new pc.Entity('__DirtPathGenerated');
    generated.addComponent('render');
    this.entity.addChild(generated);

    var material = this._resolveMaterial();
    var meshInstance = new pc.MeshInstance(mesh, material, generated);
    meshInstance.castShadow = !!this.castShadows;
    meshInstance.receiveShadow = this.receiveShadows !== false;
    meshInstance.pick = false;

    generated.render.castShadows = !!this.castShadows;
    generated.render.receiveShadows = this.receiveShadows !== false;
    generated.render.meshInstances = [meshInstance];

    this._meshEntity = generated;
    this._mesh = mesh;
    this._meshInstance = meshInstance;
    this._material = material;
};

DirtPath.parsePathData = dirtPathParseData;
DirtPath.serializePathData = dirtPathSerializeData;
DirtPath.buildGeometry = dirtPathBuildGeometry;
DirtPath.constants = {
    version: DIRT_PATH_VERSION,
    lanes: DIRT_PATH_LANES,
    rowStride: DIRT_PATH_ROW_STRIDE
};
