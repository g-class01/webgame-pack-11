import { S as Script, l as Mat4, d as ShaderMaterial, G as SEMANTIC_NORMAL, f as SEMANTIC_POSITION, q as BLEND_NORMAL, V as Vec3, m as math, c as Color } from './index.mjs';

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const VS=`
attribute vec3 vertex_position;
attribute vec3 vertex_normal;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vLocal;
varying vec3 vNormalL;
varying vec3 vWorldPos;
varying vec3 vNormalW;

void main(void) {
    vec4 world = matrix_model * vec4(vertex_position, 1.0);
    vLocal = vertex_position;
    vNormalL = vertex_normal;
    vWorldPos = world.xyz;
    vNormalW = normalize(mat3(matrix_model) * vertex_normal);
    gl_Position = matrix_viewProjection * world;
}
`;const FS=`
#include "gammaPS"
#include "tonemappingPS"

varying vec3 vLocal;
varying vec3 vNormalL;
varying vec3 vWorldPos;
varying vec3 vNormalW;
uniform vec3 view_position;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uLight;
uniform vec4 uLook;             // density per metre, alpha at its thinnest, alpha at its thickest, caustic strength
uniform float uCausticScale;    // caustic cells per metre
uniform vec3 uCamLocal;         // per box: the camera in the box's own space (the box is -0.5..0.5)
uniform vec3 uBoxScale;         // per box: its size along its own axes, metres
uniform vec2 uHeight;           // per box: world height of its bottom and top

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash2(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
}

float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float cells(vec2 p, float t) {
    vec2 n = floor(p), f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash2(n + g));
            float d = length(g + o - f);
            if (d < f1) {
                f2 = f1;
                f1 = d;
            } else if (d < f2) {
                f2 = d;
            }
        }
    }
    return f2 - f1;
}

float caustics(vec2 q, float t) {
    q += 0.3 * vec2(noise(q * 0.5 + t * 0.2), noise(q * 0.5 - t * 0.2 + 7.0));
    float c = cells(q, t * 0.9);
    float glow = 1.0 - smoothstep(0.0, 0.22, c);
    float core = 1.0 - smoothstep(0.0, 0.05, c);
    return (glow * glow * 0.6 + core * 0.5) * (0.55 + 0.45 * noise(q * 0.4 - t * 0.1));
}

float sparkles(vec2 p, float t) {
    float s = noise(p * 6.0 + vec2(t * 0.9, t * 0.4)) * noise(p * 7.3 - vec2(t * 0.5, t * 0.8));
    return smoothstep(0.5, 0.6, s);
}

void main(void) {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(view_position - vWorldPos);
    if (N.y > 0.5) discard;         // the top face: open water under the lid

    // how far the view ray runs through the water from this point to where it leaves the box, in metres
    vec3 d = vLocal - uCamLocal;
    vec3 s = step(0.0, d) * 2.0 - 1.0;
    vec3 tFar = (s * 0.5 - vLocal) / (d + s * 1e-5);
    float tExit = max(0.0, min(tFar.x, min(tFar.y, tFar.z)));
    float thick = tExit * length(d * uBoxScale);
    float depth = 1.0 - exp(-thick * uLook.x);

    float h = clamp((vWorldPos.y - uHeight.x) / max(1e-4, uHeight.y - uHeight.x), 0.0, 1.0);
    vec3 col = mix(uDeep, uShallow, 0.25 + 0.75 * smoothstep(0.0, 1.0, h));
    col = mix(col, uDeep, depth * 0.45);
    float alpha = mix(uLook.y, uLook.z, depth);

    // light from above: caustics brighter near the top, a few sparkles
    vec2 q = vec2(vWorldPos.x + vWorldPos.z, vWorldPos.y) * uCausticScale;
    float c = caustics(q, uTime) * uLook.w * mix(0.35, 1.0, h);
    float sp = sparkles(q * 0.5, uTime) * 0.25;
    col += uLight * (c + sp * 0.8);
    alpha += c * 0.3 + sp * 0.4;

    // the waterline just under the top edge, wobbling; above it the sides are glass over air
    float wave = 0.005 * sin(dot(vWorldPos.xz, vec2(23.0, 17.0)) + uTime * 2.2)
               + 0.003 * sin(dot(vWorldPos.xz, vec2(-11.0, 29.0)) - uTime * 1.6);
    float level = uHeight.y - 0.016 + wave;
    float line = 1.0 - smoothstep(0.0, 0.006, abs(vWorldPos.y - level));
    float air = smoothstep(-0.0015, 0.0015, vWorldPos.y - level);
    col = mix(col, uShallow * 0.4 + vec3(0.6), air * 0.7);
    alpha = mix(alpha, 0.08, air);
    col = mix(col, vec3(1.0), line * 0.75);
    alpha = max(alpha, line * 0.85);

    // the glass: a sheen towards the edges of view and two soft diagonal streaks
    vec3 nl = abs(vNormalL);
    vec2 f = nl.x > 0.5 ? vLocal.zy : (nl.y > 0.5 ? vLocal.xz : vLocal.xy);
    float band = f.x * 0.7 + f.y;
    float streak = (1.0 - smoothstep(0.0, 0.06, abs(band - 0.05))) * 0.16 + (1.0 - smoothstep(0.0, 0.02, abs(band - 0.2))) * 0.12;
    float fres = pow(1.0 - abs(dot(N, V)), 3.0);
    float glass = streak + fres * 0.3;
    col += vec3(glass);
    alpha += glass * 0.8;

    gl_FragColor = vec4(gammaCorrectOutput(toneMap(col)), clamp(alpha, 0.0, 1.0));
}
`;let sharedMaterial=null;let sharedUsers=0;const tmp=new Vec3;const tmp2=new Vec3;class AquariumWater extends Script{initialize(){this.time=0;this.swapped=[];this.fish=[];this._inv=new Mat4;this._u={cam:new Float32Array(3),scale:new Float32Array(3),height:new Float32Array(2),shallow:new Float32Array(3),deep:new Float32Array(3),light:new Float32Array(3),look:new Float32Array(4)};sharedMaterial??(sharedMaterial=this._material());sharedUsers++;for(const mi of this.entity.render?.meshInstances??[]){this.swapped.push([mi,mi.material]);mi.material=sharedMaterial;}if(this.entity.render){this.entity.render.castShadows=false;this.entity.render.receiveShadows=false;}this.region=this._region();this.on("destroy",()=>{for(const[mi,mat]of this.swapped)mi.material=mat;for(const f of this.fish)if(f.e?.parent)f.e.destroy();if(--sharedUsers===0){sharedMaterial.destroy();sharedMaterial=null;}});}_material(){const mat=new ShaderMaterial({uniqueName:"AquariumWater",vertexGLSL:VS,fragmentGLSL:FS,attributes:{vertex_position:SEMANTIC_POSITION,vertex_normal:SEMANTIC_NORMAL}});mat.name="AquariumWater";mat.blendType=BLEND_NORMAL;mat.depthWrite=false;mat.update();return mat}_region(){const m=this.entity.getLocalTransform();const lo=new Vec3(Infinity,Infinity,Infinity);const hi=new Vec3(-Infinity,-Infinity,-Infinity);for(let i=0;i<8;i++){tmp.set(i&1?.5:-0.5,i&2?.5:-0.5,i&4?.5:-0.5);m.transformPoint(tmp,tmp);lo.min(tmp);hi.max(tmp);}const reach=this.fishLength*.6;const height=hi.y-lo.y;lo.x+=reach;hi.x-=reach;lo.z+=reach*.5;hi.z-=reach*.5;lo.y+=height*.4;hi.y-=height*.18;for(const k of ["x","z"]){if(lo[k]>hi[k])lo[k]=hi[k]=(lo[k]+hi[k])/2;}return {lo,hi}}_randomPoint(out){const{lo,hi}=this.region;return out.set(math.lerp(lo.x,hi.x,Math.random()),math.lerp(lo.y,hi.y,Math.random()),math.lerp(lo.z,hi.z,Math.random()))}setCreatures(list){const aquarium=this.entity.parent;if(!aquarium)return;const old=this.fish;this.fish=[];for(const want of list??[]){const at=old.findIndex(f=>f.model===want.model);if(at>=0){this.fish.push(old.splice(at,1)[0]);continue}const template=this.app.root.findByName(want.model);if(!template?.render)continue;const e=template.clone();e.name="AquariumFish";const scale=template.getLocalScale().clone();e.setLocalScale(scale.x*.001,scale.y*.001,scale.z*.001);aquarium.addChild(e);e.enabled=true;e.render.castShadows=false;const pos=this._randomPoint(new Vec3);e.setLocalPosition(pos);this.fish.push({e,pos,scale,model:want.model,base:template.getLocalEulerAngles().clone(),vel:new Vec3,target:this._randomPoint(new Vec3),yaw:Math.random()*360,speed:this.fishSpeed*math.lerp(.75,1.25,Math.random()),phase:Math.random()*6.28,ready:false});}for(const f of old)if(f.e?.parent)f.e.destroy();}_measure(f){const mis=f.e.render?.meshInstances;if(!mis?.length)return;let size=0;for(const mi of mis){const he=mi.aabb.halfExtents;size=Math.max(size,he.x*2,he.y*2,he.z*2);}if(!(size>0))return;const tank=this.entity.parent.getWorldTransform().getScale(tmp2).x;const k=this.fishLength*tank/(size/.001);f.e.setLocalScale(f.scale.x*k,f.scale.y*k,f.scale.z*k);f.ready=true;}_swim(f,dt){if(!f.ready){this._measure(f);return}if(tmp.sub2(f.target,f.pos).length()<.03)this._randomPoint(f.target);const speed=f.speed*(.65+.35*Math.sin(this.time*.5+f.phase));tmp.sub2(f.target,f.pos).normalize().mulScalar(speed);f.vel.lerp(f.vel,tmp,Math.min(1,dt*1.4));f.pos.add(tmp2.copy(f.vel).mulScalar(dt));const{lo,hi}=this.region;f.pos.set(math.clamp(f.pos.x,lo.x,hi.x),math.clamp(f.pos.y,lo.y,hi.y),math.clamp(f.pos.z,lo.z,hi.z));if(f.vel.x*f.vel.x+f.vel.z*f.vel.z>1e-6){f.yaw=math.lerpAngle(f.yaw,Math.atan2(f.vel.x,f.vel.z)*math.RAD_TO_DEG,Math.min(1,dt*3));}f.e.setLocalPosition(f.pos.x,f.pos.y+Math.sin(this.time*1.7+f.phase)*.004,f.pos.z);f.e.setLocalEulerAngles(f.base.x,f.base.y+f.yaw,f.base.z);}_lin(out,c){out[0]=c.r**2.2;out[1]=c.g**2.2;out[2]=c.b**2.2;return out}update(dt){this.time=(this.time+dt)%3600;for(const f of this.fish)this._swim(f,dt);const u=this._u;const mat=sharedMaterial;mat.setParameter("uTime",this.time);mat.setParameter("uShallow",this._lin(u.shallow,this.shallowColor));mat.setParameter("uDeep",this._lin(u.deep,this.deepColor));mat.setParameter("uLight",this._lin(u.light,this.lightColor));u.look[0]=this.density;u.look[1]=this.minAlpha;u.look[2]=this.maxAlpha;u.look[3]=this.causticStrength;mat.setParameter("uLook",u.look);mat.setParameter("uCausticScale",this.causticScale);if(!this._cam?.parent)this._cam=this.camera??this.app.root.findByName("Camera");const cam=this._cam?.getPosition();if(!cam)return;const wt=this.entity.getWorldTransform();this._inv.copy(wt).invert().transformPoint(cam,tmp);u.cam[0]=tmp.x;u.cam[1]=tmp.y;u.cam[2]=tmp.z;wt.getScale(tmp);u.scale[0]=tmp.x;u.scale[1]=tmp.y;u.scale[2]=tmp.z;for(const[mi]of this.swapped){const box=mi.aabb;u.height[0]=box.center.y-box.halfExtents.y;u.height[1]=box.center.y+box.halfExtents.y;mi.setParameter("uCamLocal",u.cam);mi.setParameter("uBoxScale",u.scale);mi.setParameter("uHeight",u.height);}}constructor(...args){super(...args),_define_property(this,"camera",null),_define_property(this,"shallowColor",new Color(.4,.86,.92)),_define_property(this,"deepColor",new Color(.08,.45,.78)),_define_property(this,"lightColor",new Color(.95,1,1)),_define_property(this,"density",4),_define_property(this,"minAlpha",.26),_define_property(this,"maxAlpha",.66),_define_property(this,"causticScale",15),_define_property(this,"causticStrength",.28),_define_property(this,"fishLength",.12),_define_property(this,"fishSpeed",.05);}}_define_property(AquariumWater,"scriptName","aquariumWater");

export { AquariumWater };
