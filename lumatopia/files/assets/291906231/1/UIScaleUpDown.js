var UiscaleUpdown = pc.createScript('uiscaleUpdown');
UiscaleUpdown.attributes.add('amount', { type: 'number' });

// initialize code called once per entity
UiscaleUpdown.prototype.initialize = function () {

    this.initialWidth = this.entity.element.width;
    this.initialHeight = this.entity.element.height;

    this.entity.tween(this.entity.element).to({ width: this.initialWidth + this.amount, height: this.initialHeight + this.amount }, 0.5, pcTween.SineInOut).yoyo(true).repeat(Infinity).start();

};
