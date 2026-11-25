import { SKIN } from './ui-skin.mjs';

const SPRING="cubic-bezier(.34, 1.56, .64, 1)";const NOTE_BODY=SKIN.note;const NOTE_TURN={up:0,right:90,down:180,left:-90};const GLYPHS={p:SKIN.digits,w:SKIN.digits};const DPAD=["up","left","right","down"];const TAP_NOTE=116;const TAP_RING_FROM=2.8;const TAP_RING_COLORS=["#ff5ab8","#fec314","#30bcfe","#9651fc"];const TAP_REACH=1.35;const TAP_FACE_R=.46;const TAP_MISS_SHAKE=2;const GRADE_KEY=SKIN.gradeKey;const PINS=[["C",.5,20],["B",.7,40],["A",.85,60],["S",.95,80],["S+",1,100]];const GRADE_FX={PERFECT:{word:SKIN.word("perfect"),count:20,size:[24,48],kinds:["dt_fx_heart","dt_fx_star","dt_fx_sparkle","dt_fx_note","dt_fx_sparkle","dt_fx_paw"],flash:.55,shake:7},GREAT:{word:SKIN.word("great"),count:13,size:[20,40],kinds:["dt_fx_star","dt_fx_sparkle","dt_fx_dot","dt_fx_heart"],flash:.3,shake:4},COOL:{word:SKIN.word("cool"),count:7,size:[18,32],kinds:["dt_fx_sparkle","dt_fx_dot","dt_fx_star"],flash:0,shake:0},BAD:{word:SKIN.word("bad"),count:0,kinds:[],flash:0,shake:5,fail:true},MISS:{word:SKIN.word("miss"),count:0,kinds:[],flash:0,shake:6,fail:true}};const SPRITES=[SKIN.songChip,SKIN.marker,SKIN.rail,SKIN.railTrail,SKIN.targetRing,SKIN.barTrack,SKIN.barFill,SKIN.tick,SKIN.levelTag,SKIN.portrait,SKIN.caption("lv"),SKIN.caption("you"),SKIN.fade("corner"),SKIN.fade("white"),SKIN.fade("blob"),...Object.values(NOTE_BODY),SKIN.notePressed,SKIN.noteMissed,SKIN.noteArrow,SKIN.noteRing,SKIN.beat,SKIN.icon("paw"),...DPAD.map(d=>SKIN.pad(d)),...["perfect","great","cool","bad","miss","combo","ready","go"].map(w=>SKIN.word(w)),...new Set(Object.values(SKIN.digits)),...Object.keys(GRADE_KEY).map(g=>SKIN.badge(g)),...PINS.map(([g])=>SKIN.pin(g)),...[1,2,3,4,5,6].map(n=>SKIN.rank(n)),"dt_fx_sparkle","dt_fx_star","dt_fx_heart","dt_fx_note","dt_fx_paw","dt_fx_orb","dt_fx_ring","dt_fx_dot","avatar_you"];const rand=(a,b)=>a+Math.random()*(b-a);const pick=list=>list[Math.floor(Math.random()*list.length)];const rim=(color,w,drop)=>{const d=Math.round(w*70)/100;return [[0,w],[w,0],[0,-w],[-w,0],[d,d],[-d,d],[d,-d],[-d,-d],[0,drop]].map(([x,y])=>`calc(${x} * var(--u)) calc(${y} * var(--u)) 0 ${color}`).join(", ")};function gaugeAt(accuracy){let prev=[null,0,0];for(const pin of PINS){if(accuracy<=pin[1])return prev[2]+(pin[2]-prev[2])*(accuracy-prev[1])/(pin[1]-prev[1]);prev=pin;}return 100}class RhythmHud{preload(){return Promise.all(SPRITES.map(name=>{const url=this.sprite(name);if(!url)return null;const img=new Image;img.src=url;return img.decode().then(()=>{this.sizes[name]=[img.naturalWidth,img.naturalHeight];},()=>{})})).then(()=>{this._setNumber(this.scoreEl,"0");this.root.classList.remove("rg-loading");})}destroy(){window.removeEventListener("resize",this._onResize);this.root.remove();this.styleEl.remove();}show(visible){this.root.classList.toggle("rg-hidden",!visible);}reset(){this.scoreShown=this.scoreFrom=this.scoreTo=0;this._setNumber(this.scoreEl,"0");this._timeShown=null;this.level=-1;this._clearNotes();this.tapEl.replaceChildren();this.wordEl.getAnimations().forEach(a=>a.cancel());this.comboEl.getAnimations().forEach(a=>a.cancel());this.target.classList.remove("ready","hit");this.setGrade(null);}setSong(title){const name=SKIN.title(title.trim().replace(/\s+/g,"_"));const url=this.sprite(name);if(url){const img=document.createElement("img");img.alt=title;img.src=url;this.songTitle.replaceChildren(img);}else {this.songTitle.textContent=title;}}setGrade(r){const graded=!!r&&r.rounds>0;this.gradeBadge.classList.toggle("rg-off",!graded);const at=graded?gaugeAt(r.accuracy):0;this.gaugeFill.style.setProperty("--p",at/100);for(const pin of this.pinEls)pin.classList.toggle("on",graded&&at>=pin._at-.01);if(!graded||r.grade===this._grade)return;this._grade=r.grade;this.gradeBadge.src=this.sprite(SKIN.badge(r.grade));this._anim(this.gradeBadge,[{transform:"scale(1)"},{transform:"scale(1.25) rotate(-6deg)",offset:.35},{transform:"scale(1)"}],{duration:480,easing:SPRING});}frame(now,{songT,duration,ballX,beatInRound,hideBall}){if(duration){const p=Math.min(1,Math.max(0,songT/duration));this.songFill.style.setProperty("--p",p);this.songPaw.style.left=`${p*100}%`;const left=Math.max(0,Math.ceil(duration-songT));if(left!==this._timeShown){this._timeShown=left;this._setNumber(this.songTime,`${String(Math.floor(left/60)).padStart(2,"0")}:${String(left%60).padStart(2,"0")}`,"w");}}if(ballX!==undefined){this.ball.style.left=`${ballX*100}%`;this.barFill.style.width=`${ballX*100}%`;this.ball.style.opacity=hideBall?"0":"1";for(let i=0;i<this.ticks.length;i++)this.ticks[i].classList.toggle("passed",beatInRound>=i);}if(this.scoreShown!==this.scoreTo){const k=Math.min(1,Math.max(0,(now-this.scoreStart)/600));const v=Math.round(this.scoreFrom+(this.scoreTo-this.scoreFrom)*(1-(1-k)**3));if(v!==this.scoreShown){this.scoreShown=v;this._setNumber(this.scoreEl,v.toLocaleString("en-US"));}}}beat(n,downbeat){const lift=downbeat?-9:-5;this.notes.forEach((note,i)=>this._anim(note.el,[{transform:"translateY(0)"},{transform:`translateY(${lift}%)`,offset:.3},{transform:"translateY(0)"}],{duration:260,delay:i*22,easing:"ease-out"}));this._anim(this.songPaw,[{transform:"translateY(-50%) scale(1)"},{transform:"translateY(-75%) scale(1.15)",offset:.3},{transform:"translateY(-50%) scale(1)"}],{duration:240});this._anim(this.levelEl,[{transform:"scale(1)"},{transform:`scale(${downbeat?1.1:1.05})`,offset:.3},{transform:"scale(1)"}],{duration:240});const ready=this.target.classList.contains("ready");this._anim(this.target,[{scale:"1 1"},{scale:ready?"1.05 1.3":"1.03 1.15",offset:.25},{scale:"1 1"}],{duration:300});this._anim(this.targetRing,[{scale:1},{scale:ready?1.2:1.1,offset:.25},{scale:1}],{duration:300});if(downbeat){this._anim(this.laneShine,[{opacity:0},{opacity:.7,offset:.15},{opacity:0}],{duration:380});this._anim(this.beatBtn.firstElementChild,[{transform:"scale(1)"},{transform:"scale(1.06)",offset:.3},{transform:"scale(1)"}],{duration:300});this._anim(this.scoreEl,[{transform:"scale(1)"},{transform:"scale(1.05)",offset:.3},{transform:"scale(1)"}],{duration:260});}}countIn(beatsLeft){this._clearNotes();if(beatsLeft===4)this._popCount(this._wordImg(SKIN.word("ready"),74));else if(beatsLeft>=1&&beatsLeft<=3){const el=document.createElement("div");el.className="rg-num";this._setNumber(el,String(beatsLeft),"p");el.style.fontSize=`calc(92 * var(--u))`;this._popCount(el);}}newRound({arrows,level,windowPct,stops,first,tickPhase=0}){this._clearNotes();this.target.classList.remove("ready","hit");this.target.style.width=`${windowPct}%`;if(stops)for(const[k,v]of Object.entries(stops))this.target.style.setProperty(`--${k}`,`${v}%`);this._setNumber(this.levelNum,String(level+1),"w");if(level!==this.level){if(this.level>=0){this._anim(this.levelEl,[{transform:"scale(1)"},{transform:"scale(1.5) rotate(-8deg)",offset:.35},{transform:"scale(1)"}],{duration:600,easing:SPRING});this._burstAt(this.levelEl,{count:8,kinds:["dt_fx_sparkle","dt_fx_star"],speed:[120,260],size:[14,26]});}this.level=level;}this.notes=arrows.map((dir,i)=>{const el=document.createElement("div");el.className="rg-note";el.dataset.dir=dir;el.innerHTML='<div class="rg-note-in"><img class="rg-note-ring" alt=""><img class="rg-note-body" alt=""><img class="rg-note-arrow" alt=""></div>';const inner=el.firstChild;const[ring,body,arrow]=inner.children;ring.src=this.sprite(SKIN.noteRing);body.src=this.sprite(NOTE_BODY[dir]);arrow.src=this.sprite(SKIN.noteArrow);arrow.style.rotate=`${NOTE_TURN[dir]}deg`;this.arrowsEl.appendChild(el);this._anim(inner,[{transform:"translateY(40%) scale(0) rotate(-25deg)",opacity:0},{transform:"translateY(-12%) scale(1.22) rotate(6deg)",opacity:1,offset:.55},{transform:"translateY(0) scale(.94) rotate(-2deg)",offset:.78},{transform:"translateY(0) scale(1) rotate(0)"}],{duration:420,delay:i*45,easing:"ease-out",fill:"backwards"});return {el,inner,body,dir}});this._markNext();const beats=this.beatsPerRound;this.ticksEl.innerHTML="";this.ticks=Array.from({length:beats},(_,i)=>{const t=document.createElement("img");t.alt="";t.src=this.sprite(SKIN.tick);t.className="rg-tick"+((i+tickPhase)%4===0?" rg-tick-down":"");t.style.left=`${i/(beats-1)*this.targetAt*100}%`;this.ticksEl.appendChild(t);return t});if(first)this._popCount(this._wordImg(SKIN.word("go"),92),true);}arrowOk(i){const n=this.notes[i];if(!n)return;n.el.classList.add("done");n.body.src=this.sprite(SKIN.notePressed);this._anim(n.inner,[{transform:"scale(1)"},{transform:"scale(1.3, .76)",offset:.22},{transform:"scale(.9, 1.14)",offset:.5},{transform:"scale(1.1)"}],{duration:300,easing:"ease-out",fill:"forwards"});this._burstAt(n.el,{count:4,kinds:["dt_fx_sparkle"],speed:[90,190],size:[12,22],life:[380,520],gravity:300});this._markNext();}arrowWrong(){this._anim(this.arrowsEl,[{transform:"translateX(0)"},{transform:"translateX(-4%)"},{transform:"translateX(4%)"},{transform:"translateX(-2.5%)"},{transform:"translateX(2.5%)"},{transform:"translateX(0)"}],{duration:320});for(const n of this.notes){n.el.classList.remove("done");n.body.src=this.sprite(NOTE_BODY[n.dir]);this._anim(n.inner,[{transform:"scale(1.1)",filter:"none"},{transform:"scale(.9)",filter:"grayscale(.8) brightness(.8)",offset:.3},{transform:"scale(1)",filter:"none"}],{duration:360,easing:"ease-out",fill:"forwards"});}this._markNext();}keysComplete(){this.target.classList.add("ready");this._markNext();this.notes.forEach((n,i)=>this._anim(n.el,[{transform:"translateY(0)"},{transform:"translateY(-26%)",offset:.4},{transform:"translateY(0)"}],{duration:340,delay:i*40,easing:"ease-out"}));this._anim(this.laneShine,[{opacity:0},{opacity:1,offset:.2},{opacity:0}],{duration:520});this._burstAt(this.target,{count:6,kinds:["dt_fx_sparkle"],speed:[80,160],size:[12,20],life:[400,600],gravity:200});}targetPop(){this._anim(this.target,[{scale:"1 1"},{scale:"1.06 1.4",offset:.35},{scale:"1 1"}],{duration:320,easing:"ease-out"});this._ringAt(this.target,"dt_fx_ring",40,2.2,380,.6);}beatPressed(){this._press(this.beatBtn);}judge({grade,combo,score,gained,at=null}){const fx=GRADE_FX[grade];this.wordEl.src=this.sprite(fx.word);this.wordEl.style.height=`calc(${this._wordScale(fx.word)*76} * var(--u))`;const word=this._squash({k:fx.fail?1:.6,sink:fx.fail});this._anim(this.wordEl,word.frames,{duration:word.duration,easing:"linear",fill:"forwards"});if(combo>1){this._setNumber(this.comboNum,`x${combo}`);const c=this._squash({k:.75,widen:false,holdMs:240,fadeMs:200});this._anim(this.comboEl,c.frames,{duration:c.duration,delay:80,easing:"linear",fill:"both"});}else {this.comboEl.getAnimations().forEach(a=>a.cancel());}if(fx.fail){if(!at)this._notesFail();}else {if(!at){this.target.classList.add("hit");this._notesClear();}if(at){this._burst(...at,{count:Math.ceil(fx.count/3),kinds:fx.kinds,size:fx.size});}else {const[x,y]=this._center(this.target);this._ringXY(x,y,"dt_fx_ring",46,3.4,520,1);this._ringXY(x,y,"dt_fx_orb",70,1.8,360,.9);this._burst(x,y,{count:fx.count,kinds:fx.kinds,size:fx.size});if(gained)this._floatScore(gained);}if(combo>0&&combo%(at?25:10)===0)this._confetti();}const flash=at?0:fx.flash;const shake=at?grade==="MISS"?TAP_MISS_SHAKE:0:fx.shake;if(flash&&!this.fxOff)this._anim(this.flashEl,[{opacity:0},{opacity:flash,offset:.15},{opacity:0}],{duration:420});if(shake)this._shake(shake);if(score!==this.scoreTo){this.scoreFrom=this.scoreShown;this.scoreTo=score;this.scoreStart=performance.now()+220;this._anim(this.scoreEl,[{transform:"scale(1)"},{transform:"scale(1.18) rotate(-3deg)",offset:.3},{transform:"scale(1)"}],{duration:520,delay:220,easing:SPRING});}}setPlayers(list){this.playersEl.replaceChildren(...list.map((p,i)=>{const n=Math.min(6,i+1);const row=document.createElement("div");row.className="rg-player"+(p.local?" rg-me":"");row.innerHTML='<img class="rg-rank" alt="" loading="lazy"><span class="rg-avatar"><img class="rg-ring" alt="" loading="lazy"><span class="rg-face"></span></span>'+'<span class="rg-pinfo"><span class="rg-pname"></span><span class="rg-num rg-pscore"></span></span>';row.querySelector(".rg-rank").src=this.sprite(SKIN.rank(n));row.querySelector(".rg-ring").src=this.sprite(SKIN.portrait);const pname=row.querySelector(".rg-pname");if(p.local)pname.replaceChildren(Object.assign(document.createElement("img"),{alt:"You",src:this.sprite(SKIN.caption("you"))}));else pname.textContent=p.name??"";this._setNumber(row.querySelector(".rg-pscore"),(p.score??0).toLocaleString("en-US"),p.local?"p":"w");const face=row.querySelector(".rg-face");const url=p.avatar??(p.local?this.sprite("avatar_you"):"");if(url){const img=document.createElement("img");img.loading="lazy";img.src=url;img.alt="";face.appendChild(img);}else {face.textContent=(p.name??"?").charAt(0).toUpperCase();}return row}));}setMode(mode){this.root.classList.toggle("rg-tapmode",mode==="tap");}tapAdd(n){const colours=Object.values(NOTE_BODY);const el=document.createElement("div");el.className="rg-tap-note";el.style.zIndex=String(1e5-n.index);const halo=this.sprite(SKIN.fade("blob"));el.innerHTML=`<img class="rg-tap-halo" alt="" src="${halo}"><img class="rg-tap-halo rg-wide" alt="" src="${halo}">`+`<img class="rg-tap-body" alt="" src="${this.sprite(colours[n.index%colours.length])}">`+`<img class="rg-tap-paw" alt="" src="${this.sprite(SKIN.icon("paw"))}">`+`<span class="rg-tap-ring" style="--c: ${TAP_RING_COLORS[n.index%TAP_RING_COLORS.length]}"></span>`;n.el=el;n.ringEl=el.lastChild;this.tapEl.appendChild(el);this._tapPlace(n);this._anim(el,[{scale:"0.3",opacity:0},{scale:"1",opacity:1}],{duration:220,easing:SPRING});}tapRing(n,k){if(!n.el)return;this._tapPlace(n);const d=`${TAP_NOTE*this.u*(1+k*(TAP_RING_FROM-1))}px`;n.ringEl.style.width=n.ringEl.style.height=d;n.ringEl.style.opacity=String(Math.min(1,(1-k)*4));}tapLinks(notes){for(const n of notes){const m=notes[n.index+1];if(!n.el||!m?.el){if(n.linkEl)n.linkEl.remove();n.linkEl=null;if(!n.el&&!n.judged)break;continue}if(!n.linkEl){n.linkEl=document.createElement("span");n.linkEl.className="rg-tap-link";this.tapEl.prepend(n.linkEl);}const dx=m.cx-n.cx,dy=m.cy-n.cy,len=Math.hypot(dx,dy)||1,gap=n.r*1.1;Object.assign(n.linkEl.style,{left:`${n.cx+dx/len*gap}px`,top:`${n.cy+dy/len*gap}px`,width:`${Math.max(0,len-2*gap)}px`,rotate:`${Math.atan2(dy,dx)}rad`});}}tapHit(n){const el=this._tapDone(n);if(!el)return;const a=this._anim(el,[{scale:"1",opacity:1},{scale:"1.12",opacity:0}],{duration:200});a.onfinish=a.oncancel=()=>el.remove();}tapMiss(n){const el=this._tapDone(n);if(!el)return;el.querySelector(".rg-tap-body").src=this.sprite(SKIN.noteMissed);el.querySelector(".rg-tap-ring").style.opacity="0";const a=this._anim(el,[{translate:"-50% -56%",opacity:1},{translate:`-50% calc(-56% + ${40*this.u}px)`,opacity:0}],{duration:420,easing:"ease-in"});a.onfinish=a.oncancel=()=>el.remove();}tapOver(n,x,y){return !!n.el&&Math.hypot(x-n.cx,y-n.cy)<=n.r*TAP_REACH}tapCenter(n){return [n.cx,n.cy]}_tapPlace(n){const a=this._tapArea();n.cx=a.x+n.x*a.w;n.cy=a.y+n.y*a.h;n.r=TAP_NOTE*TAP_FACE_R*this.u;n.el.style.left=`${n.cx}px`;n.el.style.top=`${n.cy}px`;}_tapArea(){const w=window.innerWidth,h=window.innerHeight;if(h>w)return {x:w*.16,y:h*.26,w:w*.68,h:h*.42};return {x:w*.26,y:h*.22,w:w*.48,h:h*.46}}_tapDone(n){const el=n.el;n.el=null;n.linkEl?.remove();n.linkEl=null;return el}pressDir(dir){const btn=this.dpadEls[dir];if(btn&&this.touch)this._press(btn);}_squash({k=1,sink=false,widen=true,holdMs=180,fadeMs=220,speed=1}={}){const f=(ms,y,sx,sy,extra,kk=k)=>({ms:ms*speed,transform:`translateY(${y}%) scale(${1+(sx-1)*kk}, ${1+(sy-1)*kk})`,...extra});const frames=[f(0,40,.3,1.9,{opacity:0,easing:"ease-in"}),f(100,0,1.45,.6,{opacity:1,easing:"ease-out"}),f(195,-6,.82,1.24,{easing:"ease-in-out"}),f(290,0,1.12,.9,{easing:"ease-in-out"}),f(370,0,.96,1.05,{easing:"ease-in-out"}),f(450,0,1,1,{opacity:1}),f(450+holdMs,0,1,1,{opacity:1,easing:widen?"ease-out":"ease-in"})];if(widen){frames.push(f(520+holdMs,-4,.88,1.16,{opacity:1,easing:"linear"}));frames.push(f(520+holdMs+fadeMs,sink?24:-8,2.6,.3,{opacity:0},1));}else {frames.push(f(450+holdMs+fadeMs,sink?20:-14,1,1,{opacity:0}));}const duration=frames[frames.length-1].ms;return {duration,frames:frames.map(({ms,...fr})=>({...fr,offset:ms/duration}))}}_anim(el,frames,opts){return el.animate(frames,{duration:300,easing:"ease-out",...opts})}_center(el){const r=el.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]}_fxImg(name){const img=this.pool.pop()??Object.assign(document.createElement("img"),{alt:""});img.src=this.sprite(name);if(!img.parentNode)this.fxEl.appendChild(img);return img}_release(img,anim){anim.onfinish=anim.oncancel=()=>this.pool.push(img);}setEffects(on){this.fxOff=!on;}_burst(x,y,{count,kinds,speed=[260,560],size=[20,40],life=[600,950],gravity=1100,spread=.85}){if(this.fxOff)return;const u=this.u;for(let i=0;i<count;i++){const img=this._fxImg(pick(kinds));const s=rand(...size)*u;img.style.width=`${s}px`;const ang=-Math.PI/2+rand(-1,1)*Math.PI*spread;const sp=rand(...speed)*u;const vx=Math.cos(ang)*sp,vy=Math.sin(ang)*sp,g=gravity*u;const ms=rand(...life),spin=rand(-360,360),r0=rand(-30,30);const frames=[];for(let k=0;k<=8;k++){const f=k/8,t=f*ms/1e3;const sc=f<.12?f/.12*1.25:f<.25?1.25-(f-.12)/.13*.25:1-Math.max(0,(f-.6)/.4)*.6;frames.push({transform:`translate(${x+vx*t}px, ${y+vy*t+.5*g*t*t}px) translate(-50%, -50%) rotate(${r0+spin*t}deg) scale(${sc})`,opacity:f<.7?1:1-(f-.7)/.3});}this._release(img,img.animate(frames,{duration:ms,easing:"linear"}));}}_burstAt(el,opts){const[x,y]=this._center(el);this._burst(x,y,opts);}_ringAt(el,name,size,grow,ms,alpha){const[x,y]=this._center(el);this._ringXY(x,y,name,size,grow,ms,alpha);}_ringXY(x,y,name,size,grow,ms,alpha){if(this.fxOff)return;const img=this._fxImg(name);img.style.width=`${size*this.u}px`;const at=s=>`translate(${x}px, ${y}px) translate(-50%, -50%) scale(${s})`;this._release(img,img.animate([{transform:at(.3),opacity:alpha},{transform:at(grow),opacity:0}],{duration:ms,easing:"cubic-bezier(.2,.8,.3,1)"}));}_floatScore(gained){const[x,y]=this._center(this.target);const[sx,sy]=this._center(this.scoreEl);const el=document.createElement("div");el.className="rg-num rg-float";this._setNumber(el,`+${gained.toLocaleString("en-US")}`,"w");this.fxEl.appendChild(el);const a=el.animate([{transform:`translate(${x}px, ${y}px) translate(-50%, -50%) scale(.3)`,opacity:0},{transform:`translate(${x}px, ${y-60*this.u}px) translate(-50%, -50%) scale(1.15)`,opacity:1,offset:.25},{transform:`translate(${x}px, ${y-80*this.u}px) translate(-50%, -50%) scale(1)`,opacity:1,offset:.55},{transform:`translate(${sx}px, ${sy}px) translate(-50%, -50%) scale(.5)`,opacity:0}],{duration:950,easing:"cubic-bezier(.4,0,.6,1)"});a.onfinish=a.oncancel=()=>el.remove();}_confetti(){const w=window.innerWidth;for(const x of [w*.15,w*.5,w*.85]){this._burst(x,-20*this.u,{count:10,kinds:["dt_fx_dot","dt_fx_star","dt_fx_heart","dt_fx_sparkle","dt_fx_paw"],speed:[80,300],spread:.5,gravity:700,life:[1400,2e3],size:[16,30]});}}_shake(px){const p=px*this.u;this._anim(this.shakeEl,[{transform:"translate(0, 0)"},{transform:`translate(${-p}px, ${p*.6}px)`},{transform:`translate(${p*.8}px, ${-p*.5}px)`},{transform:`translate(${-p*.5}px, ${p*.3}px)`},{transform:`translate(${p*.3}px, 0)`},{transform:"translate(0, 0)"}],{duration:260,easing:"linear"});}_press(btn){const img=btn.firstElementChild;this._anim(img,[{transform:"scale(1)"},{transform:"scale(.82)",filter:"brightness(1.15)",offset:.3},{transform:"scale(1.06)",offset:.65},{transform:"scale(1)"}],{duration:300,easing:"ease-out"});this._ringAt(btn,"dt_fx_ring",70*this.t/this.u,1.6,360,.8);}_markNext(){const next=this.notes.findIndex(n=>!n.el.classList.contains("done"));this.notes.forEach((n,i)=>n.el.classList.toggle("next",i===next));}_notesClear(){const notes=this.notes;this.notes=[];notes.forEach((n,i)=>{n.el.classList.remove("next");const a=this._anim(n.inner,[{transform:"translateY(0) scale(1.1)",opacity:1},{transform:"translateY(-55%) scale(1.35)",opacity:1,offset:.45},{transform:"translateY(-80%) scale(.2)",opacity:0}],{duration:360,delay:i*30,easing:"ease-in",fill:"forwards"});setTimeout(()=>this._burstAt(n.el,{count:3,kinds:["dt_fx_sparkle","dt_fx_dot"],speed:[80,180],size:[12,22],life:[350,500],gravity:300}),160+i*30);a.onfinish=()=>n.el.remove();});}_notesFail(){const notes=this.notes;this.notes=[];notes.forEach((n,i)=>{n.el.classList.remove("done","next");n.body.src=this.sprite(SKIN.noteMissed);const a=this._anim(n.inner,[{transform:"translateY(0) scale(1) rotate(0)",opacity:1},{transform:"translateY(-10%) scale(.92, 1.05) rotate(0)",opacity:1,offset:.25},{transform:`translateY(90%) scale(.8) rotate(${i%2?18:-18}deg)`,opacity:0}],{duration:520,delay:i*35,easing:"ease-in",fill:"forwards"});a.onfinish=()=>n.el.remove();});}_clearNotes(){for(const n of this.notes)n.el.remove();this.notes=[];this.arrowsEl.replaceChildren();}_popCount(el,big){this.countEl.replaceChildren(el);const s=big?this._squash({holdMs:200}):this._squash({k:.7,holdMs:120,fadeMs:160,speed:.5});this._anim(el,s.frames,{duration:s.duration,easing:"linear",fill:"forwards"});if(big)this._burstAt(el,{count:14,kinds:["dt_fx_star","dt_fx_heart","dt_fx_sparkle","dt_fx_note"]});}_wordScale(name){const h=this.sizes[name]?.[1],ref=this.sizes[SKIN.word("great")]?.[1];return h&&ref?h/ref:1}_wordImg(name,height){const img=document.createElement("img");img.alt="";img.src=this.sprite(name);img.style.height=`calc(${this._wordScale(name)*height} * var(--u))`;return img}_setNumber(el,text,set="p"){if(el._text===set+text)return;el._text=set+text;const glyph=GLYPHS[set];const ref=this.sizes[glyph[0]]?.[1]||1;el.replaceChildren(...[...text].map(ch=>{const name=glyph[ch];const img=document.createElement("img");img.alt=ch;img.loading="lazy";img.src=this.sprite(name);const h=this.sizes[name]?.[1];img.style.height=`${h?h/ref:1}em`;if(ch===",")img.className="g-comma";else if(ch===".")img.className="g-dot";else if(ch==="x"||ch==="+"||ch===":")img.className="g-mid";return img}));}_layout(){const w=window.innerWidth,h=window.innerHeight;this.u=Math.min(1.3,Math.max(.55,Math.min(w/1280,h/720)));this.t=Math.min(1.2,Math.max(.75,Math.min(w,h)/420));this.root.style.setProperty("--u",`${this.u}px`);this.root.style.setProperty("--t",`${this.t}px`);}_build(){this.styleEl=document.createElement("style");this.styleEl.textContent=CSS;document.head.appendChild(this.styleEl);const s=name=>this.sprite(name);this.root=document.createElement("div");this.root.className="rg-root rg-hidden rg-loading"+(this.touch?" rg-has-touch":"");this.root.style.setProperty("--slots",this.maxArrows);for(const n of ["corner","white"])this.root.style.setProperty(`--fade_${n}`,`url("${s(SKIN.fade(n))}")`);for(const[n,sprite]of [["bar_track",SKIN.barTrack],["bar_fill",SKIN.barFill],["rail",SKIN.rail],["rail_trail",SKIN.railTrail]]){this.root.style.setProperty(`--${n}`,`url("${s(sprite)}")`);}this.root.innerHTML=`
            <div class="rg-shake">
                <div class="rg-flash"></div>
                <div class="rg-info">
                    <div class="rg-song">
                        <img loading="lazy" class="rg-bg" alt="" src="${s(SKIN.songChip)}">
                        <span class="rg-song-title"></span>
                        <span class="rg-num rg-song-time"></span>
                        <span class="rg-song-track"><span class="rg-track-bg"></span><span class="rg-track-fill rg-song-fill"></span><img loading="lazy" class="rg-song-paw" alt="" src="${s(SKIN.marker)}"></span>
                    </div>
                    <div class="rg-gauge">
                        <img loading="lazy" class="rg-grade-badge rg-off" alt="">
                        <div class="rg-gauge-main">
                            <span class="rg-gauge-track"><span class="rg-track-bg"></span><span class="rg-track-fill rg-gauge-fill"></span>
                                ${PINS.map(([g,,at])=>`<img loading="lazy" class="rg-pin" alt="${g}" data-at="${at}" src="${s(SKIN.pin(g))}" style="left:${at}%">`).join("")}
                            </span>
                            <div class="rg-num rg-score"></div>
                        </div>
                    </div>
                </div>
                <div class="rg-players"></div>
                <div class="rg-stage">
                    <div class="rg-judge">
                        <img loading="lazy" class="rg-word" alt="">
                        <div class="rg-combo"><img loading="lazy" class="rg-combo-word" alt="" src="${s(SKIN.word("combo"))}"><div class="rg-num rg-combo-num"></div></div>
                    </div>
                    <div class="rg-count"></div>
                    <div class="rg-meter">
                        <div class="rg-level"><img loading="lazy" class="rg-level-bg" alt="" src="${s(SKIN.levelTag)}"><span class="rg-level-in"><img loading="lazy" class="rg-level-word" alt="Lv." src="${s(SKIN.caption("lv"))}"><span class="rg-num rg-level-num"></span></span></div>
                        <div class="rg-bar">
                            <span class="rg-rail"></span>
                            <div class="rg-bar-in">
                                <span class="rg-bar-fill"></span>
                                <div class="rg-ticks"></div>
                                <div class="rg-target"></div>
                                <img loading="lazy" class="rg-target-ring" alt="" src="${s(SKIN.targetRing)}">
                                <img loading="lazy" class="rg-ball" alt="" src="${s(SKIN.marker)}">
                            </div>
                        </div>
                    </div>
                    <div class="rg-lane"><div class="rg-lane-shine"></div><div class="rg-arrows"></div></div>
                </div>
                <button class="rg-beat" aria-label="beat"><img loading="lazy" alt="" src="${s(SKIN.beat)}"></button>
                <div class="rg-touch">
                    <div class="rg-dpad">${DPAD.map(d=>`<button data-dir="${d}" class="rg-btn rg-${d}" aria-label="${d}"><img loading="lazy" alt="" src="${s(SKIN.pad(d))}"></button>`).join("")}</div>
                </div>
                <div class="rg-tap"></div>
                <div class="rg-fx"></div>
            </div>`;document.body.appendChild(this.root);const q=sel=>this.root.querySelector(sel);this.shakeEl=q(".rg-shake");this.flashEl=q(".rg-flash");this.fxEl=q(".rg-fx");this.tapEl=q(".rg-tap");this.songTitle=q(".rg-song-title");this.songTime=q(".rg-song-time");this.songFill=q(".rg-song-fill");this.songPaw=q(".rg-song-paw");this.gradeBadge=q(".rg-grade-badge");this.gaugeFill=q(".rg-gauge-fill");this.pinEls=[...this.root.querySelectorAll(".rg-pin")];for(const pin of this.pinEls)pin._at=Number(pin.dataset.at);this.playersEl=q(".rg-players");this.scoreEl=q(".rg-score");this.wordEl=q(".rg-word");this.comboEl=q(".rg-combo");this.comboNum=q(".rg-combo-num");this.countEl=q(".rg-count");this.levelEl=q(".rg-level");this.levelNum=q(".rg-level-num");this.barFill=q(".rg-bar-fill");this.ticksEl=q(".rg-ticks");this.target=q(".rg-target");this.targetRing=q(".rg-target-ring");this.ball=q(".rg-ball");this.laneShine=q(".rg-lane-shine");this.arrowsEl=q(".rg-arrows");this.beatBtn=q(".rg-beat");this.dpadEls=Object.fromEntries([...this.root.querySelectorAll(".rg-btn")].map(b=>[b.dataset.dir,b]));this.target.style.left=`${this.targetAt*100}%`;this.targetRing.style.left=`${this.targetAt*100}%`;this._layout();for(const btn of Object.values(this.dpadEls)){btn.addEventListener("pointerdown",e=>{e.preventDefault();this.onArrow(btn.dataset.dir);});}this.beatBtn.addEventListener("pointerdown",e=>{e.preventDefault();this.onBeat();});}constructor(o){Object.assign(this,o);this.sizes={};this.notes=[];this.ticks=[];this.pool=[];this.scoreShown=0;this.scoreFrom=0;this.scoreTo=0;this.scoreStart=0;this.level=-1;this._build();this._onResize=()=>this._layout();window.addEventListener("resize",this._onResize);}}const CSS=`
.rg-root { --u: 1px; --t: 1px; --slots: 8; --violet: #2a0f55; --ink: rgba(42, 15, 85, .4);
  --display: 'Fredoka', 'Nunito', 'Arial Rounded MT Bold', 'Trebuchet MS', system-ui, sans-serif;
  --label: 'Nunito', 'Fredoka', 'Arial Rounded MT Bold', system-ui, sans-serif;
  position: fixed; inset: 0; pointer-events: none; z-index: 15; user-select: none; -webkit-user-select: none;
  font-family: var(--display); font-weight: 700; color: #fff; }
.rg-root img { display: block; -webkit-user-drag: none; user-select: none; pointer-events: none; }
.rg-hidden, .rg-loading { display: none; }
.rg-root button { font: inherit; color: inherit; margin: 0; padding: 0; border: 0; background: none; cursor: pointer;
  -webkit-tap-highlight-color: transparent; }
.rg-shake { position: absolute; inset: 0; }
.rg-flash { position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse at 50% 70%, rgba(255,255,255,0) 35%, rgba(255,160,225,.75) 100%); }
.rg-fx { position: absolute; inset: 0; overflow: hidden; }
.rg-fx > * { position: absolute; left: 0; top: 0; opacity: 0; will-change: transform, opacity; }
.rg-bg { width: 100%; height: auto; }

/* sprite-font numbers: glyph height is set per glyph in em */
.rg-num { display: flex; align-items: flex-end; height: 1em; line-height: 0; }
.rg-num img { margin: 0 -.07em; }
.rg-num .g-mid { align-self: center; height: .62em !important; margin: 0 .02em; }
.rg-num .g-comma { height: .5em !important; translate: 0 .14em; }
.rg-num .g-dot { height: .36em !important; }

/* ---- top left, on a deep violet fade from the corner: the song and the live grade */
.rg-info { position: absolute; top: max(calc(10 * var(--u)), env(safe-area-inset-top)); left: max(calc(12 * var(--u)), env(safe-area-inset-left));
  width: calc(290 * var(--u)); display: flex; flex-direction: column; gap: calc(6 * var(--u)); isolation: isolate; transition: opacity .25s; }
.rg-info::before { content: ''; position: absolute; z-index: -1; left: calc(-70 * var(--u)); top: calc(-70 * var(--u));
  width: calc(560 * var(--u)); height: calc(350 * var(--u)); pointer-events: none;
  background: var(--fade_corner) 0 0 / 100% 100% no-repeat; }
/* the song chip (its sprite has the music note); the title, the time and the bar sit on it */
.rg-song { position: relative; }
.rg-song-title { position: absolute; left: 29%; right: 25%; top: 24%; height: calc(19 * var(--u)); display: flex; align-items: center;
  font-size: calc(14 * var(--u)); white-space: nowrap; overflow: hidden; text-shadow: ${rim("#2a0f55",1.2,2)}; }
.rg-song-title img { height: 100%; width: auto; max-width: 100%; object-fit: contain; object-position: left center; }
.rg-song-time { position: absolute; right: 9%; top: 27%; font-size: calc(15 * var(--u)); }
/* bars: the track and the fill are 3-slice sprites (border-image: the round ends whole, the middle stretched); the fill
   grows to --p (0..1) of the track */
.rg-song-track, .rg-gauge-track { --bh: 7; position: relative; height: calc(var(--bh) * var(--u)); }
.rg-song-track { position: absolute; left: 30%; right: 10%; top: 61%; }
.rg-track-bg, .rg-track-fill { position: absolute; left: 0; top: 0; height: 100%; }
.rg-track-bg { width: 100%; border-image: var(--bar_track) 0 38 fill / 0 calc(var(--bh) * .5 * var(--u)) / 0 stretch; }
.rg-track-fill { --p: 0; width: calc(var(--p) * 100%); border-image: var(--bar_fill) 0 40 fill / 0 calc(var(--bh) * .5 * var(--u)) / 0 stretch; }
.rg-gauge-fill { transition: width .5s ease-out; }
.rg-song-paw { position: absolute; top: 50%; left: 0; width: calc(19 * var(--u)); translate: -50% 0; transform: translateY(-50%); }
.rg-gauge { display: flex; align-items: center; gap: calc(9 * var(--u)); }
.rg-grade-badge { flex: none; width: calc(72 * var(--u)); transition: opacity .2s; }
.rg-grade-badge.rg-off { opacity: .35; filter: grayscale(1); }
.rg-gauge-main { flex: 1; display: flex; flex-direction: column; align-items: flex-end; gap: calc(6 * var(--u)); padding: calc(22 * var(--u)) calc(6 * var(--u)) 0 0; }
.rg-gauge-track { align-self: stretch; }
.rg-pin { position: absolute; bottom: calc(100% + 1 * var(--u)); width: calc(19 * var(--u)); translate: -50% 0; filter: grayscale(.85) opacity(.7); transition: filter .3s, scale .3s; }
.rg-pin.on { filter: none; scale: 1.12; }
.rg-score { font-size: calc(30 * var(--u)); transform-origin: right center; }

/* ---- right, on a soft white fade: the ranking */
.rg-players { position: absolute; top: calc(92 * var(--u)); right: max(calc(16 * var(--u)), env(safe-area-inset-right)); width: calc(250 * var(--u));
  display: flex; flex-direction: column; gap: calc(6 * var(--u)); isolation: isolate; transition: opacity .25s; }
.rg-players::before { content: ''; position: absolute; z-index: -1; right: calc(-60 * var(--u)); top: calc(-50 * var(--u)); bottom: calc(-50 * var(--u));
  width: calc(400 * var(--u)); pointer-events: none;
  background: var(--fade_white) 100% 50% / 100% 100% no-repeat; }
.rg-players:empty::before { display: none; }
.rg-player { position: relative; display: flex; align-items: center; gap: calc(8 * var(--u)); height: calc(68 * var(--u)); }
.rg-rank { flex: none; width: calc(40 * var(--u)); }
.rg-avatar { position: relative; flex: none; width: calc(62 * var(--u)); height: calc(62 * var(--u)); }
.rg-face { position: absolute; inset: 11%; border-radius: 50%; overflow: hidden; display: grid; place-items: center;
  font-size: calc(24 * var(--u)); color: #fff; text-shadow: ${rim("#2a0f55",1.2,1.5)}; }
.rg-face img { width: 100%; height: 100%; object-fit: cover; }
.rg-ring { position: absolute; inset: 0; width: 100%; height: 100%; }
.rg-pinfo { position: relative; min-width: 0; display: flex; flex-direction: column; gap: calc(3 * var(--u)); }
.rg-pname { font-family: var(--label); font-weight: 800; font-size: calc(16 * var(--u)); line-height: 1.1; color: #3a1670;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 0 calc(4 * var(--u)) rgba(255, 255, 255, .9); }
.rg-pscore { font-size: calc(26 * var(--u)); }
.rg-pname img { height: calc(22 * var(--u)); width: auto; }
.rg-me .rg-pscore { font-size: calc(30 * var(--u)); }

/* ---- bottom centre: judgement, level + timing rail, note lane (no boxes) */
.rg-stage { position: absolute; left: 50%; bottom: max(calc(14 * var(--u)), env(safe-area-inset-bottom)); translate: -50% 0;
  width: calc(var(--slots) * 80 * var(--u) + 40 * var(--u)); }
.rg-judge, .rg-count { position: absolute; left: 50%; bottom: calc(100% + 6 * var(--u)); translate: -50% 0;
  display: flex; flex-direction: column; align-items: center; }
.rg-word { height: calc(80 * var(--u)); opacity: 0; transform-origin: 50% 70%; }
.rg-combo { display: flex; align-items: center; gap: calc(6 * var(--u)); margin-top: calc(-6 * var(--u)); opacity: 0; transform-origin: 50% 70%; }
.rg-count > * { transform-origin: 50% 70%; opacity: 0; }
.rg-combo-word { height: calc(40 * var(--u)); }
.rg-combo-num { font-size: calc(46 * var(--u)); }
.rg-count .rg-num { font-size: calc(96 * var(--u)); }

.rg-meter { display: flex; align-items: center; gap: calc(12 * var(--u)); margin: 0 calc(6 * var(--u)) calc(4 * var(--u)); }
.rg-level { position: relative; flex: none; width: calc(84 * var(--u)); }
.rg-level-bg { width: 100%; }
.rg-level-in { position: absolute; inset: 0 0 8% 0; display: flex; align-items: center; justify-content: center; gap: calc(3 * var(--u)); }
.rg-level-word { height: calc(17 * var(--u)); width: auto; }
.rg-level-num { font-size: calc(20 * var(--u)); }
.rg-bar { position: relative; flex: 1; height: calc(40 * var(--u)); }
.rg-rail { position: absolute; inset: 0; border-image: var(--rail) 0 39 fill / 0 calc(20 * var(--u)) / 0 stretch; }
.rg-bar-in { position: absolute; left: 3%; right: 3%; top: 30%; bottom: 32%; border-radius: 999px; }
.rg-bar-fill { position: absolute; left: 0; top: 0; height: 100%; width: 0;
  border-image: var(--rail_trail) 0 27 0 0 fill / 0 calc(7.5 * var(--u)) 0 0 / 0 stretch; }
.rg-ticks { position: absolute; inset: 0; }
.rg-tick { position: absolute; top: 50%; width: calc(9 * var(--u)); height: calc(9 * var(--u)); translate: -50% -50%; opacity: .75; }
.rg-tick.rg-tick-down { width: calc(13 * var(--u)); height: calc(13 * var(--u)); }
.rg-tick.passed { opacity: 1; }
/* the beat target: a wide glowing band on the rail, solid orange on the beat and easing out to fully transparent
   toward its ends (alpha follows ~(1 - x^2)^2, so there is no visible cut-off), with no hard lines - the stops sit at
   the real PERFECT / GREAT / COOL / BAD edges (--p, --g, --c, --b: distance from the centre, set per round), so
   anywhere the colour shows, a press scores */
.rg-target { position: absolute; top: -70%; bottom: -70%; left: 80%; min-width: calc(40 * var(--u)); translate: -50% 0;
  --p: 10%; --g: 19%; --c: 31%; --b: 46%;
  border-radius: 999px; opacity: .85; transition: opacity .15s;
  background: linear-gradient(90deg,
    hsla(24, 95%, 58%, 0) 0%,
    hsla(24, 95%, 58%, .03) calc(50% - var(--b)),
    hsla(25, 97%, 57%, .16) calc(50% - (var(--c) + var(--b)) / 2),
    hsla(26, 100%, 56%, .4) calc(50% - var(--c)),
    hsla(28, 100%, 55%, .73) calc(50% - var(--g)),
    hsla(30, 100%, 55%, .93) calc(50% - var(--p)),
    hsl(32, 100%, 54%) 50%,
    hsla(30, 100%, 55%, .93) calc(50% + var(--p)),
    hsla(28, 100%, 55%, .73) calc(50% + var(--g)),
    hsla(26, 100%, 56%, .4) calc(50% + var(--c)),
    hsla(25, 97%, 57%, .16) calc(50% + (var(--c) + var(--b)) / 2),
    hsla(24, 95%, 58%, .03) calc(50% + var(--b)),
    hsla(24, 95%, 58%, 0) 100%);
  filter: drop-shadow(0 0 calc(5 * var(--u)) rgba(255, 130, 20, .7));
  /* soft at the top and bottom too (the gradient above fades it left and right): no hard edge anywhere */
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 34%, #000 66%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 34%, #000 66%, transparent); }
.rg-target.ready { opacity: 1; }
.rg-target.hit { opacity: 1; filter: drop-shadow(0 0 calc(8 * var(--u)) rgba(255, 170, 60, .9)) brightness(1.3) saturate(.85); }
/* the circle at the beat point: where the paw should be on the beat; brighter once the arrows are typed, a flash on a hit */
.rg-target-ring { position: absolute; top: 50%; left: 80%; width: calc(34 * var(--u)); translate: -50% -50%; opacity: .55; transition: opacity .15s, filter .15s; }
.rg-target.ready + .rg-target-ring { opacity: .95; }
.rg-target.hit + .rg-target-ring { opacity: 1; filter: drop-shadow(0 0 calc(6 * var(--u)) rgba(255, 200, 90, .95)); }
.rg-ball { position: absolute; z-index: 1; top: 50%; left: 0; width: calc(40 * var(--u)); translate: -50% -50%; transition: opacity .15s;
  filter: drop-shadow(0 calc(2 * var(--u)) calc(3 * var(--u)) var(--ink)); }

.rg-lane { position: relative; padding: calc(4 * var(--u)) calc(10 * var(--u)); }
.rg-lane-shine { position: absolute; inset: 0; border-radius: 999px; opacity: 0;
  background: radial-gradient(ellipse at 50% 60%, rgba(255,255,255,.55), rgba(255,220,245,0) 70%); }
.rg-arrows { display: flex; justify-content: center; align-items: center; gap: calc(6 * var(--u)); height: calc(78 * var(--u)); }
.rg-note { position: relative; height: 100%; aspect-ratio: 1; }
.rg-note-in { position: absolute; inset: 0; }
.rg-note-body { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain;
  filter: drop-shadow(0 calc(3 * var(--u)) calc(3 * var(--u)) var(--ink)); }
.rg-note-arrow { position: absolute; left: 27%; top: 30%; width: 46%; height: 46%; object-fit: contain; }
.rg-note-ring { position: absolute; left: -16%; top: -16%; width: 132%; height: 132%; object-fit: contain; opacity: 0; transition: opacity .15s; }
.rg-note.next .rg-note-ring { opacity: 1; animation: rg-glow .45s ease-in-out infinite alternate; }

/* ---- on touch screens the d-pad bottom right and the BEAT paw bottom left; with keys no paw (Space is the beat) */
.rg-root:not(.rg-has-touch) .rg-beat { display: none; }
.rg-beat { position: absolute; right: max(calc(18 * var(--u)), env(safe-area-inset-right)); bottom: max(calc(14 * var(--u)), env(safe-area-inset-bottom));
  width: calc(136 * var(--u)); pointer-events: auto; touch-action: none; }
.rg-beat img, .rg-btn img { width: 100%; filter: drop-shadow(0 calc(4 * var(--u)) calc(5 * var(--u)) var(--ink)); }
.rg-touch { position: absolute; right: 0; bottom: 0; display: none;
  padding: 0 max(calc(12 * var(--t)), env(safe-area-inset-right)) max(calc(10 * var(--t)), env(safe-area-inset-bottom)) 0; }
.rg-has-touch .rg-touch { display: block; }
.rg-has-touch .rg-beat { width: calc(156 * var(--t)); right: auto; left: max(calc(18 * var(--u)), env(safe-area-inset-left)); }
@media (orientation: portrait) {
  .rg-has-touch .rg-stage { bottom: calc(236 * var(--t) + env(safe-area-inset-bottom)); }
}

/* ---- tap mode: none of the rail, the arrows and their buttons; the notes across the middle, a trail to the next */
.rg-root.rg-tapmode .rg-meter, .rg-root.rg-tapmode .rg-lane, .rg-root.rg-tapmode .rg-beat, .rg-root.rg-tapmode .rg-touch { display: none; }
.rg-root.rg-tapmode .rg-stage { bottom: max(calc(14 * var(--u)), env(safe-area-inset-bottom)); }
.rg-tap { position: absolute; inset: 0; pointer-events: none; }
.rg-tap-note { position: absolute; width: calc(116 * var(--u)); translate: -50% -56%; }
.rg-tap-note .rg-tap-body { position: relative; width: 100%; }
.rg-tap-note .rg-tap-halo, .rg-tap-note .rg-tap-paw, .rg-tap-note .rg-tap-ring { position: absolute; left: 50%; top: 56%; translate: -50% -50%; }
/* (two halos: the blob alone is too faint round the note; a tight one darkens its edge, a wide one fades out) */
.rg-tap-note .rg-tap-halo { width: 165%; height: 165%; }
.rg-tap-note .rg-tap-halo.rg-wide { width: 240%; height: 240%; }
.rg-tap-note .rg-tap-paw { width: 34%; }
/* the closing ring: a thin line in its note's colour (--c), glowing in it, with a faint dark edge round it for contrast */
.rg-tap-note .rg-tap-ring { box-sizing: border-box; border-radius: 50%; opacity: 0; border: calc(4 * var(--u)) solid var(--c);
  box-shadow: 0 0 0 calc(1.5 * var(--u)) rgba(42, 15, 85, .5), 0 0 calc(10 * var(--u)) var(--c), inset 0 0 calc(6 * var(--u)) var(--c); }
.rg-tap-link { position: absolute; height: calc(12 * var(--u)); margin-top: calc(-6 * var(--u)); transform-origin: 0 50%;
  border-image: var(--rail_trail) 0 27 0 0 fill / 0 calc(9 * var(--u)) 0 0 / 0 stretch;
  filter: drop-shadow(0 0 calc(2 * var(--u)) var(--violet)) drop-shadow(0 0 calc(2 * var(--u)) var(--violet)); }
.rg-btn { pointer-events: auto; touch-action: none; }
.rg-dpad { position: relative; width: calc(222 * var(--t)); height: calc(222 * var(--t)); }
.rg-btn { position: absolute; width: calc(88 * var(--t)); translate: -50% -50%; }
.rg-up { left: 50%; top: 20%; } .rg-down { left: 50%; top: 80%; } .rg-left { left: 20%; top: 50%; } .rg-right { left: 80%; top: 50%; }

@keyframes rg-glow { from { opacity: .7; scale: .97; } to { opacity: 1; scale: 1.03; } }
@media (prefers-reduced-motion: reduce) { .rg-root *, .rg-root { animation-duration: .01s !important; } }
`;

export { RhythmHud, SPRITES };
