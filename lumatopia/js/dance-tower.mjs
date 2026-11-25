import { S as Script, V as Vec3, Q as Quat, l as Mat4 } from './index.mjs';
import { SKIN, rewardItemIcon, tr, spriteAsset } from './ui-skin.mjs';
import { floorCount, floorOf, validItem, GRADES } from './tower-rules.mjs';

function _define_property(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true});}else {obj[key]=value;}return obj}const SHOT_MS=700;const TRACK_CAP=50;const RIM="rgba(42, 15, 85, ";const rim=(color,w,drop)=>{const d=Math.round(w*70)/100;return [[0,w],[w,0],[0,-w],[-w,0],[d,d],[-d,d],[d,-d],[-d,-d],[0,drop]].map(([x,y])=>`calc(${x} * var(--u)) calc(${y} * var(--u)) 0 ${color}`).join(", ")};const ease=k=>k*k*(3-2*k);const UP=new Vec3(0,1,0);class DanceTower extends Script{initialize(){this.tower=null;this.isOpen=false;this.armed=false;this.selected=1;this._shot=null;this._goal={show:null,combo:0,misses:0};this._signsOff=false;this._build();const on=(name,fn)=>{this.app.on(name,fn,this);this.on("destroy",()=>this.app.off(name,fn,this));};on("tower:back",this._back);on("rhythm:judge",this._judged);on("net:profile",()=>{if(this.isOpen)this._render();});this._onResize=()=>{if(this.isOpen&&this.tower)requestAnimationFrame(()=>this._layoutTrack(this._reached(),true));};window.addEventListener("resize",this._onResize);this._onKey=e=>this._key(e);window.addEventListener("keydown",this._onKey,true);this.on("destroy",()=>{window.removeEventListener("keydown",this._onKey,true);window.removeEventListener("resize",this._onResize);this.el.remove();this.goalEl.remove();this.styleEl.remove();});}postInitialize(){const root=this.app.root;this.flow=root.find(e=>!!e.script?.gameFlow)[0]?.script.gameFlow??null;this.player=root.find(e=>!!e.script?.playerMove)[0]??null;this.pm=this.player?.script.playerMove??null;this.camera=root.find(e=>!!e.script?.followCamera)[0]??null;this.follow=this.camera?.script.followCamera??null;if(!this.flow||!this.player||!this.door)console.error("[tower] needs the game flow, the player and its door");this.flow?.root.append(this.el,this.goalEl);}update(dt){if(!this.flow||!this.player||!this.door)return;const dancing=!!this.flow.show;if(dancing!==this._signsOff){this._signsOff=dancing;for(const el of this.entity.findComponents("element"))if(el.type==="text")el.entity.enabled=!dancing;}this._tickShot();this._tickGoal();if(this.isOpen){if(this.flow.state!=="tower")this._closed();return}const p=this.player.getPosition(),c=this.door.getPosition();const dx=p.x-c.x,dz=p.z-c.z;const inside=dx*dx+dz*dz<this.radius*this.radius&&Math.abs(p.y-c.y)<3;if(!inside){this.armed=true;return}if(this.armed&&this.flow.state==="hub"&&!window.DanceTravel?.busy)this.open();}open(floor=0,fresh=0){if(this.isOpen||!this.flow.openTower())return;this.isOpen=true;this.armed=false;if(this.pm)this.pm.enabled=false;this.el.classList.remove("gf-hidden");this.el.classList.add("tw-loading");this._swing(true);this._load(()=>{if(!this.isOpen)return;this.el.classList.remove("tw-loading");this.selected=floor||Math.min(this._reached()+1,floorCount(this.tower));this._render(fresh);this._select(this.selected,true);});}close(){if(!this.isOpen)return;this.flow.closeTower();this._closed();}_closed(){this.isOpen=false;this.el.classList.add("gf-hidden");if(this.pm)this.pm.enabled=true;this._swing(false);}_load(done){if(this.tower)return done();const asset=this.app.assets.find(this.catalogue,"json");if(!asset){console.error(`[tower] no "${this.catalogue}"`);return}asset.ready(()=>{this.tower=asset.resource;this._buildFloors();done();});this.app.assets.load(asset);}_progress(){return this.flow.profile?.tower??this.flow.net?.profile?.tower??{floor:0,best:{}}}_reached(){return this._progress().floor||0}_buildFloors(){const n=floorCount(this.tower);this.floorEls=[];const rows=[];for(let i=n;i>=1;i--){const b=document.createElement("button");b.className="tw-floor";b.dataset.floor=String(i);b.setAttribute("aria-label",`Floor ${i}`);b.innerHTML='<span class="tw-dot"><img class="tw-dot-bg" alt=""><img class="tw-dot-icon" alt=""></span>'+'<span class="gf-num"></span><img class="tw-floor-mark" alt="">';this._dotIcon(b.querySelector(".tw-dot-icon"),floorOf(this.tower,i));this.flow._setNumber(b.querySelector(".gf-num"),String(i),"w");b.addEventListener("click",()=>this._select(i));this.floorEls[i]=b;rows.push(b);}this.trackEl=document.createElement("div");this.trackEl.className="tw-track";this.trackEl.innerHTML='<i class="tw-track-fill"></i>';this.floorsEl.replaceChildren(this.trackEl,...rows);}_dotIcon(img,floor){const reward=floor?.reward??{};const item=(reward.items??[]).find(validItem);if(item)return this._itemIcon(item,img);img.src=this.flow._sprite(reward.vinyls?SKIN.currency("vinyls"):SKIN.icon("coin"));return img}_itemIcon(item,img=document.createElement("img")){const own=rewardItemIcon(this.app,item);img.src=own||this.flow._sprite(SKIN.rewardIcon(item.kind));img.alt="";img.classList.toggle("tw-own",!!own);return img}_layoutTrack(floor,instant=false){const count=floorCount(this.tower);const bottom=this.floorEls?.[1],top=this.floorEls?.[count];if(!bottom||!top||!bottom.offsetHeight)return;const dot=bottom.querySelector(".tw-dot");const mid=el=>el.offsetTop+el.offsetHeight/2;const y0=mid(top),y1=mid(bottom);const t=this.trackEl;t.style.top=`${y0}px`;t.style.height=`${y1-y0}px`;t.style.left=`${bottom.offsetLeft+dot.offsetLeft+dot.offsetWidth/2}px`;const fill=t.firstElementChild;const to=Math.min(floor,count);fill.style.transition=instant?"none":"";fill.classList.toggle("gf-hidden",to<1);if(to>=1)fill.style.height=`${y1-mid(this.floorEls[to])+dot.offsetWidth/2}px`;}_render(fresh=0){if(!this.tower||!this.floorEls)return;const{best={}}=this._progress();const reached=this._reached();for(let i=1;i<this.floorEls.length;i++){const b=this.floorEls[i];const state=i<=reached?"done":i===reached+1?"next":"locked";b.dataset.state=state;const mark=b.querySelector(".tw-floor-mark");const grade=GRADES[best[i]];mark.src=this.flow._sprite(state==="locked"?SKIN.lock:state==="done"?grade?SKIN.gradeLetter(grade):SKIN.icon("check"):SKIN.icon("paw"));b.querySelector(".tw-dot-bg").src=this.flow._sprite(SKIN.towerDot(state));b.classList.toggle("tw-fresh",i===fresh);}this._card();requestAnimationFrame(()=>{this._layoutTrack(fresh?reached-1:reached,true);if(fresh)setTimeout(()=>this._layoutTrack(this._reached()),450);});}_select(n,instant=false){const count=floorCount(this.tower);if(!count)return;this.selected=Math.max(1,Math.min(count,n));for(let i=1;i<this.floorEls.length;i++)this.floorEls[i].classList.toggle("on",i===this.selected);this.floorEls[this.selected]?.scrollIntoView({block:"center",behavior:instant?"auto":"smooth"});this._card();}_card(){const n=this.selected;const floor=floorOf(this.tower,n);if(!floor)return;const f=this.flow,reached=this._reached();const done=n<=reached,locked=n>reached+1;f._setNumber(this.cardEl.querySelector(".tw-n"),String(n),"w");this.cardEl.querySelector(".tw-next").classList.toggle("gf-hidden",n!==reached+1);this.cardEl.querySelector(".tw-song").replaceChildren(f._titleEl(floor.song));const jacket=this.cardEl.querySelector(".tw-jacket img");const url=f._sprite(`jacket_${floor.song}`);if(url)jacket.src=url;else jacket.removeAttribute("src");const diff=this.cardEl.querySelector(".tw-diff");diff.src=f._sprite(SKIN.tag(floor.difficulty==="hard"?"hard":"easy"));diff.alt=floor.difficulty==="hard"?"HARD":"EASY";const mode=this.cardEl.querySelector(".tw-mode");mode.src=f._sprite(SKIN.caption(floor.mode==="bar"?"arrows":"tap"));mode.alt=floor.mode==="bar"?"ARROWS":"TAP";this.cardEl.querySelector(".tw-goal-line").replaceChildren(...this._goalParts(floor.goal));const reward=this.cardEl.querySelector(".tw-reward");reward.replaceChildren(...this._rewardParts(floor.reward));reward.classList.toggle("tw-taken",done);this.cardEl.querySelector(".tw-taken-mark").classList.toggle("gf-hidden",!done);this.startBtn.classList.toggle("gf-hidden",locked);this.cardEl.querySelector(".tw-locked").classList.toggle("gf-hidden",!locked);f.preview?.want(floor.song);}_goalParts(goal={}){const f=this.flow;const parts=[];const text=(t,vars)=>{const span=document.createElement("span");span.textContent=tr(this.app,t,vars);return span};const dot=()=>parts.length?"· ":"";if(goal.grade){if(tr(this.app,"Grade"))parts.push(text("Grade"));parts.push(f._word(SKIN.gradeLetter(goal.grade),"tw-grade",goal.grade));if(goal.grade!=="S+"&&tr(this.app,"or better"))parts.push(text("or better"));}if(goal.combo)parts.push(text(`${dot()}${tr(this.app,"Combo {n}+",{n:goal.combo})}`));if(Number.isFinite(goal.misses))parts.push(text(`${dot()}${goal.misses?tr(this.app,"{n} misses or fewer",{n:goal.misses}):tr(this.app,"No misses")}`));if(goal.fullCombo)parts.push(text(`${dot()}${tr(this.app,"Full combo")}`));if(!parts.length)parts.push(text("Dance to the end"));return parts}_rewardParts(reward={}){const f=this.flow;const icon=name=>f._word(name);const parts=[];if(reward.money)parts.push(icon(SKIN.icon("coin")),f._numEl(`+${reward.money.toLocaleString("en-US")}`,"c"));if(reward.vinyls)parts.push(icon(SKIN.currency("vinyls")),f._numEl(`+${reward.vinyls}`,"c"));for(const item of reward.items??[]){if(!validItem(item))continue;const chip=document.createElement("span");chip.className="tw-item";const name=document.createElement("span");name.textContent=tr(this.app,item.label??item.id);chip.append(this._itemIcon(item),name);parts.push(chip);}return parts}_start(){const floor=floorOf(this.tower,this.selected);if(!floor||this.selected>this._reached()+1)return;this.flow.playTower({floor:this.selected,song:floor.song,difficulty:floor.difficulty,mode:floor.mode});}_back({floor,result}){if(!this.tower||!this.player)return;const c=this.door.getPosition(),front=this._front();const p=this.player.getPosition();if((p.x-c.x)**2+(p.z-c.z)**2>16){const x=c.x+front.x*this.arriveDistance,z=c.z+front.z*this.arriveDistance;if(this.pm){this.pm.pos.set(x,c.y,z);this.pm.viewY=c.y;}this.player.setPosition(x,c.y,z);this.flow._snapCamera(this.player.getPosition());}const fresh=result?.first?Math.min(result.floor+1,floorCount(this.tower)):0;this.open(fresh||floor,fresh);}_front(){const c=this.door.getPosition(),m=this.entity.getPosition();const v=new Vec3(c.x-m.x,0,c.z-m.z);return v.lengthSq()>1e-6?v.normalize():new Vec3(0,0,1)}_swing(on){if(!this.camera||!this.follow)return;const from=this.camera.getPosition().clone(),fromRot=this.camera.getRotation().clone();let to,toRot;if(on){this.follow.enabled=false;const box=this._bounds();const c=box.center,h=box.halfExtents;const cam=this.camera.camera;const tanV=Math.tan((cam?.fov??45)*Math.PI/360);const aspect=this.app.graphicsDevice.width/Math.max(1,this.app.graphicsDevice.height);const tall=aspect<1;const fit=Math.max(h.y*(tall?2.1:1.15),Math.max(h.x,h.z)*1.4/Math.max(.6,aspect));const d=fit/tanV+Math.max(h.x,h.z);const front=this._front();const view=front.clone().mulScalar(-1);const right=new Vec3().cross(view,UP).normalize();const target=c.clone();if(tall)target.add(UP.clone().mulScalar(.45*d*tanV)).add(right.clone().mulScalar(-0.32*d*tanV*aspect));else target.add(right.clone().mulScalar(.42*d*tanV*aspect));to=target.clone().add(front.clone().mulScalar(d)).add(UP.clone().mulScalar(h.y*.12));toRot=new Quat().setFromMat4(new Mat4().setLookAt(to,target,UP));}else {if(!this._shot&&this.follow.enabled)return;const p=this.player.getPosition();to=new Vec3(p.x+this.follow.offset.x,p.y+this.follow.offset.y,p.z+this.follow.offset.z);toRot=this.follow.rotation.clone();}this._shot={on,from,fromRot,to,toRot,start:performance.now()};}_tickShot(){const s=this._shot;if(!s)return;const k=ease(Math.min(1,(performance.now()-s.start)/SHOT_MS));this.camera.setPosition(new Vec3().lerp(s.from,s.to,k));this.camera.setRotation(new Quat().slerp(s.fromRot,s.toRot,k));if(k<1)return;this._shot=null;if(!s.on&&["hub","queue","tower"].includes(this.flow.state))this.follow.enabled=true;}_bounds(){let box=null;for(const r of this.entity.findComponents("render")){for(const mi of r.meshInstances??[]){if(!box)box=mi.aabb.clone();else box.add(mi.aabb);}}if(!box){const p=this.entity.getPosition();return {center:new Vec3(p.x,p.y+5,p.z),halfExtents:new Vec3(2,5,2)}}return box}_judged(e){const g=this._goal;if(g.show!==this.flow?.show)return;g.combo=Math.max(g.combo,e.combo??0);if(e.grade==="MISS")g.misses++;g.dirty=true;}_tickGoal(){const show=this.flow.show;const on=!!show?.tower&&(this.flow.state==="show"||this.flow.state==="paused")&&!!this.tower;this.goalEl.classList.toggle("gf-hidden",!on);if(!on)return;const g=this._goal;if(g.show!==show){Object.assign(g,{show,combo:0,misses:0,dirty:true});const goal=floorOf(this.tower,show.tower)?.goal??{};this.goalEl.querySelector(".tw-goal-line").replaceChildren(...this._goalParts(goal));g.goal=goal;}if(!g.dirty)return;g.dirty=false;const live=[];if(g.goal.combo)live.push(`${Math.min(g.combo,g.goal.combo)}/${g.goal.combo}`);if(Number.isFinite(g.goal.misses))live.push(`${g.misses}/${g.goal.misses}`);const liveEl=this.goalEl.querySelector(".tw-goal-live");liveEl.textContent=live.join("  ");liveEl.classList.toggle("gf-hidden",!live.length);const missed=Number.isFinite(g.goal.misses)&&g.misses>g.goal.misses;const reached=!missed&&!!g.goal.combo&&g.combo>=g.goal.combo;this.goalEl.classList.toggle("tw-missed",missed);this.goalEl.classList.toggle("tw-reached",reached);}_key(e){if(!this.isOpen||this.flow?.state!=="tower")return;const k=e.code;if(k==="ArrowUp"||k==="ArrowDown")this._select(this.selected+(k==="ArrowUp"?1:-1));else if(k==="Enter"||k==="Space"){if(!e.repeat)this._start();}else if(k==="Escape"||k==="Backspace")this.close();else return;e.preventDefault();e.stopImmediatePropagation();}_build(){this.styleEl=document.createElement("style");this.styleEl.textContent=CSS;document.head.appendChild(this.styleEl);const s=name=>spriteAsset(this.app,name)?.getFileUrl()??"";const img=(name,cls="",alt="")=>`<img class="${cls}" alt="${alt}" loading="lazy" src="${s(name)}">`;this.el=document.createElement("div");this.el.className="tw-root gf-hidden";this.el.style.setProperty("--s-track",`url("${s(SKIN.towerTrack(false))}")`);this.el.style.setProperty("--s-track-fill",`url("${s(SKIN.towerTrack(true))}")`);this.el.innerHTML=`
            <div class="tw-head">
                <button class="gf-sprite tw-back" aria-label="Back">${img(SKIN.back)}</button>
                ${img(SKIN.label("vinyltower"),"tw-title","Vinyl Tower")}
            </div>
            <div class="tw-panel">
                <div class="tw-floors" role="listbox" aria-label="Floors"></div>
                <div class="tw-card">
                    <div class="tw-floor-head">${img(SKIN.label("floor"),"tw-lbl","Floor")}<span class="gf-num tw-n"></span>
                        ${img(SKIN.label("nextfloor"),"tw-next gf-hidden","Next floor")}</div>
                    <div class="tw-songrow">
                        <span class="tw-jacket"><img alt=""></span>
                        <span class="tw-songbox"><span class="tw-song"></span>
                            <span class="tw-tags"><img class="tw-diff" alt=""><img class="tw-mode" alt=""></span></span>
                    </div>
                    ${img(SKIN.label("goal"),"tw-lbl","Goal")}
                    <div class="tw-goal-line"></div>
                    <div class="tw-reward-head">${img(SKIN.label("rewards"),"tw-lbl","Rewards")}${img(SKIN.icon("check"),"tw-taken-mark gf-hidden","Claimed")}</div>
                    <div class="tw-reward"></div>
                    <button class="gf-sprite tw-start" aria-label="Start">${img(SKIN.start)}</button>
                    ${img(SKIN.label("locked"),"tw-locked gf-hidden","Locked")}
                </div>
            </div>`;this.goalEl=document.createElement("div");this.goalEl.className="tw-goal gf-hidden";this.goalEl.innerHTML=`${img(SKIN.label("goal"),"tw-lbl","Goal")}<span class="tw-goal-line"></span><span class="tw-goal-live gf-hidden"></span>`;const q=sel=>this.el.querySelector(sel);this.floorsEl=q(".tw-floors");this.cardEl=q(".tw-card");this.startBtn=q(".tw-start");q(".tw-back").addEventListener("click",()=>this.close());this.startBtn.addEventListener("click",()=>this._start());this.el.addEventListener("pointerdown",e=>{if(e.target!==this.el)e.stopPropagation();});this.el.addEventListener("wheel",e=>e.stopPropagation());}constructor(...args){super(...args),_define_property(this,"door",null),_define_property(this,"radius",1.4),_define_property(this,"arriveDistance",2.2),_define_property(this,"catalogue","tower.json");}}_define_property(DanceTower,"scriptName","danceTower");const INK=rim("#2a0f55",1.6,2.5);const INK_SMALL=rim("#2a0f55",1.2,1.8);const CSS=`
.tw-root { position: absolute; inset: 0; pointer-events: none; }
.tw-root::before { content: ''; position: absolute; top: 0; bottom: 0; right: 0; width: calc(700 * var(--u)); pointer-events: none;
  background: linear-gradient(to left, ${RIM}.84) 0%, ${RIM}.7) 45%, ${RIM}.3) 76%, ${RIM}0) 100%); }
.tw-root.tw-loading .tw-panel { visibility: hidden; }
/* (--pill: Poki's button in the top left corner on phones - the game flow's) */
.tw-head { position: absolute; top: max(calc(16 * var(--u)), env(safe-area-inset-top));
  left: max(calc(18 * var(--u)), env(safe-area-inset-left), var(--pill, 0px));
  display: flex; align-items: center; gap: calc(12 * var(--u)); animation: gf-drop .4s cubic-bezier(.34, 1.56, .64, 1); }
.tw-back { flex: none; width: calc(70 * var(--u)); pointer-events: auto; }
.gf-root .tw-title { height: calc(62 * var(--u)); width: auto; filter: drop-shadow(0 calc(3 * var(--u)) calc(4 * var(--u)) rgba(42, 15, 85, .35)); }
.tw-panel { position: absolute; top: 0; bottom: 0; right: max(calc(30 * var(--u)), env(safe-area-inset-right)); display: flex; align-items: center;
  gap: calc(18 * var(--u)); pointer-events: none; animation: gf-slide .45s cubic-bezier(.34, 1.56, .64, 1); }
.tw-floors { position: relative; pointer-events: auto; height: min(calc(560 * var(--u)), 86vh); width: calc(150 * var(--u)); overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: calc(4 * var(--u)); padding: calc(40 * var(--u)) calc(6 * var(--u));
  scrollbar-width: none; mask-image: linear-gradient(to bottom, transparent, #000 12%, #000 88%, transparent); }
.tw-floors::-webkit-scrollbar { display: none; }
/* a row: dot | number | mark, in fixed columns (two digits never push the mark out) */
.tw-floor { position: relative; flex: none; display: grid; grid-template-columns: calc(50 * var(--u)) calc(40 * var(--u)) calc(28 * var(--u));
  align-items: center; column-gap: calc(6 * var(--u)); height: calc(58 * var(--u));
  padding: 0 calc(6 * var(--u)); border-radius: calc(27 * var(--u)); font-size: calc(24 * var(--u)); transition: scale .15s, background .15s; }
.tw-floor:hover { scale: 1.05; }
.tw-floor.on { background: rgba(255, 90, 184, .35); box-shadow: 0 0 0 calc(3 * var(--u)) #fff inset; }
.tw-dot { position: relative; width: calc(50 * var(--u)); height: calc(50 * var(--u)); }
.gf-root .tw-dot-bg { position: absolute; inset: 0; width: 100%; height: 100%; }
.gf-root .tw-dot-icon { position: absolute; left: 21%; top: 21%; width: 58%; height: 58%; object-fit: contain; }
.tw-floor .gf-num { justify-self: start; }
.gf-root .tw-floor-mark { width: calc(28 * var(--u)); height: calc(28 * var(--u)); object-fit: contain; }
.tw-floor[data-state="locked"] .tw-dot-icon { filter: grayscale(.7) brightness(.85); opacity: .75; }
.tw-floor[data-state="locked"] .gf-num { opacity: .6; }
.tw-floor[data-state="next"] .tw-dot { animation: gf-pulse 1.2s ease-in-out infinite; }
/* the track up the dots (3-slice, stretched between its round ends) and its fill, from the bottom up to her floor */
.tw-track { position: absolute; width: calc(16 * var(--u)); translate: -50% 0; pointer-events: none;
  border-image: var(--s-track) ${TRACK_CAP} 0 fill / calc(8 * var(--u)) 0 / 0 stretch; }
.tw-track-fill { position: absolute; left: 0; right: 0; bottom: 0; transition: height .9s cubic-bezier(.34, 1.25, .64, 1);
  border-image: var(--s-track-fill) ${TRACK_CAP} 0 fill / calc(8 * var(--u)) 0 / 0 stretch; }
.tw-floor.tw-fresh { animation: tw-fresh 1s .35s cubic-bezier(.34, 1.56, .64, 1) backwards; }
@keyframes tw-fresh { 0% { scale: .3; opacity: 0; filter: brightness(2.2); } 60% { scale: 1.2; opacity: 1; } 100% { scale: 1; filter: none; } }
.tw-card { pointer-events: auto; width: calc(360 * var(--u)); display: flex; flex-direction: column; align-items: flex-start; gap: calc(10 * var(--u));
  text-shadow: ${INK}; }
.tw-floor-head { display: flex; align-items: center; gap: calc(10 * var(--u)); font-size: calc(44 * var(--u)); }
.gf-root .tw-lbl { height: calc(26 * var(--u)); width: auto; }
.tw-floor-head .tw-lbl { height: calc(34 * var(--u)); }
.gf-root .tw-next { height: calc(24 * var(--u)); width: auto; margin-left: calc(6 * var(--u)); animation: gf-bob 1.4s ease-in-out infinite; }
.tw-songrow { align-self: stretch; display: flex; align-items: center; gap: calc(12 * var(--u)); margin-bottom: calc(4 * var(--u)); }
.tw-jacket { flex: none; width: calc(72 * var(--u)); height: calc(72 * var(--u)); border-radius: calc(12 * var(--u)); overflow: hidden;
  border: calc(3 * var(--u)) solid #fff; box-shadow: 0 calc(3 * var(--u)) calc(8 * var(--u)) rgba(0, 0, 0, .3); background: #6a4bb8; }
.tw-jacket img { width: 100%; height: 100%; object-fit: cover; }
.tw-songbox { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; gap: calc(8 * var(--u)); }
.tw-song { display: flex; max-width: 100%; font-size: calc(24 * var(--u)); }
.tw-song .gf-title { height: calc(26 * var(--u)); }
.tw-tags { display: flex; align-items: center; gap: calc(8 * var(--u)); }
.gf-root .tw-diff { height: calc(26 * var(--u)); width: auto; }
.gf-root .tw-mode { height: calc(20 * var(--u)); width: auto; }
.tw-goal-line { display: flex; flex-wrap: wrap; align-items: center; gap: calc(6 * var(--u)); font-family: var(--label); font-weight: 900;
  font-size: calc(20 * var(--u)); text-shadow: ${INK_SMALL}; }
.gf-root .tw-grade { height: calc(30 * var(--u)); width: auto; }
.tw-reward-head { display: flex; align-items: center; gap: calc(8 * var(--u)); margin-top: calc(4 * var(--u)); }
.gf-root .tw-taken-mark { height: calc(26 * var(--u)); width: auto; }
.tw-reward { display: flex; flex-wrap: wrap; align-items: center; gap: calc(4 * var(--u)); font-size: calc(24 * var(--u)); }
.tw-reward > img { height: calc(32 * var(--u)); width: auto; }
.tw-reward .gf-num + img, .tw-reward .gf-num + .tw-item, .tw-item + .tw-item { margin-left: calc(8 * var(--u)); }
.tw-reward.tw-taken { opacity: .55; filter: grayscale(.4); }
.tw-item { display: inline-flex; align-items: center; gap: calc(4 * var(--u)); font-family: var(--label); font-weight: 800; font-size: calc(17 * var(--u));
  text-shadow: ${INK_SMALL}; }
.tw-item img { height: calc(34 * var(--u)); width: auto; }
/* an outfit's own wardrobe icon (a sticker with a margin round it): a little bigger than the kind's icons */
.tw-item img.tw-own { height: calc(46 * var(--u)); margin: calc(-6 * var(--u)) 0; }
.gf-root .tw-dot-icon.tw-own { left: 12%; top: 12%; width: 76%; height: 76%; }
.tw-start { align-self: center; width: calc(240 * var(--u)); margin-top: calc(8 * var(--u)); animation: gf-bob 1.6s ease-in-out infinite;
  filter: drop-shadow(0 calc(5 * var(--u)) calc(6 * var(--u)) rgba(42, 15, 85, .35)); }
.gf-root .tw-locked { align-self: center; height: calc(34 * var(--u)); width: auto; margin-top: calc(14 * var(--u)); opacity: .9; }
.tw-goal { position: absolute; top: max(calc(14 * var(--u)), env(safe-area-inset-top)); left: 50%; translate: -50% 0; display: flex; align-items: center;
  gap: calc(10 * var(--u)); white-space: nowrap; isolation: isolate; text-shadow: ${INK}; animation: gf-drop .4s ease-out; }
.tw-goal::before { content: ''; position: absolute; z-index: -1; inset: calc(-26 * var(--u)) calc(-70 * var(--u)); background: var(--s-fade_blob) center / 100% 100% no-repeat; }
.tw-goal .tw-lbl { height: calc(24 * var(--u)); }
.tw-goal .tw-goal-line { font-size: calc(18 * var(--u)); }
.tw-goal .tw-grade { height: calc(26 * var(--u)); }
.tw-goal-live { font-family: var(--label); font-weight: 900; font-size: calc(20 * var(--u)); color: #ffe46b; text-shadow: ${INK_SMALL}; }
.tw-goal.tw-missed .tw-goal-live { color: #ff8aa8; }
.tw-goal.tw-reached .tw-goal-live { color: #8dffc2; }
/* a tall screen (a phone held upright): the floors down the left side under the title, the whole height, the card at the
   top right with START up there (a phone's bars can cover the bottom of the screen: nothing to press there), the
   tower under the card (the camera: _swing), the card tighter. The game's --u is at
   its smallest on a phone (a 1280 x 720 design), so the tower takes its own: the floors and the card (470 design
   pixels across with the margins) as wide as the screen */
@media (max-aspect-ratio: 1/1) {
  .tw-root { --u: min(calc((100vw - 28px) / 470), calc(100vh / 1000)); }
  .tw-root::before { width: 100%; background:
    linear-gradient(to bottom, ${RIM}.86), ${RIM}.7) 70%, ${RIM}0)) right top / 100% 52% no-repeat,
    linear-gradient(to right, ${RIM}.8), ${RIM}.55) 70%, ${RIM}0)) left top / 46% 100% no-repeat; }
  .tw-panel { top: calc(max(calc(16 * var(--u)), env(safe-area-inset-top)) + 86 * var(--u));
    bottom: max(calc(16 * var(--u)), env(safe-area-inset-bottom)); left: 0; right: 0;
    justify-content: center; align-items: stretch; gap: calc(10 * var(--u)); }
  .tw-floors { height: auto; width: calc(150 * var(--u)); padding: calc(28 * var(--u)) calc(4 * var(--u)); }
  .tw-floor { height: calc(54 * var(--u)); }
  .tw-card { align-self: flex-start; width: min(calc(310 * var(--u)), calc(100vw - 190 * var(--u))); gap: calc(7 * var(--u)); }
  .tw-floor-head { font-size: calc(38 * var(--u)); }
  .tw-floor-head .tw-lbl { height: calc(30 * var(--u)); }
  .tw-jacket { width: calc(60 * var(--u)); height: calc(60 * var(--u)); }
  .tw-start { width: calc(210 * var(--u)); margin-top: calc(4 * var(--u)); }
  .gf-root .tw-title { height: calc(52 * var(--u)); }
}
`;

export { DanceTower };
