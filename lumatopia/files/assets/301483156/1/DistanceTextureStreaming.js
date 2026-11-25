var DistanceTextureStreaming = pc.createScript('distanceTextureStreaming');

DistanceTextureStreaming.attributes.add('target', {
    type: 'entity',
    title: 'Distance Target',
    description: 'Entity to measure distance from. Falls back to the active camera.'
});

DistanceTextureStreaming.attributes.add('unloadTag', {
    type: 'string',
    default: 'unload',
    title: 'Unload Tag',
    description: 'Add this tag to a root entity. Textures used by that root and its descendants become streamable.'
});

DistanceTextureStreaming.attributes.add('unloadDistance', {
    type: 'number',
    default: 100,
    min: 1,
    title: 'Unload Distance'
});

DistanceTextureStreaming.attributes.add('hysteresis', {
    type: 'number',
    default: 15,
    min: 0,
    title: 'Hysteresis',
    description: 'How much closer the target must move before unloaded textures are loaded again.'
});

DistanceTextureStreaming.attributes.add('checkInterval', {
    type: 'number',
    default: 0.5,
    min: 0.05,
    title: 'Check Interval'
});

DistanceTextureStreaming.attributes.add('refreshInterval', {
    type: 'number',
    default: 5,
    min: 0.5,
    title: 'Refresh Interval',
    description: 'How often texture ownership is rescanned for new or changed entities.'
});

DistanceTextureStreaming.attributes.add('restoreOnDestroy', {
    type: 'boolean',
    default: true,
    title: 'Restore On Destroy',
    description: 'Reload textures unloaded by this script if the script is removed or destroyed.'
});

DistanceTextureStreaming.attributes.add('debugLogging', {
    type: 'boolean',
    default: false,
    title: 'Debug Logging'
});

var DISTANCE_TEXTURE_STREAMING_MAP_SLOTS = [
    'diffuseMap',
    'diffuseDetailMap',
    'normalMap',
    'normalDetailMap',
    'aoMap',
    'specularMap',
    'specularityFactorMap',
    'glossMap',
    'metalnessMap',
    'opacityMap',
    'emissiveMap',
    'heightMap',
    'lightMap',
    'sphereMap',
    'cubeMap',
    'envAtlas',
    'clearCoatMap',
    'clearCoatGlossMap',
    'clearCoatNormalMap',
    'sheenMap',
    'sheenGlossMap',
    'iridescenceMap',
    'iridescenceThicknessMap',
    'thicknessMap',
    'refractionMap'
];

DistanceTextureStreaming.prototype.initialize = function () {
    this._groups = [];
    this._groupByGuid = {};
    this._assetStates = {};
    this._textureAssetByResource = new Map();
    this._materialAssetByResource = new Map();
    this._checkTimer = 0;
    this._refreshTimer = 0;
    this._warnedAboutTarget = false;

    this.refreshTextureOwnership();
    this.streamNow();

    this.on('destroy', this.onDestroy, this);
};

DistanceTextureStreaming.prototype.update = function (dt) {
    dt = Math.max(0, Number(dt) || 0);

    this._refreshTimer -= dt;
    if (this._refreshTimer <= 0) {
        this.refreshTextureOwnership();
        this._refreshTimer = Math.max(0.5, Number(this.refreshInterval) || 5);
    }

    this._checkTimer -= dt;
    if (this._checkTimer <= 0) {
        this.streamNow();
        this._checkTimer = Math.max(0.05, Number(this.checkInterval) || 0.5);
    }
};

DistanceTextureStreaming.prototype.getTargetEntity = function () {
    if (this.target && !this.target.destroyed && !this.target._destroying) return this.target;

    var cameras = this.app.systems.camera && this.app.systems.camera.cameras;
    if (cameras && cameras.length > 0 && cameras[0].entity &&
        !cameras[0].entity.destroyed && !cameras[0].entity._destroying) {
        return cameras[0].entity;
    }

    var camera = this.app.root.findByName('Camera');
    return camera && !camera.destroyed && !camera._destroying ? camera : null;
};

