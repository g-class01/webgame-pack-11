var FlyCamera = pc.createScript('flyCamera');

FlyCamera.attributes.add('speed', { type : 'number', default : 0.3 });
FlyCamera.attributes.add('sensitivity', { type : 'number', default : 0.03 });

FlyCamera.prototype.initialize = function() {
    this.isMouseLocked = false;
    
    this.angleX = 0;
    this.angleY = 0;
    
    this.app.mouse.on('mousedown', this.onMouseDown, this);
    this.app.mouse.on('mousemove', this.onMouseMove, this);
    this.app.mouse.on('mouseup', this.onMouseUp, this);
    
    document.addEventListener('pointerlockchange', this.lockStateChange.bind(this), false);
};

FlyCamera.prototype.lockStateChange = function(event) {
    if(this.isMouseLocked){
        this.isMouseLocked = false;
    }
};

FlyCamera.prototype.onMouseDown = function(event) {
    var self = this;
    
    if(this.isMouseLocked){
        //do nothing
    }else{
        this.app.mouse.enablePointerLock(function(){
            self.isMouseLocked = true;
        });
    }
};

FlyCamera.prototype.onMouseMove = function(event) {
    this.angleX-=event.dx * this.sensitivity;
    this.angleY-=event.dy * this.sensitivity;
};

FlyCamera.prototype.onMouseUp = function(event) {
    
};

FlyCamera.prototype.setDirection = function() {
    if(!this.isMouseLocked){
        return false;
    }
    
    this.entity.setEulerAngles(this.angleY, this.angleX, 0);
};

FlyCamera.prototype.setKeyboard = function() {
    if(!this.isMouseLocked){
        return false;
    }
    
    if(this.app.keyboard.isPressed(pc.KEY_W)){
        this.entity.translateLocal(0, 0, -this.speed);
    }
    
    if(this.app.keyboard.isPressed(pc.KEY_S)){
        this.entity.translateLocal(0, 0, this.speed);
    }
    
    if(this.app.keyboard.isPressed(pc.KEY_A)){
        this.entity.translateLocal(-this.speed, 0, 0);
    }
    
    if(this.app.keyboard.isPressed(pc.KEY_D)){
        this.entity.translateLocal(this.speed, 0, 0);
    }
};

FlyCamera.prototype.update = function(dt) {
    this.setKeyboard();
    this.setDirection();
};