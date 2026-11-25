var ScrollingTexture = pc.createScript('scrollingTexture');

ScrollingTexture.attributes.add('materialAsset', {
    type: 'asset'
});

ScrollingTexture.attributes.add('speed', {
    type: 'vec2'
});

ScrollingTexture.attributes.add('isTutorialLine', {
    type: 'boolean', default: false
});

// initialize code called once per entity
ScrollingTexture.prototype.initialize = function () {
    // get the material that we will animate
    if (this.materialAsset) {
        this.material = this.materialAsset.resource;
    }
    this.tickCount = 0;
    this.tmpVec2 = new pc.Vec2();
    this.tmpOffset = new pc.Vec2();
};

// update code called every frame
ScrollingTexture.prototype.update = function (dt) {

    if (this.isTutorialLine) {
        var gameManager = this.app.gameManager;
        var localPlayer = gameManager && typeof gameManager.getLocalPlayerEntity === 'function'
            ? gameManager.getLocalPlayerEntity()
            : this.app.localPlayer;
        var localSessionId = this.app.localSessionId || (this.app.room && this.app.room.sessionId);
        if (localPlayer && localPlayer.destroyed) localPlayer = null;
        if (localPlayer && localPlayer.isRemotePlayer === true) localPlayer = null;
        if (localPlayer && localSessionId && localPlayer.sessionId && localPlayer.sessionId !== localSessionId) {
            localPlayer = this.app.players && this.app.players[localSessionId] && !this.app.players[localSessionId].destroyed
                ? this.app.players[localSessionId]
                : null;
        }

        var tutLine = this.app.tutorialLineEntity ||
            (gameManager && gameManager.tutLine) ||
            this.entity;

        if (localPlayer && tutLine) {
            if (tutLine.enabled) {
                var localPlayerPosition = localPlayer.getPosition();
                var lineY = this.getLineWorldY(tutLine, localPlayerPosition.y + 0.5);
                tutLine.setPosition(localPlayerPosition.x, lineY, localPlayerPosition.z);
                var destination = this.app.tutorialChestTarget ||
                    (gameManager && gameManager.starterQuestDestinations &&
                        gameManager.starterQuestDestinations[gameManager.currentStarterQuestId - 1]);
                this.setDirection(destination, tutLine);

                var arrow = gameManager && gameManager.arrow;
                if (arrow) {
                    if (destination) {
                        arrow.setPosition(destination.getPosition().x, destination.getPosition().y + 7, destination.getPosition().z);
                    }
                }
            }
        }

    } else {

        if (!this.tmpVec2 && !this.tmpOffset) return;
        this.tickCount++;

        if (this.tickCount % 2 === 0) {

            var velocity = this.tmpVec2;
            var offset = this.tmpOffset;

            // Calculate how much to offset the texture
            // Speed * dt
            velocity.set(this.speed.x, this.speed.y);
            velocity.scale(dt);

            if (this.material) {
                // Update the diffuse and normal map offset values
                offset.copy(this.material.diffuseMapOffset);
                offset.add(velocity);
                this.material.diffuseMapOffset = offset;
                this.material.emissiveMapOffset = offset;
                this.material.normalMapOffset = offset;
                this.material.opacityMapOffset = offset;
                this.material.update();
            }

        }
    }







};


ScrollingTexture.prototype.setDirection = function (destination, line) {
    if (destination) {
        var gameManager = this.app.gameManager;
        var tutLine = line || this.app.tutorialLineEntity || (gameManager && gameManager.tutLine);
        if (!tutLine) return;

        var target = destination.getPosition().clone();
        target.y = this.getLineWorldY(tutLine, tutLine.getPosition().y);

        // Set angle and length without overwriting the prefab's non-X base scale.
        tutLine.lookAt(target);
        tutLine.rotateLocal(0, 90, 0);
        this.setLineLength(tutLine, tutLine.getPosition().distance(target));


        // this.material.emissiveMapTiling.set(15 * (distance / 38), 1);
        // this.material.opacityMapTiling.set(15 * (distance / 38), 1);
        //  this.material.update();
    }



};

ScrollingTexture.prototype.getLineScaleEntity = function (line) {
    if (!line) return null;
    if (line._tutorialLineScaleEntity && !line._tutorialLineScaleEntity.destroyed) {
        return line._tutorialLineScaleEntity;
    }

    line._tutorialLineScaleEntity = line.findByName('LineParent') ||
        (line.children && line.children[0]) ||
        line;
    return line._tutorialLineScaleEntity;
};

ScrollingTexture.prototype.getLineBaseScale = function (line) {
    var scaleEntity = this.getLineScaleEntity(line);
    if (!scaleEntity) return new pc.Vec3(1, 1, 1);

    if (!line._tutorialLineBaseScale) {
        line._tutorialLineBaseScale = scaleEntity.getLocalScale().clone();
    }

    return line._tutorialLineBaseScale;
};

ScrollingTexture.prototype.getLineWorldY = function (line, fallback) {
    if (!line) return fallback;

    if (typeof line._tutorialLineWorldY !== 'number') {
        line._tutorialLineWorldY = line.getPosition().y;
    }

    return line._tutorialLineWorldY;
};

ScrollingTexture.prototype.setLineLength = function (line, distance) {
    var scaleEntity = this.getLineScaleEntity(line);
    if (!scaleEntity) return;

    var baseScale = this.getLineBaseScale(line);
    var lengthPerScaleX = Math.max(0.0001, Math.abs(baseScale.x || 1));
    var multiplier = 6;
    var scaleX = Math.max(0.1, (Math.max(0.05, distance) / lengthPerScaleX) * multiplier);
    scaleEntity.setLocalScale(scaleX, baseScale.y, baseScale.z);
};
