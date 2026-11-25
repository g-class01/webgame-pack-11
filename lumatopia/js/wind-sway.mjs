import { S as Script, a as StandardMaterial, b as SHADERLANGUAGE_GLSL } from './index.mjs';

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const TRANSFORM=`
#ifdef PIXELSNAP
uniform vec4 screen_size;
#endif
#ifdef SCREENSPACE
uniform float projectionFlipY;
#endif
uniform float uWindTime;
uniform vec4 uWind;                     // direction x, direction z, sway at the top (fraction of the height), flutter (m)
uniform vec4 uWindPlant;                // per plant: ground height (world y), 1 / height, phase, speed
vec4 evalWorldPosition(vec3 vertexPosition, mat4 modelMatrix) {
    vec3 localPos = getLocalPosition(vertexPosition);
    #ifdef NINESLICED
        localPos.xz *= outerScale;
        vec2 positiveUnitOffset = clamp(vertexPosition.xz, vec2(0.0), vec2(1.0));
        vec2 negativeUnitOffset = clamp(-vertexPosition.xz, vec2(0.0), vec2(1.0));
        localPos.xz += (-positiveUnitOffset * innerOffset.xy + negativeUnitOffset * innerOffset.zw) * vertex_texCoord0.xy;
        vTiledUv = (localPos.xz - outerScale + innerOffset.xy) * -0.5 + 1.0;
        localPos.xz *= -0.5;
        localPos = localPos.xzy;
    #endif
    vec4 posW = modelMatrix * vec4(localPos, 1.0);
    #ifdef SCREENSPACE
        posW.zw = vec2(0.0, 1.0);
    #endif

    // wind: how high up the plant this vertex is (0 at the ground, 1 at the top), squared for a natural bend
    float k = clamp((posW.y - uWindPlant.x) * uWindPlant.y, 0.0, 1.2);
    k *= k;
    float t = uWindTime * uWindPlant.w + uWindPlant.z;
    float sway = 0.35 + sin(t) * 0.65 + sin(t * 2.3 + 1.7) * 0.25;
    vec2 dir = uWind.xy, side = vec2(-dir.y, dir.x);
    posW.xz += (dir * sway + side * sin(t * 1.27 + 0.6) * 0.3) * (uWind.z / uWindPlant.y) * k;
    float flutter = sin(uWindTime * 7.0 + dot(posW.xyz, vec3(2.3, 1.7, 3.1)));
    posW.xyz += vec3(0.7, 1.0, 0.7) * flutter * uWind.w * k;
    return posW;
}
vec4 getPosition() {
    dModelMatrix = getModelMatrix();
    vec4 posW = evalWorldPosition(vertex_position.xyz, dModelMatrix);
    dPositionW = posW.xyz;
    vec4 screenPos;
    #ifdef UV1LAYOUT
        screenPos = vec4(vertex_texCoord1.xy * 2.0 - 1.0, 0.5, 1);
        #ifdef WEBGPU
            screenPos.y *= -1.0;
        #endif
    #else
        #ifdef SCREENSPACE
            screenPos = posW;
            screenPos.y *= projectionFlipY;
        #else
            screenPos = matrix_viewProjection * posW;
        #endif
        #ifdef PIXELSNAP
            screenPos.xy = (screenPos.xy * 0.5) + 0.5;
            screenPos.xy *= screen_size.xy;
            screenPos.xy = floor(screenPos.xy);
            screenPos.xy *= screen_size.zw;
            screenPos.xy = (screenPos.xy * 2.0) - 1.0;
        #endif
    #endif
    return screenPos;
}
vec3 getWorldPosition() {
    return dPositionW;
}
`;const names=s=>s.split(",").map(n=>n.trim()).filter(Boolean);class WindSway extends Script{initialize(){this.time=0;this.copies=new Map;this.swapped=[];this.done=new Map;this.wind=new Float32Array(4);this.dirty=false;this._onLoad=()=>{this.dirty=true;};this.app.assets.on("load",this._onLoad);this._setup();this.on("destroy",()=>{this.app.assets.off("load",this._onLoad);for(const[mi,mat]of this.swapped)mi.material=mat;for(const m of this.copies.values())m.destroy();});}_setup(){this.dirty=false;const wanted=new Set(names(this.targets));const own=new Set(this.copies.values());for(const e of this.app.root.find(e=>wanted.has(e.name)&&!!e.render)){const mis=e.render.meshInstances;if(!mis.length||this.done.get(e)===mis)continue;this.done.set(e,mis);const box=mis[0].aabb.clone();for(let i=1;i<mis.length;i++)box.add(mis[i].aabb);const lo=box.getMin(),hi=box.getMax();const plant=new Float32Array([lo.y,1/Math.max(.1,hi.y-lo.y),(box.center.x*1.7+box.center.z*2.3)%6.283,.85+((box.center.x*7.1+box.center.z*3.7)%1+1)%1*.3]);for(const mi of mis){if(!own.has(mi.material)){this.swapped.push([mi,mi.material]);mi.material=this._swaying(mi.material);}mi.setParameter("uWindPlant",plant);}}for(const[orig,m]of this.copies){if(orig instanceof StandardMaterial&&StandardMaterial.TEXTURE_PARAMETERS.some(p=>m[p]!==orig[p])){m.copy(orig);this._prepare(m,orig);}}this._uniforms(0);}_swaying(mat){let m=this.copies.get(mat);if(!m){m=mat.clone();this._prepare(m,mat);this.copies.set(mat,m);}return m}_prepare(m,orig){m.name=`${orig.name} + wind`;m.getShaderChunks(SHADERLANGUAGE_GLSL).set("transformVS",TRANSFORM);m.shaderChunksVersion="2.8";m.update();}_uniforms(dt){this.time=(this.time+dt*this.speed)%3600;const a=this.direction*Math.PI/180,w=this.wind;w[0]=Math.sin(a);w[1]=Math.cos(a);w[2]=this.sway;w[3]=this.flutter;for(const m of this.copies.values()){m.setParameter("uWindTime",this.time);m.setParameter("uWind",w);}}update(dt){if(this.dirty)this._setup();this._uniforms(dt);}constructor(...args){super(...args),_define_property(this,"targets","palm0, palm1, Plant"),_define_property(this,"sway",.04),_define_property(this,"flutter",.02),_define_property(this,"speed",1.3),_define_property(this,"direction",200);}}_define_property(WindSway,"scriptName","windSway");

export { WindSway };
