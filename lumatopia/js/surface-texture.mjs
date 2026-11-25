import { S as Script, a as StandardMaterial, b as SHADERLANGUAGE_GLSL, H as Vec2 } from './index.mjs';

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const DIFFUSE=`
uniform vec3 material_diffuse;
uniform sampler2D uSurfaceMap;
uniform vec4 uSurfaceTile;              // 1 / tile width, 1 / tile height (metres), strength, 1 = decode sRGB by hand
uniform float uSurfaceWallsOnly;        // 1 = only faces that stand upright (house walls, not roofs or tops)
#ifdef STD_DIFFUSEDETAIL_TEXTURE
    #include "detailModesPS"
#endif
void getAlbedo() {
    dAlbedo = material_diffuse.rgb;
    #ifdef STD_DIFFUSE_TEXTURE
        vec3 albedoTexture = {STD_DIFFUSE_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSE_TEXTURE_NAME}, {STD_DIFFUSE_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSE_TEXTURE_CHANNEL};
        #ifdef STD_DIFFUSEDETAIL_TEXTURE
            vec3 albedoDetail = {STD_DIFFUSEDETAIL_TEXTURE_DECODE}(texture2DBias({STD_DIFFUSEDETAIL_TEXTURE_NAME}, {STD_DIFFUSEDETAIL_TEXTURE_UV}, {STD_TEXTURE_BIAS})).{STD_DIFFUSEDETAIL_TEXTURE_CHANNEL};
            albedoTexture = detailMode_{STD_DIFFUSEDETAIL_DETAILMODE}(albedoTexture, albedoDetail);
        #endif
        dAlbedo *= albedoTexture;
    #endif
    #ifdef STD_DIFFUSE_VERTEX
        dAlbedo *= saturate(vVertexColor.{STD_DIFFUSE_VERTEX_CHANNEL});
    #endif

    // the face's main axis picks the projection: from above (x, z), from the side (z, y), from the front (x, y)
    vec3 n = abs(vNormalW);
    vec2 uv = n.y >= max(n.x, n.z) ? vPositionW.xz : (n.x >= n.z ? vPositionW.zy : vPositionW.xy);
    vec3 tint = texture2D(uSurfaceMap, uv * uSurfaceTile.xy).rgb;
    if (uSurfaceTile.w > 0.5) tint = pow(tint, vec3(2.2));
    float amount = uSurfaceTile.z * mix(1.0, 1.0 - smoothstep(0.35, 0.5, n.y), uSurfaceWallsOnly);
    dAlbedo *= mix(vec3(1.0), tint * 2.0, amount);
}
`;const names=s=>s.split(",").map(n=>n.trim()).filter(Boolean);class SurfaceTexture extends Script{initialize(){this.clones=new Map;this.swapped=[];this.done=new Map;this.tile=new Float32Array(4);this.map=null;this.dirty=false;this._onLoad=()=>{this.dirty=true;};this.app.assets.on("load",this._onLoad);if(this.texture){this.texture.ready(asset=>{this.map=asset.resource;this.map.anisotropy=8;this._setup();});this.app.assets.load(this.texture);}else {console.warn(`[surfaceTexture] ${this.entity.name}: no texture`);}this.on("destroy",()=>{this.app.assets.off("load",this._onLoad);for(const[mi,mat]of this.swapped)mi.material=mat;for(const m of this.clones.values())m.destroy();});}_setup(){this.dirty=false;if(!this.map)return;const wanted=new Set(names(this.targets));for(const e of this.app.root.find(e=>wanted.has(e.name)&&!!e.render)){const mis=e.render.meshInstances;if(!mis.length||this.done.get(e)===mis)continue;this.done.set(e,mis);for(const mi of mis){if([...this.clones.values()].includes(mi.material))continue;this.swapped.push([mi,mi.material]);mi.material=this._textured(mi.material);}}for(const[orig,m]of this.clones){if(orig instanceof StandardMaterial&&StandardMaterial.TEXTURE_PARAMETERS.some(p=>m[p]!==orig[p])){m.copy(orig);this._prepare(m,orig);}}this._uniforms(true);}_textured(mat){let m=this.clones.get(mat);if(!m){m=mat.clone();this._prepare(m,mat);this.clones.set(mat,m);}return m}_prepare(m,orig){m.name=`${orig.name} + ${this.texture.name}`;m.getShaderChunks(SHADERLANGUAGE_GLSL).set("diffusePS",DIFFUSE);m.shaderChunksVersion="2.8";m.setParameter("uSurfaceMap",this.map);m.setParameter("uSurfaceTile",this.tile);m.update();}_uniforms(force){const t=this.tile,x=1/Math.max(.01,this.tileSize.x),y=1/Math.max(.01,this.tileSize.y);const decode=this.map.srgb?0:1,walls=this.wallsOnly?1:0;if(!force&&t[0]===x&&t[1]===y&&t[2]===this.strength&&t[3]===decode&&this._walls===walls)return;t[0]=x;t[1]=y;t[2]=this.strength;t[3]=decode;this._walls=walls;for(const m of this.clones.values()){m.setParameter("uSurfaceTile",t);m.setParameter("uSurfaceWallsOnly",walls);}}update(){if(this.dirty)this._setup();if(this.map)this._uniforms(false);}constructor(...args){super(...args),_define_property(this,"targets",""),_define_property(this,"texture",null),_define_property(this,"tileSize",new Vec2(1,1)),_define_property(this,"strength",1),_define_property(this,"wallsOnly",false);}}_define_property(SurfaceTexture,"scriptName","surfaceTexture");

export { SurfaceTexture };
