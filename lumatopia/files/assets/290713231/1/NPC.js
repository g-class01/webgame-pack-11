var NPC = pc.createScript('nPC');
NPC.attributes.add('npcType', { type: 'string' });
NPC.attributes.add('npcEntity', { type: 'entity' });

// initialize code called once per entity
NPC.prototype.initialize = function () {

    this.entity.collision.on('triggerenter', this.onTriggerEnter, this);
};

NPC.prototype.onTriggerEnter = function (entity) {
    if (entity !== this.app.localPlayer) return;

    switch (this.npcType) {
        case "Robot":
            this.npcEntity.sound.play('Hello');
            console.log('play')
            break;
    }
};