DistanceTextureStreaming.prototype.getAllAssets = function () {
    if (!this.app || !this.app.assets) return [];
    if (typeof this.app.assets.list === 'function') return this.app.assets.list();
    if (typeof this.app.assets.filter === 'function') {
        return this.app.assets.filter(function () { return true; });
    }
    return [];
};

DistanceTextureStreaming.prototype.isTextureAsset = function (asset) {
    return !!asset && (asset.type === 'texture' || asset.type === 'textureatlas' || asset.type === 'cubemap');
};

DistanceTextureStreaming.prototype.indexTextureResource = function (resource, asset) {
    if (!resource || !asset) return;

    if (resource.texture) {
        this._textureAssetByResource.set(resource.texture, asset);
        return;
    }

    this._textureAssetByResource.set(resource, asset);
};

DistanceTextureStreaming.prototype.rebuildResourceIndexes = function () {
    this._textureAssetByResource = new Map();
    this._materialAssetByResource = new Map();

    var assets = this.getAllAssets();
    for (var i = 0; i < assets.length; i++) {
        var asset = assets[i];
        if (!asset) continue;

        if (asset.type === 'material' && asset.resource) {
            this._materialAssetByResource.set(asset.resource, asset);
        }

        if (!this.isTextureAsset(asset)) continue;
        this.indexTextureResource(asset.resource, asset);

        var resources = asset.resources || [];
        for (var j = 0; j < resources.length; j++) {
            this.indexTextureResource(resources[j], asset);
        }
    }
};

DistanceTextureStreaming.prototype.getAssetById = function (value) {
    if (value === null || value === undefined || value === '') return null;
    if (value && value.id !== undefined && value.type) return value;

    var numericId = Number(value);
    if (!Number.isFinite(numericId)) return null;
    return this.app.assets.get(numericId) || null;
};

DistanceTextureStreaming.prototype.addTextureAsset = function (assetSet, asset) {
    if (!assetSet || !this.isTextureAsset(asset)) return;
    assetSet[String(asset.id)] = asset;
};

DistanceTextureStreaming.prototype.addTextureResource = function (assetSet, texture) {
    if (!texture || !assetSet) return;
    var asset = this._textureAssetByResource.get(texture);
    if (asset) this.addTextureAsset(assetSet, asset);
};

DistanceTextureStreaming.prototype.collectMaterialTextures = function (material, assetSet) {
    if (!material || !assetSet) return;

    var materialAsset = this._materialAssetByResource.get(material);
    var data = materialAsset && materialAsset.data;

    for (var i = 0; i < DISTANCE_TEXTURE_STREAMING_MAP_SLOTS.length; i++) {
        var slot = DISTANCE_TEXTURE_STREAMING_MAP_SLOTS[i];
        this.addTextureResource(assetSet, material[slot]);

        if (!data) continue;
        var referencedAsset = this.getAssetById(data[slot]);
        if (referencedAsset) this.addTextureAsset(assetSet, referencedAsset);
    }
};

DistanceTextureStreaming.prototype.collectMeshInstanceTextures = function (meshInstances, assetSet) {
    meshInstances = meshInstances || [];
    for (var i = 0; i < meshInstances.length; i++) {
        var meshInstance = meshInstances[i];
        if (meshInstance && meshInstance.material) {
            this.collectMaterialTextures(meshInstance.material, assetSet);
        }
    }
};

DistanceTextureStreaming.prototype.collectSpriteTextures = function (sprite, assetSet) {
    if (!sprite || !assetSet) return;
    var atlas = sprite.atlas;
    if (atlas && atlas.texture) this.addTextureResource(assetSet, atlas.texture);
};

