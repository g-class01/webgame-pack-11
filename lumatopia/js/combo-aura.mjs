import { S as Script, E as Entity, M as MeshInstance, d as ShaderMaterial, e as SEMANTIC_TEXCOORD0, f as SEMANTIC_POSITION, B as BLEND_PREMULTIPLIED, g as CULLFACE_NONE, h as Mesh, P as PRIMITIVE_TRIANGLES, c as Color } from './index.mjs';

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const ORBIT=`
    uniform vec4 uAura;                 // x: time, y: amount (how many show), z: energy, w: pulse
    uniform vec2 uMotion;               // x: orbit angle, y: climb (0..1, wraps)
    uniform vec3 uShape;                // x: radius, y: height, z: particle size (metres)
    uniform vec3 uColorLow;
    uniform vec3 uColorHigh;

    float orbitAngle(vec4 seed, float dir) { return seed.x + dir * uMotion.x * (0.8 + 0.4 * seed.y); }
    float orbitClimb(vec4 seed) { return fract(seed.z + uMotion.y * (0.85 + 0.3 * seed.y)); }

    // a point on the climbing, narrowing orbit around the dancer (model space)
    vec3 orbit(vec4 seed, float angle, float climb) {
        float r = uShape.x * (0.75 + 0.5 * seed.y) * (1.0 + 0.35 * uAura.z) * (1.0 - 0.3 * climb) * (1.0 + 0.1 * uAura.w);
        return vec3(cos(angle) * r, climb * uShape.y, sin(angle) * r);
    }

    float revealed(vec4 seed) { return clamp((uAura.y - seed.w) * 10.0, 0.0, 1.0); }     // arrive in rank order
    vec3 tint(vec4 seed) { return mix(uColorLow, uColorHigh, clamp(uAura.z * 1.3 - seed.y * 0.4, 0.0, 1.0)); }
`;const SPARKLE_VS=`
    attribute vec3 aPosition;           // xy: quad corner (-1..1), z: orbit direction (+1 / -1)
    attribute vec4 aSeed;               // x: phase, y: radius jitter, z: height offset, w: reveal rank (0..1)

    uniform mat4 matrix_model;
    uniform mat4 matrix_view;
    uniform mat4 matrix_viewProjection;
    ${ORBIT}

    varying vec2 vUv;
    varying vec3 vColor;
    varying float vAlpha;

    void main(void) {
        float pulse = uAura.w;
        float climb = orbitClimb(aSeed);
        float life = sin(climb * 3.14159);                              // fade in at the floor, out at the top
        vec3 center = (matrix_model * vec4(orbit(aSeed, orbitAngle(aSeed, aPosition.z), climb), 1.0)).xyz;

        float twinkle = 0.65 + 0.35 * sin(uAura.x * (5.0 + 7.0 * aSeed.y) + aSeed.x * 4.0);
        vAlpha = revealed(aSeed) * life * twinkle * (0.6 + 0.4 * uAura.z) * (1.0 + 0.6 * pulse);
        float size = uShape.z * (0.7 + 0.6 * fract(aSeed.x * 3.7)) * (0.5 + 0.5 * life) * (1.0 + 0.2 * pulse);

        vec3 right = vec3(matrix_view[0][0], matrix_view[1][0], matrix_view[2][0]);
        vec3 up = vec3(matrix_view[0][1], matrix_view[1][1], matrix_view[2][1]);
        gl_Position = matrix_viewProjection * vec4(center + (right * aPosition.x + up * aPosition.y) * size, 1.0);
        if (vAlpha < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);    // hidden: collapse the quad off screen

        vUv = aPosition.xy;
        vColor = tint(aSeed);
    }
`;const SPARKLE_FS=`
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vAlpha;

    void main(void) {
        float d = length(vUv);
        float core = exp(-d * d * 10.0);                                        // soft round glow
        float star = max(0.0, 1.0 - abs(vUv.x * vUv.y) * 24.0) * max(0.0, 1.0 - d);  // four-point sparkle
        float a = min(1.0, (core + 0.6 * star) * vAlpha);
        if (a < 0.003) discard;
        // premultiplied, and only partly covering: it tints what is behind as well as adding light, so
        // the pink and gold survive on the pastel room instead of washing out to white
        gl_FragColor = vec4(vColor * a + vec3(0.35 * core * a), 0.6 * a);
    }
`;const TRAIL_VS=`
    attribute vec3 aPosition;           // x: 0 at the sparkle .. 1 at the tail end, y: side (-1 / +1), z: orbit direction
    attribute vec4 aSeed;               // the sparkle's own seed

    uniform mat4 matrix_model;
    uniform mat4 matrix_view;
    uniform mat4 matrix_viewProjection;
    uniform vec4 uTrail;                // x: how much trails show (0..1), y: length (seconds of path), z: orbit speed, w: climb speed
    ${ORBIT}

    varying vec3 vColor;
    varying float vAlpha;
    varying float vSide;

    // where the sparkle was 'back' seconds ago
    vec3 pastPoint(float back, out float climb) {
        float dir = aPosition.z;
        climb = orbitClimb(aSeed) - back * uTrail.w * (0.85 + 0.3 * aSeed.y);   // not wrapped: below the floor it fades out
        float angle = orbitAngle(aSeed, dir) - dir * back * uTrail.z * (0.8 + 0.4 * aSeed.y);
        return (matrix_model * vec4(orbit(aSeed, angle, climb), 1.0)).xyz;
    }

    void main(void) {
        float s = aPosition.x;
        float climb, climbNext;
        vec3 p = pastPoint(s * uTrail.y, climb);
        vec3 q = pastPoint(s * uTrail.y + 0.01, climbNext);
        vec3 toCamera = vec3(matrix_view[0][2], matrix_view[1][2], matrix_view[2][2]);
        vec3 side = normalize(cross(q - p, toCamera));                  // across the ribbon, facing the camera

        float fade = 1.0 - s;                                           // thins and fades toward the tail
        float show = uTrail.x * revealed(aSeed);
        gl_Position = matrix_viewProjection * vec4(p + side * aPosition.y * uShape.z * 0.3 * fade, 1.0);
        if (show < 0.002) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);      // the whole trail at once, never a single vertex

        vAlpha = show * sin(clamp(climb, 0.0, 1.0) * 3.14159) * fade * fade * (0.6 + 0.4 * uAura.w);
        vSide = aPosition.y;
        vColor = tint(aSeed);
    }
`;const TRAIL_FS=`
    varying vec3 vColor;
    varying float vAlpha;
    varying float vSide;

    void main(void) {
        float a = vAlpha * (1.0 - vSide * vSide);                       // soft edges across the line
        if (a < 0.003) discard;
        gl_FragColor = vec4(vColor * a + vec3(0.2 * a), 0.6 * a);
    }
`;const TRAIL_SEGMENTS=12;const smoothstep=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};class ComboAura extends Script{initialize(){this.combo=0;this.amount=0;this.time=0;this.spin=0;this.climb=0;this.flareAge=99;this._aura=new Float32Array(4);this._motion=new Float32Array(2);this._shape=new Float32Array(3);this._low=new Float32Array(3);this._high=new Float32Array(3);this._trail=new Float32Array(4);this.material=this._material("ComboAura",SPARKLE_VS,SPARKLE_FS);this.trailMaterial=this._material("ComboAuraTrail",TRAIL_VS,TRAIL_FS);const n=this.maxParticles;this.seeds=Array.from({length:n},(_,i)=>({seed:[Math.random()*Math.PI*2,Math.random(),Math.random(),i/n],dir:i/n>.55&&i%2?-1:1}));this.node=new Entity("ComboAura");this.sparkles=new MeshInstance(this._sparkleMesh(),this.material,this.node);this.trails=new MeshInstance(this._trailMesh(),this.trailMaterial,this.node);for(const mi of [this.sparkles,this.trails])mi.cull=false;this.node.addComponent("render",{meshInstances:[this.trails,this.sparkles],castShadows:false,receiveShadows:false});this.node.enabled=false;this.app.root.addChild(this.node);this._onJudge=e=>{if((e.combo??0)>this.combo)this.flareAge=0;this.combo=e.combo??0;};this.app.on("rhythm:judge",this._onJudge);this.on("destroy",()=>{this.app.off("rhythm:judge",this._onJudge);this.node.destroy();});}_material(name,vs,fs){const m=new ShaderMaterial({uniqueName:name,vertexGLSL:vs,fragmentGLSL:fs,attributes:{aPosition:SEMANTIC_POSITION,aSeed:SEMANTIC_TEXCOORD0}});m.blendType=BLEND_PREMULTIPLIED;m.depthWrite=false;m.cull=CULLFACE_NONE;m.update();return m}_mesh(positions,seeds,indices){const mesh=new Mesh(this.app.graphicsDevice);mesh.setPositions(positions,3);mesh.setVertexStream(SEMANTIC_TEXCOORD0,seeds,4);mesh.setIndices(indices);mesh.update(PRIMITIVE_TRIANGLES);return mesh}_sparkleMesh(){const n=this.seeds.length;const corners=new Float32Array(n*12);const seeds=new Float32Array(n*16);const indices=new Uint16Array(n*6);const quad=[[-1,-1],[1,-1],[1,1],[-1,1]];this.seeds.forEach(({seed,dir},i)=>{for(let k=0;k<4;k++){corners.set([quad[k][0],quad[k][1],dir],(i*4+k)*3);seeds.set(seed,(i*4+k)*4);}indices.set([i*4,i*4+1,i*4+2,i*4,i*4+2,i*4+3],i*6);});return this._mesh(corners,seeds,indices)}_trailMesh(){const owners=this.seeds.filter((_,i)=>i%2===0);const rows=TRAIL_SEGMENTS+1,perTrail=rows*2;const verts=new Float32Array(owners.length*perTrail*3);const seeds=new Float32Array(owners.length*perTrail*4);const indices=new Uint16Array(owners.length*TRAIL_SEGMENTS*6);let ii=0;owners.forEach(({seed,dir},t)=>{const base=t*perTrail;for(let r=0;r<rows;r++){for(let side=0;side<2;side++){const v=base+r*2+side;verts.set([r/TRAIL_SEGMENTS,side?1:-1,dir],v*3);seeds.set(seed,v*4);}if(r<TRAIL_SEGMENTS){const a=base+r*2;indices.set([a,a+1,a+3,a,a+3,a+2],ii);ii+=6;}}});return this._mesh(verts,seeds,indices)}_lead(){if(!this.lead?.script?.danceDirector){this.lead=this.app.root.find(e=>!!e.script?.danceDirector).sort((a,b)=>b.getPosition().z-a.getPosition().z||Math.abs(a.getPosition().x)-Math.abs(b.getPosition().x))[0]??null;}return this.lead}_level(combo){return combo>0?Math.min(1,.12+.88*(combo-1)/Math.max(1,this.fullCombo-1)):0}update(dt){this._rhythm??(this._rhythm=this.app.root.find(e=>!!e.script?.rhythmGame)[0]?.script.rhythmGame??null);if(this._rhythm&&!this._rhythm.enabled||this.suppressed)this.combo=0;const want=this._level(this.combo);this.amount+=(want-this.amount)*(1-Math.exp(-dt*(want>this.amount?2.5:4)));const visible=this.amount>.003;if(this.node.enabled!==visible)this.node.enabled=visible;if(!visible)return;const lead=this._lead();if(lead)this.node.setPosition(lead.getPosition());const energy=this.amount*this.amount*(3-2*this.amount);const spinRate=.7+2.3*energy;const climbRate=.08+.27*energy;this.time+=dt;this.spin+=dt*spinRate;this.climb=(this.climb+dt*climbRate)%1;this.flareAge+=dt;const flare=this.flareAge<.04?this.flareAge/.04:Math.exp(-(this.flareAge-.04)*4);const trail=smoothstep(this._level(this.trailCombo)-.04,this._level(this.fullCombo-2),this.amount);this.trails.visible=trail>.002;this._aura[0]=this.time;this._aura[1]=this.amount;this._aura[2]=energy;this._aura[3]=flare;this._motion[0]=this.spin;this._motion[1]=this.climb;this._shape[0]=this.radius;this._shape[1]=this.height;this._shape[2]=this.size;const lo=this.colorLow,hi=this.colorHigh;this._low[0]=lo.r;this._low[1]=lo.g;this._low[2]=lo.b;this._high[0]=hi.r;this._high[1]=hi.g;this._high[2]=hi.b;this._trail[0]=trail;this._trail[1]=.1+.2*trail;this._trail[2]=spinRate;this._trail[3]=climbRate;for(const m of [this.material,this.trailMaterial]){m.setParameter("uAura",this._aura);m.setParameter("uMotion",this._motion);m.setParameter("uShape",this._shape);m.setParameter("uColorLow",this._low);m.setParameter("uColorHigh",this._high);}this.trailMaterial.setParameter("uTrail",this._trail);}constructor(...args){super(...args),_define_property(this,"fullCombo",12),_define_property(this,"radius",.3),_define_property(this,"height",1.7),_define_property(this,"size",.05),_define_property(this,"colorLow",new Color(1,.42,.78)),_define_property(this,"colorHigh",new Color(1,.78,.3)),_define_property(this,"maxParticles",150),_define_property(this,"trailCombo",6);}}_define_property(ComboAura,"scriptName","comboAura");

export { ComboAura };
