var CloudRim = pc.createScript('cloudRim');

CloudRim.attributes.add('material', {
    type: 'asset',
    assetType: 'material',
    title: 'Material',
    description: 'The cloud material that gets the rim glow (CloudDunes).'
});
CloudRim.attributes.add('color', {
    type: 'rgb',
    default: [1.0, 0.79, 0.99],
    title: 'Rim Colour'
});
CloudRim.attributes.add('power', {
    type: 'number',
    default: 2.8,
    min: 0.5,
    max: 8,
    title: 'Rim Tightness',
    description: 'Higher = only the very edges glow.'
});
CloudRim.attributes.add('strength', {
    type: 'number',
    default: 1.0,
    min: 0,
    max: 3,
    title: 'Rim Strength'
});
CloudRim.attributes.add('flat', {
    type: 'number',
    default: 0.1,
    min: 0,
    max: 1,
    title: 'On Flat Ground',
    description: 'How much of the glow flat, up-facing cloud keeps (0 = only the sides of the puffs and towers glow).'
});

// A shiny rim on the clouds (the user, 2026-11-04): the cloud material's own
// emission (its stardust glitter) gets a fresnel glow added, brightest where the
// surface turns away from the camera, so the edges of the puffs and the cloud
// towers shine against the sky. Flat cloud facing up keeps only a little of it,
// or the ground in front of the camera (always seen at a low angle) would glow
// white. It replaces the standard material's emissivePS chunk (GLSL: the
// project is WebGL2 only) with the engine's own (2.23) plus the rim; the
// lighting, the vertex colours and the glitter are untouched. One pow per pixel.
CloudRim.GLSL = [
    '#ifndef MESH_COLOR',
    '    uniform vec3 material_emissive;',
    '#endif',
    'uniform float material_emissiveIntensity;',
    'uniform vec3 cloud_rimColor;',
    'uniform vec3 cloud_rimParams;',
    'void getEmission() {',
    '    #ifdef MESH_COLOR',
    '        dEmission = mesh_color.rgb * material_emissiveIntensity;',
    '    #else',
    '        dEmission = material_emissive * material_emissiveIntensity;',
    '    #endif',
    '    #ifdef STD_EMISSIVE_TEXTURE',
    '    dEmission *= {STD_EMISSIVE_TEXTURE_DECODE}(texture2DBias({STD_EMISSIVE_TEXTURE_NAME}, {STD_EMISSIVE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_EMISSIVE_TEXTURE_CHANNEL};',
    '    #endif',
    '    #ifdef STD_EMISSIVE_VERTEX',
    '    dEmission *= saturate(vVertexColor.{STD_EMISSIVE_VERTEX_CHANNEL});',
    '    #endif',
    '    #ifdef FORWARD_PASS',
    '    vec3 cloudN = normalize(dNormalW);',
    '    float cloudRim = pow(1.0 - saturate(dot(cloudN, dViewDirW)), cloud_rimParams.x);',
    '    float cloudSide = mix(cloud_rimParams.z, 1.0, 1.0 - saturate(cloudN.y));',
    '    dEmission += cloud_rimColor * (cloudRim * cloudSide * cloud_rimParams.y);',
    '    #endif',
    '}',
    ''
].join('\n');

CloudRim.prototype.initialize = function () {
    this._patched = null;
    this.apply();
    this.on('attr', this.setParams, this);
    if (this.material && !this.material.loaded) this.material.ready(this.apply, this);
};

CloudRim.prototype.apply = function () {
    var material = this.material && this.material.resource;
    if (!material || typeof material.getShaderChunks !== 'function') return;
    if (this._patched !== material) {
        material.getShaderChunks(pc.SHADERLANGUAGE_GLSL).set('emissivePS', CloudRim.GLSL);
        material.shaderChunksVersion = pc.version.split('.').slice(0, 2).join('.');
        this._patched = material;
        material.update();
    }
    this.setParams();
};

CloudRim.prototype.setParams = function () {
    var material = this._patched;
    if (!material) return;
    var c = this.color;
    material.setParameter('cloud_rimColor', [c.r, c.g, c.b]);
    material.setParameter('cloud_rimParams', [this.power, this.strength, this.flat]);
};