DistanceTextureStreaming.prototype.collectDirectEntityTextures = function (entity, assetSet) {
    if (!entity || !assetSet) return;

    if (entity.render) this.collectMeshInstanceTextures(entity.render.meshInstances, assetSet);
    if (entity.model) this.collectMeshInstanceTextures(entity.model.meshInstances, assetSet);

    if (entity.element) {
        this.addTextureAsset(assetSet, this.getAssetById(entity.element.textureAsset));
        this.addTextureResource(assetSet, entity.element.texture);
        this.collectSpriteTextures(entity.element.sprite, assetSet);

        var elementSpriteAsset = this.getAssetById(entity.element.spriteAsset);
        if (elementSpriteAsset && elementSpriteAsset.resource) {
            this.collectSpriteTextures(elementSpriteAsset.resource, assetSet);
        }
    }

    if (entity.sprite) {
        this.collectSpriteTextures(entity.sprite.sprite, assetSet);
        var spriteAsset = this.getAssetById(entity.sprite.spriteAsset);
        if (spriteAsset && spriteAsset.resource) {
            this.collectSpriteTextures(spriteAsset.resource, assetSet);
        }
    }

    if (entity.particlesystem) {
        this.addTextureAsset(assetSet, this.getAssetById(entity.particlesystem.colorMapAsset));
        this.addTextureAsset(assetSet, this.getAssetById(entity.particlesystem.normalMapAsset));
        this.addTextureResource(assetSet, entity.particlesystem.colorMap);
        this.addTextureResource(assetSet, entity.particlesystem.normalMap);
    }

    if (entity.light) {
        this.addTextureAsset(assetSet, this.getAssetById(entity.light.cookieAsset));
        this.addTextureResource(assetSet, entity.light.cookie);
    }
};

DistanceTextureStreaming.prototype.hasTaggedAncestor = function (entity) {
    var parent = entity && entity.parent;
    while (parent && parent !== this.app.root) {
        if (parent.tags && parent.tags.has(this.unloadTag)) return true;
        parent = parent.parent;
    }
    return false;
};

DistanceTextureStreaming.prototype.getEntityGuid = function (entity) {
    if (!entity) return '';
    return String(entity.guid || (entity.getGuid && entity.getGuid()) || '');
};

