import { S as Script, d as ShaderMaterial, f as SEMANTIC_POSITION, q as BLEND_NORMAL, j as Texture, A as ADDRESS_CLAMP_TO_EDGE, y as FILTER_LINEAR, z as PIXELFORMAT_RGBA8, D as BoundingBox, c as Color, G as SEMANTIC_NORMAL } from './index.mjs';

function _define_property$1(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const EDGE_RANGE=2;const EDGE_TEXEL=.08;const MAX_FLOATERS=4;const VS$1=`
attribute vec3 vertex_position;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec3 vWorldPos;

void main(void) {
    vec4 world = matrix_model * vec4(vertex_position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = matrix_viewProjection * world;
}
`;const COMMON=`
#include "gammaPS"
#include "tonemappingPS"

varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uLight;                    // caustics and sparkles

// hashes without sin(), so they stay stable far from the origin
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

// cells round points that wander about: the gap between the nearest and the second nearest point is small along
// the cell borders, which is where the caustic lines go
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

// small glints where two drifting noises peak together
float sparkles(vec2 p, float t) {
    float s = noise(p * 6.0 + vec2(t * 0.9, t * 0.4)) * noise(p * 7.3 - vec2(t * 0.5, t * 0.8));
    return smoothstep(0.5, 0.6, s);
}

// a net of soft, glowing caustic lines, wobbling and brighter in places
float caustics(vec2 q, float t) {
    q += 0.3 * vec2(noise(q * 0.5 + t * 0.2), noise(q * 0.5 - t * 0.2 + 7.0));
    q += 0.12 * vec2(noise(q * 1.6 - t * 0.3 + 3.0), noise(q * 1.6 + t * 0.3 + 11.0));      // curves the straight cell edges
    float c = cells(q, t * 0.9);
    float glow = 1.0 - smoothstep(0.0, 0.22, c);
    float core = 1.0 - smoothstep(0.0, 0.05, c);
    return (glow * glow * 0.6 + core * 0.5) * (0.55 + 0.45 * noise(q * 0.4 - t * 0.1));
}

vec4 finalColor(vec3 col, float alpha) {
    return vec4(gammaCorrectOutput(toneMap(col)), alpha);
}
`;const SEA_FS=`
#include "screenDepthPS"
uniform vec3 view_position;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFar;
uniform vec3 uFoam;
uniform vec4 uSea;                      // depth where it is fully deep (m), foam width (m), surf speed, caustic cells/m

void main(void) {
    float t = uTime;
    vec2 p = vWorldPos.xz;
    vec3 toPix = vWorldPos - view_position;

    // the water's depth straight down at this pixel: the scene behind it (depth map) put back into the world
    vec3 fwd = -vec3(matrix_view[0][2], matrix_view[1][2], matrix_view[2][2]);
    float sceneZ = getLinearScreenDepth(gl_FragCoord.xy * screen_size.zw);
    vec3 behind = view_position + toPix * (sceneZ / max(dot(toPix, fwd), 1e-4));
    float depth = max(vWorldPos.y - behind.y, 0.0);
    // shallow 1 at the waterline, 0 from uSea.x down (before the sand under the sea runs out: no seam there)
    float shallow = 1.0 - clamp(depth / uSea.x, 0.0, 1.0);
    shallow *= shallow;
    float dist = length(toPix);

    vec3 col = mix(uDeep, uShallow, shallow);
    // big slow swells of lighter and darker water
    float swell = noise(p * 0.12 + vec2(t * 0.02, t * 0.03)) * noise(p * 0.07 - vec2(t * 0.015, 0.0));
    col *= 0.9 + 0.3 * swell;
    if (shallow > 0.02) col += uLight * caustics(p * uSea.w, t) * shallow * 0.3;
    col = mix(col, uFar, smoothstep(25.0, 160.0, dist));
    float glint = sparkles(p, t) * (1.0 - smoothstep(20.0, 70.0, dist));
    col += uLight * glint;

    // foam: a lacy rim where the water touches anything, and lines of surf rolling in over the shallows
    float lace = noise(p * 2.5 + vec2(t * 0.2, -t * 0.15));
    float fw = uSea.y * (0.4 + lace);
    float rim = 1.0 - smoothstep(fw * 0.6, fw, depth);
    float wave = fract(depth * 3.0 + t * uSea.z);
    float surf = smoothstep(0.0, 0.05, wave) * (1.0 - smoothstep(0.12, 0.25, wave));
    surf *= smoothstep(0.35, 0.55, noise(p * 1.7 - vec2(t * 0.1, 0.0))) * (1.0 - smoothstep(0.1, 0.35, depth));
    float foam = clamp(max(rim, surf * 0.9), 0.0, 1.0);
    col = mix(col, uFoam, foam);

    // see-through in the shallows, so the sand shows
    float alpha = max(max(mix(1.0, 0.6, shallow), foam), glint);
    gl_FragColor = finalColor(col, alpha);
}
`;const POOL_FS=`
uniform sampler2D uEdgeMap;
uniform vec4 uEdgeRect;                 // min x, min z, 1 / size x, 1 / size z
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec4 uPool;                     // caustic cells per metre, caustic strength, -, wall-to-deep distance (m)
uniform vec4 uFloaters[${MAX_FLOATERS}];         // x, z, radius, on

void main(void) {
    float t = uTime;
    vec2 p = vWorldPos.xz;
    float edge = texture2D(uEdgeMap, (p - uEdgeRect.xy) * uEdgeRect.zw).r * ${EDGE_RANGE.toFixed(1)};

    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, uPool.w, edge));
    col *= 0.86 + 0.14 * smoothstep(0.0, 0.12, edge);          // a soft dark line where the wall meets the water

    col += uLight * caustics(p * uPool.x, t) * uPool.y;
    col += uLight * sparkles(p, t) * 0.5;

    // rings of ripples round floating things
    for (int i = 0; i < ${MAX_FLOATERS}; i++) {
        vec4 f = uFloaters[i];
        if (f.w > 0.5) {
            float d = length(p - f.xy) - f.z;
            if (d > -0.1 && d < 0.6) {
                float ring = smoothstep(0.6, 1.0, sin(d * 28.0 - t * 4.0)) * (1.0 - d / 0.6);
                col += uLight * ring * 0.3 + uLight * (1.0 - smoothstep(0.0, 0.06, abs(d))) * 0.5;
            }
        }
    }
    gl_FragColor = finalColor(col, 1.0);
}
`;const names=s=>s.split(",").map(n=>n.trim()).filter(Boolean);class Water extends Script{initialize(){this.time=0;this.hidden=[];this.swapped=[];this.pools=[];this.seaMat=null;this.depth=false;this.dirty=false;this.cam=(this.camera??this.app.root.findComponent("camera")?.entity)?.camera??null;this._u={vec3:new Map,vec4:new Map};const find=list=>names(list).flatMap(n=>this.app.root.find(e=>e.name===n&&!!e.render));for(const n of names(this.hide)){for(const e of this.app.root.find(e=>e.name===n&&e.enabled)){e.enabled=false;this.hidden.push(e);}}const seas=[...new Set([...find(this.sea),...(this.seaEntities??[]).filter(e=>e?.render)])];this.waters=[...seas.map(e=>({e,sea:true})),...find(this.pool).map(e=>({e,sea:false}))];this._setup();this._onLoad=()=>{this.dirty=true;};this.app.assets.on("load",this._onLoad);this.on("destroy",()=>{this.app.assets.off("load",this._onLoad);for(const[mi,mat]of this.swapped)mi.material=mat;for(const e of this.hidden)e.enabled=true;if(this.depth)this.cam.requestSceneDepthMap(false);for(const p of this.pools)p.texture.destroy();});}_setup(){this.dirty=false;for(const w of this.waters){const mis=w.e.render?.meshInstances;if(!mis?.length||w.mis===mis)continue;w.mis=mis;if(w.sea){this.seaMat??(this.seaMat=this._material("WaterSea",SEA_FS,true));this._swap(w.e,this.seaMat);if(!this.depth&&this.cam){this.cam.requestSceneDepthMap(true);this.depth=true;}if(!this.cam)console.warn("[water] no camera: the sea has no depth (no shallows, no foam)");continue}const map=this._edgeMap(mis[0]);if(!map)continue;let pool=this.pools.find(p=>p.e===w.e);if(pool){pool.texture.destroy();}else {pool={e:w.e,mat:this._material("WaterPool",POOL_FS,false),data:new Float32Array(MAX_FLOATERS*4)};this.pools.push(pool);}pool.texture=map.texture;pool.map=map;pool.mat.setParameter("uEdgeMap",map.texture);pool.mat.setParameter("uEdgeRect",map.rect);this._swap(w.e,pool.mat);}for(const p of this.pools)p.floaters=this._floaters(p.e,p.map);this._uniforms(0);}_material(name,fs,transparent){const mat=new ShaderMaterial({uniqueName:name,vertexGLSL:VS$1,fragmentGLSL:COMMON+fs,attributes:{vertex_position:SEMANTIC_POSITION}});if(transparent)mat.blendType=BLEND_NORMAL;mat.update();return mat}_swap(entity,mat){for(const mi of entity.render.meshInstances){this.swapped.push([mi,mi.material]);mi.material=mat;}entity.render.castShadows=false;}_edgeMap(mi){const pos=[],idx=[];const nv=mi.mesh.getPositions(pos);if(!nv||mi.mesh.getIndices(idx)<=0)return null;const d=mi.node.getWorldTransform().data;const w=new Float32Array(nv*3);let top=-Infinity;for(let i=0;i<nv;i++){const x=pos[i*3],y=pos[i*3+1],z=pos[i*3+2];w[i*3]=d[0]*x+d[4]*y+d[8]*z+d[12];w[i*3+1]=d[1]*x+d[5]*y+d[9]*z+d[13];w[i*3+2]=d[2]*x+d[6]*y+d[10]*z+d[14];top=Math.max(top,w[i*3+1]);}const onTop=i=>Math.abs(w[i*3+1]-top)<.001;const key=i=>`${Math.round(w[i*3]*1e3)},${Math.round(w[i*3+2]*1e3)}`;const edges=new Map;let x0=Infinity,z0=Infinity,x1=-Infinity,z1=-Infinity;for(let t=0;t+2<idx.length;t+=3){const tri=[idx[t],idx[t+1],idx[t+2]];if(!tri.every(onTop))continue;for(let k=0;k<3;k++){const a=tri[k],b=tri[(k+1)%3];const ka=key(a),kb=key(b),ek=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;const e=edges.get(ek);if(e)e.n++;else edges.set(ek,{n:1,ax:w[a*3],az:w[a*3+2],bx:w[b*3],bz:w[b*3+2]});x0=Math.min(x0,w[a*3]);x1=Math.max(x1,w[a*3]);z0=Math.min(z0,w[a*3+2]);z1=Math.max(z1,w[a*3+2]);}}const segs=[...edges.values()].filter(e=>e.n===1);if(!segs.length){console.warn(`[water] ${mi.node.name}: no flat top found - pool left as it was`);return null}const width=Math.max(8,Math.ceil((x1-x0)/EDGE_TEXEL)),height=Math.max(8,Math.ceil((z1-z0)/EDGE_TEXEL));const texture=new Texture(this.app.graphicsDevice,{name:"WaterPoolEdge",width,height,format:PIXELFORMAT_RGBA8,mipmaps:false,minFilter:FILTER_LINEAR,magFilter:FILTER_LINEAR,addressU:ADDRESS_CLAMP_TO_EDGE,addressV:ADDRESS_CLAMP_TO_EDGE});const px=texture.lock();for(let j=0;j<height;j++){const z=z0+(j+.5)*(z1-z0)/height;for(let i=0;i<width;i++){const x=x0+(i+.5)*(x1-x0)/width;let best=Infinity;for(const s of segs){const ex=s.bx-s.ax,ez=s.bz-s.az,l2=ex*ex+ez*ez;const u=l2>0?Math.min(1,Math.max(0,((x-s.ax)*ex+(z-s.az)*ez)/l2)):0;const dx=x-s.ax-ex*u,dz=z-s.az-ez*u;best=Math.min(best,dx*dx+dz*dz);}const o=(j*width+i)*4;px[o]=px[o+1]=px[o+2]=Math.min(255,Math.round(Math.sqrt(best)/EDGE_RANGE*255));px[o+3]=255;}}texture.unlock();return {texture,top,x0,z0,x1,z1,rect:new Float32Array([x0,z0,1/(x1-x0),1/(z1-z0)])}}_floaters(poolEntity,map){const out=[];for(const rc of this.app.root.findComponents("render")){if(out.length>=MAX_FLOATERS)break;const e=rc.entity;if(!rc.enabled||!e.enabled||e===poolEntity||!rc.meshInstances.length)continue;if(rc.meshInstances.some(mi=>mi.skinInstance))continue;const box=this._box(rc,new BoundingBox);const c=box.center,h=box.halfExtents;if(c.y-h.y>map.top||c.y+h.y<map.top)continue;if(c.x<map.x0||c.x>map.x1||c.z<map.z0||c.z>map.z1||Math.max(h.x,h.z)>1.5)continue;out.push({rc,box,radius:Math.min(h.x,h.z)*.9});}return out}_box(rc,box){box.copy(rc.meshInstances[0].aabb);for(let i=1;i<rc.meshInstances.length;i++)box.add(rc.meshInstances[i].aabb);return box}_lin(name,c,n=3){let a=this._u[n===3?"vec3":"vec4"].get(name);if(!a)this._u[n===3?"vec3":"vec4"].set(name,a=new Float32Array(n));a[0]=c.r**2.2;a[1]=c.g**2.2;a[2]=c.b**2.2;return a}_vec4(name,x,y,z,w){let a=this._u.vec4.get(name);if(!a)this._u.vec4.set(name,a=new Float32Array(4));a[0]=x;a[1]=y;a[2]=z;a[3]=w;return a}_uniforms(dt){this.time=(this.time+dt)%3600;const light=this._lin("light",this.lightColor);const sea=this.seaMat;if(sea){sea.setParameter("uTime",this.time);sea.setParameter("uLight",light);sea.setParameter("uShallow",this._lin("seaShallow",this.seaShallow));sea.setParameter("uDeep",this._lin("seaDeep",this.seaDeep));sea.setParameter("uFar",this._lin("seaFar",this.seaFar));sea.setParameter("uFoam",this._lin("foam",this.foamColor));sea.setParameter("uSea",this._vec4("sea",Math.max(.01,this.seaDepth),this.foamWidth,this.surfSpeed,this.causticScale));}for(const p of this.pools){p.mat.setParameter("uTime",this.time);p.mat.setParameter("uLight",light);p.mat.setParameter("uShallow",this._lin("poolShallow",this.poolShallow));p.mat.setParameter("uDeep",this._lin("poolDeep",this.poolDeep));p.mat.setParameter("uPool",this._vec4("pool",this.causticScale,this.causticStrength,0,Math.max(.01,this.poolDepth)));p.data.fill(0);p.floaters.forEach((f,i)=>{if(!f.rc.meshInstances.length)return;const c=this._box(f.rc,f.box).center;p.data[i*4]=c.x;p.data[i*4+1]=c.z;p.data[i*4+2]=f.radius;p.data[i*4+3]=f.rc.enabled&&f.rc.entity.enabled?1:0;});p.mat.setParameter("uFloaters[0]",p.data);}}update(dt){if(this.dirty)this._setup();this._uniforms(dt);}constructor(...args){super(...args),_define_property$1(this,"camera",null),_define_property$1(this,"sea","sea"),_define_property$1(this,"seaEntities",[]),_define_property$1(this,"pool","pool_water"),_define_property$1(this,"hide","sea_mid, sea_shallow, shore_foam"),_define_property$1(this,"seaShallow",new Color(.35,.88,.85)),_define_property$1(this,"seaDeep",new Color(.08,.59,.86)),_define_property$1(this,"seaFar",new Color(.25,.65,.89)),_define_property$1(this,"poolShallow",new Color(.55,.92,.97)),_define_property$1(this,"poolDeep",new Color(.24,.78,.93)),_define_property$1(this,"foamColor",new Color(1,1,1)),_define_property$1(this,"lightColor",new Color(.9,1,1)),_define_property$1(this,"seaDepth",1.2),_define_property$1(this,"foamWidth",.12),_define_property$1(this,"surfSpeed",.25),_define_property$1(this,"causticScale",1.3),_define_property$1(this,"causticStrength",.6),_define_property$1(this,"poolDepth",1.6);}}_define_property$1(Water,"scriptName","beachWater");

var water = /*#__PURE__*/Object.freeze({
    __proto__: null,
    Water: Water
});

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const VS=`
attribute vec3 vertex_position;
attribute vec3 vertex_normal;
uniform mat4 matrix_model;
uniform mat4 matrix_viewProjection;
varying vec2 vPos;                      // across, up: the mesh's own metres

void main(void) {
    vPos = vec2(vertex_normal.z < -0.5 ? -vertex_position.x : vertex_position.x, vertex_position.y);
    gl_Position = matrix_viewProjection * matrix_model * vec4(vertex_position, 1.0);
}
`;const FS=`
#include "gammaPS"
#include "tonemappingPS"

varying vec2 vPos;
uniform float uTime;
uniform vec4 uShape;                    // half width, bottom, top of the straight sides, height of the arch above them
uniform vec4 uLook;                     // brightness, whirl speed, sparkles, notes
uniform vec3 uPink;
uniform vec3 uLilac;
uniform vec3 uAqua;
uniform vec3 uGlow;

// hashes without sin(), as in the water
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

float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
        s += a * noise(p);
        p = p * 2.03 + vec2(17.1, 9.7);
        a *= 0.5;
    }
    return s / 0.9375;
}

mat2 rot(float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, s, -s, c);
}

// how far inside the outline a point is, metres; the bottom edge doesn't count (that's the floor)
float rimDistance(vec2 p) {
    if (p.y <= uShape.z) return uShape.x - abs(p.x);
    vec2 r = vec2(uShape.x, uShape.w);
    vec2 e = vec2(p.x, p.y - uShape.z);
    float f = dot(e / r, e / r) - 1.0;
    vec2 g = 2.0 * e / (r * r);
    return min(-f / max(length(g), 1e-3), uShape.x - abs(p.x));
}

// a four-point star, d in units of its size
float star(vec2 d) {
    float core = exp(-dot(d, d) * 30.0);
    float rays = exp(-abs(d.x) * 36.0 - abs(d.y) * 4.0) + exp(-abs(d.y) * 36.0 - abs(d.x) * 4.0);
    return core + rays * 0.7;
}

// two layers of stars drifting up, each twinkling in its own rhythm
float sparkles(vec2 p, float t) {
    float s = 0.0;
    for (int k = 0; k < 2; k++) {
        float fk = float(k);
        float cell = mix(0.24, 0.16, fk);
        vec2 g = p / cell - vec2(0.0, t * mix(0.35, 0.5, fk));
        vec2 id = floor(g);
        vec2 h = hash2(id + fk * 37.0);
        vec2 o = (hash2(id * 1.7 + 3.1) - 0.5) * 0.4;
        float tw = 0.5 + 0.5 * sin(t * (1.5 + 2.5 * h.y) + h.x * 40.0);
        s += step(0.5, h.x) * tw * tw * tw * star((fract(g) - 0.5 - o) / mix(0.42, 0.3, h.y));
    }
    return s;
}

float box(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

float segment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

// an eighth note (a tilted head, a stem, a flag), its head at the origin, about 0.9 units tall
float noteShape(vec2 p) {
    vec2 hp = rot(0.45) * p;
    float head = (length(hp / vec2(0.19, 0.13)) - 1.0) * 0.13;
    float stem = box(p - vec2(0.16, 0.4), vec2(0.028, 0.4));
    float flag = segment(p, vec2(0.17, 0.78), vec2(0.37, 0.48)) - 0.05;
    return min(head, min(stem, flag));
}

// x: the note's pale body, y: its coloured halo, z: which colour
vec3 notes(vec2 p, float t, float rim, float up) {
    const float CELL = 0.42, SIZE = 0.5;
    vec2 g = p / CELL - vec2(0.0, t * 0.16);
    vec2 id = floor(g);
    vec2 h = hash2(id + 11.0);
    vec2 lp = fract(g) - vec2(0.24 + 0.36 * h.y, 0.22);
    lp.x -= 0.05 * sin(t * 1.3 + h.x * 30.0);
    float d = noteShape(lp / SIZE) * SIZE;
    float shape = 1.0 - smoothstep(-0.012, 0.012, d);
    float halo = exp(-max(d, 0.0) * 22.0);
    float show = step(0.55, h.x) * smoothstep(0.08, 0.3, up) * (1.0 - smoothstep(0.62, 0.86, up)) * smoothstep(0.06, 0.16, rim);
    return vec3(shape * show, halo * show, step(0.5, fract(h.y * 7.0)));
}

void main(void) {
    float t = uTime;
    vec2 p = vPos;
    float bottom = uShape.y;
    float height = uShape.z + uShape.w - bottom;
    float up = (p.y - bottom) / height;
    float rim = rimDistance(p);

    // the whirl: the clouds turn round the middle, wound tighter near it
    vec2 q = (p - vec2(0.0, bottom + height * 0.55)) / uShape.x;
    float r = length(q);
    vec2 s = rot(uLook.y * t * 0.3 + 3.2 * exp(-r * 1.3)) * q;

    // soft clouds, folded into each other
    vec2 w = s * 1.15;
    w += vec2(fbm(w + vec2(0.0, t * 0.05)), fbm(w + vec2(5.2, 1.3) - t * 0.04)) * 0.9 - 0.45;
    float n1 = fbm(w * 1.1 + t * 0.03);
    float n2 = fbm(w * 1.3 + vec2(3.7, 8.1) - t * 0.035);
    vec3 col = uLilac;
    col = mix(col, uPink, smoothstep(0.42, 0.66, n1));
    col = mix(col, uAqua, smoothstep(0.48, 0.72, n2) * 0.85);

    // pale streaks along the spiral
    float arms = 0.5 + 0.5 * sin(2.0 * atan(s.y, s.x) + 4.5 * log(r + 0.12) + 3.0 * n1);
    col = mix(col, uGlow, arms * arms * 0.32 * smoothstep(0.05, 0.35, r) * (1.0 - smoothstep(0.75, 1.15, r)));

    // light in the middle, from the floor and all along the arch
    col = mix(col, uGlow, 0.3 * exp(-r * r * 3.5));
    col = mix(col, vec3(1.0), 0.55 * exp(-up * 9.0));
    col = mix(col, uGlow, 0.8 * exp(-max(rim, 0.0) / 0.045));

    col += uGlow * sparkles(p, t) * uLook.z * smoothstep(0.02, 0.08, rim);

    vec3 n = notes(p, t, rim, up);
    vec3 tint = n.z > 0.5 ? uAqua : uPink;
    col = mix(col, tint * 1.15, n.y * 0.7 * uLook.w);
    col = mix(col, mix(tint, vec3(1.0), 0.75), n.x * uLook.w);

    col *= uLook.x * (1.0 + 0.04 * sin(t * 2.4));
    gl_FragColor = vec4(gammaCorrectOutput(toneMap(col)), 1.0);
}
`;class BeachPortal extends Script{initialize(){this.time=0;this.swapped=[];this.mis=null;this.u={look:new Float32Array(4),pink:new Float32Array(3),lilac:new Float32Array(3),aqua:new Float32Array(3),glow:new Float32Array(3)};this.material=new ShaderMaterial({uniqueName:"BeachPortal",vertexGLSL:VS,fragmentGLSL:FS,attributes:{vertex_position:SEMANTIC_POSITION,vertex_normal:SEMANTIC_NORMAL}});this.material.update();this._setup();this.on("destroy",()=>{for(const[mi,mat]of this.swapped)mi.material=mat;this.material.destroy();});}_setup(){const mis=this.entity.render?.meshInstances;if(!mis?.length||mis===this.mis)return;this.mis=mis;this.material.setParameter("uShape",this._shape(mis[0].mesh));for(const mi of mis){this.swapped.push([mi,mi.material]);mi.material=this.material;}this.entity.render.castShadows=false;}_shape(mesh){const pos=[];const n=mesh.getPositions(pos);if(!n){const{center,halfExtents}=mesh.aabb;const arch=halfExtents.x*1.18;return [halfExtents.x,center.y-halfExtents.y,center.y+halfExtents.y-arch,arch]}let half=0,bottom=Infinity,top=-Infinity;for(let i=0;i<n;i++){half=Math.max(half,Math.abs(pos[i*3]));bottom=Math.min(bottom,pos[i*3+1]);top=Math.max(top,pos[i*3+1]);}let spring=bottom;for(let i=0;i<n;i++){if(Math.abs(pos[i*3])>half-.002)spring=Math.max(spring,pos[i*3+1]);}return [half,bottom,spring,Math.max(top-spring,.001)]}update(dt){this._setup();this.time=(this.time+dt)%3600;const m=this.material,u=this.u;m.setParameter("uTime",this.time);u.look.set([this.brightness,this.whirl,this.sparkles,this.notes]);m.setParameter("uLook",u.look);for(const name of ["pink","lilac","aqua","glow"]){const c=this[name];u[name].set([c.r**2.2,c.g**2.2,c.b**2.2]);m.setParameter(`u${name[0].toUpperCase()}${name.slice(1)}`,u[name]);}}constructor(...args){super(...args),_define_property(this,"pink",new Color(1,.42,.85)),_define_property(this,"lilac",new Color(.6,.48,1)),_define_property(this,"aqua",new Color(.3,.86,.95)),_define_property(this,"glow",new Color(1,.82,.98)),_define_property(this,"brightness",.72),_define_property(this,"whirl",1),_define_property(this,"sparkles",1),_define_property(this,"notes",1);}}_define_property(BeachPortal,"scriptName","beachPortal");

var beachPortal = /*#__PURE__*/Object.freeze({
    __proto__: null,
    BeachPortal: BeachPortal
});

export { beachPortal as b, water as w };
