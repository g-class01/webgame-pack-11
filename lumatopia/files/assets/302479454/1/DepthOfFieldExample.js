// Lightweight depth of field for the legacy camera post-effect stack.
// Attach the `depthOfField` script to the gameplay Camera entity.

class LumatopiaDepthOfFieldEffect extends pc.PostEffect {
    constructor(graphicsDevice, cameraComponent) {
        super(graphicsDevice);

        this.needsDepthBuffer = true;
        this.cameraComponent = cameraComponent;
        this.cameraParams = new Float32Array(4);
        this.texelSize = new Float32Array(2);
        this._filteredColorBuffer = null;

        // Use PlayCanvas' depth helper so perspective, orthographic and packed
        // scene-depth textures are decoded correctly by the current engine.
        var screenDepthPS = pc.ShaderChunks
            .get(graphicsDevice, pc.SHADERLANGUAGE_GLSL)
            .get('screenDepthPS');

        var fragmentShader = screenDepthPS + [
            '',
            'varying vec2 vUv0;',
            '',
            'uniform sampler2D uColorBuffer;',
            'uniform vec2 uTexelSize;',
            'uniform float uFocusDistance;',
            'uniform float uFocusRange;',
            'uniform float uMaxBlurPixels;',
            'uniform float uNearBlur;',
            '',
            'void main(void) {',
            '    vec4 base = texture2D(uColorBuffer, vUv0);',
            '    float depth = getLinearScreenDepth(vUv0);',
            '    float focusRange = max(uFocusRange, 0.0001);',
            '    float halfRange = focusRange * 0.5;',
            '',
            '    float farStart = uFocusDistance + halfRange;',
            '    float farCoC = smoothstep(0.0, focusRange, depth - farStart);',
            '',
            '    float nearStart = max(0.0, uFocusDistance - halfRange);',
            '    float nearCoC = smoothstep(0.0, focusRange, nearStart - depth) * uNearBlur;',
            '    float coc = max(nearCoC, farCoC);',
            '',
            '    if (coc < 0.001 || uMaxBlurPixels < 0.001) {',
            '        gl_FragColor = base;',
            '        return;',
            '    }',
            '',
            '    vec2 radius = uTexelSize * (uMaxBlurPixels * coc);',
            '',
            '    // Eight fixed taps plus a double-weighted center sample. The',
            '    // two rings hide directional artifacts without a costly loop.',
            '    vec4 blurred = base * 2.0;',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2( 0.45,  0.0));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2(-0.45,  0.0));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2( 0.0,   0.45));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2( 0.0,  -0.45));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2( 0.7071,  0.7071));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2(-0.7071,  0.7071));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2( 0.7071, -0.7071));',
            '    blurred += texture2D(uColorBuffer, vUv0 + radius * vec2(-0.7071, -0.7071));',
            '',
            '    gl_FragColor = vec4(blurred.rgb * 0.1, base.a);',
            '}'
        ].join('\n');

        this.shader = pc.ShaderUtils.createShader(graphicsDevice, {
            uniqueName: 'LumatopiaLightweightDepthOfFieldShader',
            attributes: {
                aPosition: pc.SEMANTIC_POSITION
            },
            vertexGLSL: pc.PostEffect.quadVertexShader,
            fragmentGLSL: fragmentShader
        });

        this.focusDistance = 50;
        this.focusRange = 20;
        this.maxBlurPixels = 4;
        this.nearBlur = 0;
    }

    render(inputTarget, outputTarget, rect) {
        var colorBuffer = inputTarget.colorBuffer;
        var width = Math.max(1, colorBuffer.width || inputTarget.width || this.device.width || 1);
        var height = Math.max(1, colorBuffer.height || inputTarget.height || this.device.height || 1);
        var scope = this.device.scope;

        // Fractional pixel offsets need linear filtering. Render targets default
        // to nearest filtering, and can be recreated when the canvas resizes.
        if (colorBuffer !== this._filteredColorBuffer) {
            colorBuffer.minFilter = pc.FILTER_LINEAR;
            colorBuffer.magFilter = pc.FILTER_LINEAR;
            colorBuffer.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
            colorBuffer.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
            this._filteredColorBuffer = colorBuffer;
        }

        this.texelSize[0] = 1 / width;
        this.texelSize[1] = 1 / height;

        // The renderer normally leaves this uniform set for the active camera;
        // setting it explicitly also keeps multiple-camera projects correct.
        this.cameraComponent.camera.fillShaderParams(this.cameraParams);

        scope.resolve('camera_params').setValue(this.cameraParams);
        scope.resolve('uColorBuffer').setValue(colorBuffer);
        scope.resolve('uTexelSize').setValue(this.texelSize);
        scope.resolve('uFocusDistance').setValue(this.focusDistance);
        scope.resolve('uFocusRange').setValue(this.focusRange);
        scope.resolve('uMaxBlurPixels').setValue(this.maxBlurPixels);
        scope.resolve('uNearBlur').setValue(this.nearBlur);

        this.drawQuad(outputTarget, this.shader, rect);
    }
}