DistanceTextureStreaming.prototype.createGroupBounds = function (entity) {
    var center = entity.getPosition().clone();
    var halfExtents = new pc.Vec3();
    var hasBounds = false;

    var visit = function (node) {
        var meshInstances = [];
        if (node.render && node.render.meshInstances) meshInstances = meshInstances.concat(node.render.meshInstances);
        if (node.model && node.model.meshInstances) meshInstances = meshInstances.concat(node.model.meshInstances);

        for (var i = 0; i < meshInstances.length; i++) {
            var aabb = meshInstances[i] && meshInstances[i].aabb;
            if (!aabb) continue;

            if (!hasBounds) {
                center.copy(aabb.center);
                halfExtents.copy(aabb.halfExtents);
                hasBounds = true;
                continue;
            }

            var minX = Math.min(center.x - halfExtents.x, aabb.center.x - aabb.halfExtents.x);
            var minY = Math.min(center.y - halfExtents.y, aabb.center.y - aabb.halfExtents.y);
            var minZ = Math.min(center.z - halfExtents.z, aabb.center.z - aabb.halfExtents.z);
            var maxX = Math.max(center.x + halfExtents.x, aabb.center.x + aabb.halfExtents.x);
            var maxY = Math.max(center.y + halfExtents.y, aabb.center.y + aabb.halfExtents.y);
            var maxZ = Math.max(center.z + halfExtents.z, aabb.center.z + aabb.halfExtents.z);

            center.set((minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5);
            halfExtents.set((maxX - minX) * 0.5, (maxY - minY) * 0.5, (maxZ - minZ) * 0.5);
        }

        var children = node.children || [];
        for (var j = 0; j < children.length; j++) visit(children[j]);
    };

    visit(entity);
    return { center: center, halfExtents: halfExtents, hasBounds: hasBounds };
};

DistanceTextureStreaming.prototype.distanceToGroupSq = function (position, group) {
    var bounds = group.bounds;
    if (!bounds || !bounds.hasBounds) {
        var entityPosition = group.entity.getPosition();
        var ex = position.x - entityPosition.x;
        var ey = position.y - entityPosition.y;
        var ez = position.z - entityPosition.z;
        return ex * ex + ey * ey + ez * ez;
    }

    var dx = Math.max(Math.abs(position.x - bounds.center.x) - bounds.halfExtents.x, 0);
    var dy = Math.max(Math.abs(position.y - bounds.center.y) - bounds.halfExtents.y, 0);
    var dz = Math.max(Math.abs(position.z - bounds.center.z) - bounds.halfExtents.z, 0);
    return dx * dx + dy * dy + dz * dz;
};

DistanceTextureStreaming.prototype.protectSceneTextures = function (protectedAssets) {
    var scene = this.app && this.app.scene;
    if (!scene) return;

    this.addTextureResource(protectedAssets, scene.envAtlas);
    this.addTextureResource(protectedAssets, scene.skybox);

    var prefiltered = scene.prefilteredCubemaps || [];
    for (var i = 0; i < prefiltered.length; i++) {
        this.addTextureResource(protectedAssets, prefiltered[i]);
    }
};

DistanceTextureStreaming.prototype.refreshTextureOwnership = function () {
    this.rebuildResourceIndexes();

    var tagged = this.unloadTag ? this.app.root.findByTag(this.unloadTag) : [];
    var nextGroups = [];
    var nextByGuid = {};
    var groupByEntity = new Map();

    for (var i = 0; i < tagged.length; i++) {
        var entity = tagged[i];
        if (!entity || entity.destroyed || entity._destroying ||
            entity === this.entity || this.hasTaggedAncestor(entity)) continue;

        var guid = this.getEntityGuid(entity);
        if (!guid) continue;

        var group = this._groupByGuid[guid] || {
            guid: guid,
            entity: entity,
            wantsLoaded: null,
            assetIds: {}
        };

        group.entity = entity;
        group.assetIds = {};
        group.bounds = this.createGroupBounds(entity);
        nextGroups.push(group);
        nextByGuid[guid] = group;
        groupByEntity.set(entity, group);
    }

    var protectedAssets = {};
    this.protectSceneTextures(protectedAssets);

    var visit = function (node, activeGroup) {
        var explicitGroup = groupByEntity.get(node);
        if (explicitGroup) activeGroup = explicitGroup;

        var directAssets = {};
        this.collectDirectEntityTextures(node, directAssets);
        var ids = Object.keys(directAssets);
        for (var index = 0; index < ids.length; index++) {
            var id = ids[index];
            if (activeGroup) {
                activeGroup.assetIds[id] = directAssets[id];
            } else {
                protectedAssets[id] = directAssets[id];
            }
        }

        var children = node.children || [];
        for (var childIndex = 0; childIndex < children.length; childIndex++) {
            visit.call(this, children[childIndex], activeGroup);
        }
    };

    visit.call(this, this.app.root, null);

    var previousStates = this._assetStates;
    var nextStates = {};

    for (var groupIndex = 0; groupIndex < nextGroups.length; groupIndex++) {
        var currentGroup = nextGroups[groupIndex];
        var assetIds = Object.keys(currentGroup.assetIds);

        for (var assetIndex = 0; assetIndex < assetIds.length; assetIndex++) {
            var assetId = assetIds[assetIndex];
            var state = nextStates[assetId];
            if (!state) {
                state = previousStates[assetId] || {
                    asset: currentGroup.assetIds[assetId],
                    unloadedBySystem: false,
                    wanted: true
                };
                state.asset = currentGroup.assetIds[assetId];
                state.groupIds = {};
                nextStates[assetId] = state;
            }
            state.groupIds[currentGroup.guid] = true;
        }
    }

    var nextAssetIds = Object.keys(nextStates);
    for (var stateIndex = 0; stateIndex < nextAssetIds.length; stateIndex++) {
        var nextState = nextStates[nextAssetIds[stateIndex]];
        nextState.protected = !!protectedAssets[nextAssetIds[stateIndex]];
    }

    var previousAssetIds = Object.keys(previousStates);
    for (var previousIndex = 0; previousIndex < previousAssetIds.length; previousIndex++) {
        var previousId = previousAssetIds[previousIndex];
        var previousState = previousStates[previousId];
        if (!nextStates[previousId] && previousState && previousState.unloadedBySystem) {
            this.loadAsset(previousState, true);
        }
    }

    this._groups = nextGroups;
    this._groupByGuid = nextByGuid;
    this._assetStates = nextStates;
};

DistanceTextureStreaming.prototype.isAssetResident = function (asset) {
    if (!asset) return false;
    if (asset.resource) return true;

    var resources = asset.resources || [];
    for (var i = 0; i < resources.length; i++) {
        if (resources[i]) return true;
    }
    return false;
};

DistanceTextureStreaming.prototype.loadAsset = function (state, forceRestore) {
    if (!state || !state.asset) return;
    var asset = state.asset;

    if (this.isAssetResident(asset)) {
        state.unloadedBySystem = false;
        return;
    }

    if (!state.unloadedBySystem && !forceRestore) return;
    if (!asset.loading) this.app.assets.load(asset);

    if (this.debugLogging) {
        console.log('[distanceTextureStreaming] Loading texture:', asset.name, asset.id);
    }
};

DistanceTextureStreaming.prototype.unloadAsset = function (state) {
    if (!state || !state.asset || state.asset.loading || state.unloadedBySystem) return;
    var asset = state.asset;
    if (!this.isAssetResident(asset)) return;

    state.unloadedBySystem = true;
    asset.unload();

    if (this.debugLogging) {
        console.log('[distanceTextureStreaming] Unloaded texture:', asset.name, asset.id);
    }
};

DistanceTextureStreaming.prototype.reconcileAssets = function () {
    var ids = Object.keys(this._assetStates);

    for (var i = 0; i < ids.length; i++) {
        var state = this._assetStates[ids[i]];
        var wanted = !!state.protected;

        if (!wanted) {
            var groupIds = Object.keys(state.groupIds || {});
            for (var j = 0; j < groupIds.length; j++) {
                var group = this._groupByGuid[groupIds[j]];
                if (group && group.wantsLoaded) {
                    wanted = true;
                    break;
                }
            }
        }

        state.wanted = wanted;
        if (wanted) {
            this.loadAsset(state, false);
        } else {
            this.unloadAsset(state);
        }
    }
};

DistanceTextureStreaming.prototype.streamNow = function () {
    var target = this.getTargetEntity();
    if (!target) {
        if (!this._warnedAboutTarget) {
            console.warn('[distanceTextureStreaming] No target or active camera was found.');
            this._warnedAboutTarget = true;
        }
        return;
    }

    this._warnedAboutTarget = false;

    var targetPosition = target.getPosition();
    var unloadDistance = Math.max(1, Number(this.unloadDistance) || 1);
    var loadDistance = Math.max(0, unloadDistance - Math.max(0, Number(this.hysteresis) || 0));
    var unloadDistanceSq = unloadDistance * unloadDistance;
    var loadDistanceSq = loadDistance * loadDistance;

    for (var i = 0; i < this._groups.length; i++) {
        var group = this._groups[i];
        if (!group.entity || group.entity.destroyed || group.entity._destroying) continue;

        var distanceSq = this.distanceToGroupSq(targetPosition, group);
        if (group.wantsLoaded === null) {
            group.wantsLoaded = distanceSq <= unloadDistanceSq;
        } else if (group.wantsLoaded && distanceSq > unloadDistanceSq) {
            group.wantsLoaded = false;
        } else if (!group.wantsLoaded && distanceSq < loadDistanceSq) {
            group.wantsLoaded = true;
        }
    }

    this.reconcileAssets();
};

DistanceTextureStreaming.prototype.onDestroy = function () {
    if (this.restoreOnDestroy) {
        var ids = Object.keys(this._assetStates);
        for (var i = 0; i < ids.length; i++) {
            var state = this._assetStates[ids[i]];
            if (state && state.unloadedBySystem) this.loadAsset(state, true);
        }
    }

    this._groups.length = 0;
    this._groupByGuid = {};
    this._assetStates = {};
    this._textureAssetByResource.clear();
    this._materialAssetByResource.clear();
};
