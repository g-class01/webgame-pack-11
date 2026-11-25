var IslandButton = pc.createScript('islandButton');

// The beach's Island button (HUD, top left): straight back to Lumatopia (DanceTravel.js), landing in front of the
// beach gate. The key does the same. It only goes while the player walks about the beach (the game flow's hub: not in
// a show, the fashion show or a queue) and no menu is up.
//
// IslandButton.point(app, on) shows the button's tutorial hand. Anything on the beach that needs Lumatopia's world
// (a quest that tracks something there, the bird camera) points the player at it this way; going clears it.
IslandButton.attributes.add('key', {
    type: 'string',
    default: 't',
    title: 'Key',
    description: 'The keyboard key that also takes the player back (one letter).'
});

IslandButton.prototype.initialize = function () {
    this.flow = null;
    this.hand = this.entity.findByName('Hand');
    this._keyHeld = false;
    this.entity.button.on('click', this.go, this);
    this.app.keyboard.on(pc.EVENT_KEYDOWN, this.onKeyDown, this);
    this.app.keyboard.on(pc.EVENT_KEYUP, this.onKeyUp, this);
    this.app.islandButton = this;
    this.on('destroy', function () {
        this.app.keyboard.off(pc.EVENT_KEYDOWN, this.onKeyDown, this);
        this.app.keyboard.off(pc.EVENT_KEYUP, this.onKeyUp, this);
        if (this.app.islandButton === this) this.app.islandButton = null;
    }, this);
};

IslandButton.prototype.postInitialize = function () {
    var game = this.app.root.find(function (e) { return !!(e.script && e.script.gameFlow); })[0];
    this.flow = game ? game.script.gameFlow : null;
};

IslandButton.prototype.keyCode = function () {
    var code = pc['KEY_' + String(this.key || '').trim().toUpperCase()];
    return typeof code === 'number' ? code : null;
};

IslandButton.prototype.onKeyDown = function (event) {
    if (event.key !== this.keyCode() || this._keyHeld) return;
    this._keyHeld = true;
    this.go();
};

IslandButton.prototype.onKeyUp = function (event) {
    if (event.key === this.keyCode()) this._keyHeld = false;
};

IslandButton.prototype.canGo = function () {
    if (typeof DanceTravel === 'undefined' || DanceTravel.busy) return false;
    if (this.flow && this.flow.state !== 'hub') return false;
    if (this.app.chatInput && this.app.chatInput.isFocused) return false;
    return !(typeof LumatopiaMenus !== 'undefined' && LumatopiaMenus.isOpen(this.app));
};

IslandButton.prototype.go = function () {
    if (!this.canGo()) return;
    this.showHand(false);
    DanceTravel.toLumatopia(this.app);
};

IslandButton.prototype.showHand = function (on) {
    if (this.hand) this.hand.enabled = !!on;
};

IslandButton.point = function (app, on) {
    if (app.islandButton) app.islandButton.showHand(on);
};