var DepthOfField = pc.createScript('depthOfField');

DepthOfField.attributes.add('focusDistance', {
    type: 'number',
    default: 50,
    min: 0,
    title: 'Focus Distance',
    description: 'Distance from the camera, in world units, that stays sharp.'
});

DepthOfField.attributes.add('focusRange', {
    type: 'number',
    default: 20,
    min: 0.01,
    title: 'Focus Range',
    description: 'Width of the sharp band and the transition into full blur.'
});

DepthOfField.attributes.add('maxBlurPixels', {
    type: 'number',
    default: 4,
    min: 0,
    max: 12,
    title: 'Max Blur (px)',
    description: 'Maximum sampling radius in screen pixels.'
});

DepthOfField.attributes.add('nearBlur', {
    type: 'boolean',
    default: false,
    title: 'Near Blur',
    description: 'Also blur objects closer than the focused band.'
});

DepthOfField.prototype.initialize = function () {
    this.effect = null;
    this._queue = null;
    this._effectQueued = false;

    if (!this.entity.camera) {
        console.error('[depthOfField] Attach this script to an entity with a Camera component.');
        return;
    }

    this.effect = new LumatopiaDepthOfFieldEffect(this.app.graphicsDevice, this.entity.camera);
    this._queue = this.entity.camera.postEffects;
    this.copyAttributesToEffect();
    this.setEffectQueued(true);

    this.on('attr', this.onAttributeChanged, this);
    this.on('state', this.onStateChanged, this);
    this.on('destroy', this.onDestroy, this);
};

DepthOfField.prototype.copyAttributesToEffect = function () {
    if (!this.effect) return;

    var camera = this.entity.camera;
    var nearClip = camera ? Math.max(0, Number(camera.nearClip) || 0) : 0;
    this.effect.focusDistance = Math.max(nearClip, Number(this.focusDistance) || 0);
    this.effect.focusRange = Math.max(0.01, Number(this.focusRange) || 0.01);
    this.effect.maxBlurPixels = Math.max(0, Number(this.maxBlurPixels) || 0);
    this.effect.nearBlur = this.nearBlur ? 1 : 0;
};

DepthOfField.prototype.onAttributeChanged = function () {
    this.copyAttributesToEffect();
};

DepthOfField.prototype.setEffectQueued = function (queued) {
    queued = !!queued;
    if (!this.effect || !this._queue || queued === this._effectQueued) return;

    if (queued) this._queue.addEffect(this.effect);
    else this._queue.removeEffect(this.effect);
    this._effectQueued = queued;
};

DepthOfField.prototype.onStateChanged = function (enabled) {
    this.setEffectQueued(enabled);
};

DepthOfField.prototype.onDestroy = function () {
    this.setEffectQueued(false);
    this.effect = null;
    this._queue = null;
};
