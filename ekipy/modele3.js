/* Ekipy – modele postaci v3 (półrealistyczne). Układ 48x60 zgodny z animacjami gry:
   .lg2 noga tylna, .lg1 noga przednia, .bd tułów, .arf ramię przednie, .wp broń, .flm płomień.
   Proporcje ~7,5 głowy, brak grubego konturu: bryła budowana gradientami wzdłuż osi kończyn,
   miękkie cienie kontaktowe, ciepłe cienie skóry, refleksy, faktura tkanin. */
(function(G){
let UID=0,DEFS=[];
const nid=()=>"q"+(++UID);
const r2=v=>Math.round(v*100)/100,f=p=>r2(p[0])+" "+r2(p[1]);
const hex=c=>{c=String(c||"").trim();if(!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c))c="#d62839";if(c.length===4)c="#"+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];return[1,3,5].map(i=>parseInt(c.substr(i,2),16))};
const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return"#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("")};
const lum=c=>{const[r,g,b]=hex(c);return(.299*r+.587*g+.114*b)/255};
const LX=.62,LY=-.78; /* kierunek światła: z prawej, z góry */
/* materiał: baza, światło, cień, głęboki cień, odbicie (bounce), spekular */
function mat(c,o){o=o||{};const dk=lum(c)<.2;
  return{b:c,l:mix(c,"#fff3df",o.l||(dk?.14:.2)),s:mix(c,"#160f1c",o.s||(dk?.3:.4)),d:mix(c,"#07050a",o.d||.66),h:mix(c,"#ffffff",o.h||(dk?.22:.38)),r:mix(c,"#9fc4f0",dk?.28:.34),sp:o.sp||0};}
function skin(c,o){o=o||{};return{b:c,l:mix(c,"#fff1dc",.3),s:mix(c,"#7a2c20",.32),d:mix(c,"#3a120c",.55),h:mix(c,"#ffffff",.34),r:mix(c,"#d98a6a",.25),sp:0}}
function grad(x1,y1,x2,y2,stops){const id=nid();DEFS.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}">${stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}"${s[2]!=null?` stop-opacity="${s[2]}"`:""}/>`).join("")}</linearGradient>`);return`url(#${id})`}
function rgrad(stops){const id=nid();DEFS.push(`<radialGradient id="${id}" cx=".5" cy=".5" r=".5">${stops.map(s=>`<stop offset="${s[0]}" stop-color="${s[1]}" stop-opacity="${s[2]}"/>`).join("")}</radialGradient>`);return`url(#${id})`}
let RD,RL; /* miękkie plamy: ciemna / jasna */
const soft=(cx,cy,rx,ry,op,rot,light,col)=>`<ellipse cx="${r2(cx)}" cy="${r2(cy)}" rx="${r2(rx)}" ry="${r2(ry)}"${rot?` transform="rotate(${rot} ${r2(cx)} ${r2(cy)})"`:""} fill="${col?rgrad([[0,col,1],[.55,col,.4],[1,col,0]]):(light?RL:RD)}" opacity="${op}"/>`;
const clip=(d,inner)=>{const id=nid();return`<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`};
/* fałda: ciemna linia z jasną krawędzią obok */
const fold=(d,m,k)=>{k=k||1;return`<path d="${d}" stroke="${m.d}" stroke-width="${r2(.4*k)}" opacity=".38" fill="none" stroke-linecap="round"/><path d="${d}" transform="translate(.3,-.16)" stroke="${m.h}" stroke-width="${r2(.3*k)}" opacity=".26" fill="none" stroke-linecap="round"/>`};
const seam=(d,col,k)=>`<path d="${d}" stroke="${col}" stroke-width=".2" stroke-dasharray=".42 .3" opacity="${k||.7}" fill="none"/>`;
const edgeLn=(d,m,w)=>`<path d="${d}" fill="none" stroke="${mix(m.d,"#000",.4)}" stroke-width="${w||.26}" stroke-linejoin="round" opacity=".62"/>`;

/* ---------- kończyny: Catmull-Rom po osi [x,y,promień] ---------- */
const cr=(a,b,c,d,t)=>{const t2=t*t,t3=t2*t;return[0,1,2].map(i=>.5*(2*b[i]+(-a[i]+c[i])*t+(2*a[i]-5*b[i]+4*c[i]-d[i])*t2+(-a[i]+3*b[i]-3*c[i]+d[i])*t3))};
function dense(sp,n){n=n||6;const P=[],N=sp.length;for(let i=0;i<N-1;i++){const a=sp[Math.max(0,i-1)],b=sp[i],c=sp[i+1],d=sp[Math.min(N-1,i+2)];for(let s=0;s<n;s++)P.push(cr(a,b,c,d,s/n))}P.push(sp[N-1]);return P}
function norms(P){return P.map((p,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dx,dy)||1;return[-dy/l,dx/l]})}
function tube(sp,cap){const P=dense(sp),N=norms(P);const L=P.map((p,i)=>[p[0]+N[i][0]*p[2],p[1]+N[i][1]*p[2]]),R=P.map((p,i)=>[p[0]-N[i][0]*p[2],p[1]-N[i][1]*p[2]]);
  const e=P[P.length-1],s=P[0];
  return`M${f(L[0])}`+L.slice(1).map(q=>"L"+f(q)).join("")+(cap===false?`L${f(R[R.length-1])}`:`A${r2(e[2])} ${r2(e[2])} 0 0 0 ${f(R[R.length-1])}`)+R.slice(0,-1).reverse().map(q=>"L"+f(q)).join("")+(cap===false?"":`A${r2(s[2])} ${r2(s[2])} 0 0 0 ${f(L[0])}`)+"Z"}
const at=(sp,t)=>{const P=dense(sp),i=Math.min(P.length-1,Math.max(0,Math.round(t*(P.length-1))));return P[i]};
function edgePath(sp,k){const P=dense(sp),N=norms(P);return"M"+P.map((p,i)=>f([p[0]+N[i][0]*p[2]*k,p[1]+N[i][1]*p[2]*k])).join("L")}
/* gradient w poprzek kończyny: odbicie – cień – tło – światło – brzeg */
function limbGrad(sp,m,seg){const P=dense(sp),i=Math.min(P.length-2,Math.max(1,Math.round(P.length*(seg==null?.5:seg)))),a=P[i-1],b=P[i+1],p=P[i];
  let dx=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dx,dy)||1;let nx=-dy/l,ny=dx/l;if(nx*LX+ny*LY<0){nx=-nx;ny=-ny}
  const r=p[2]*1.06;
  return grad(p[0]-nx*r,p[1]-ny*r,p[0]+nx*r,p[1]+ny*r,[[0,mix(m.s,m.r,.35)],[.1,m.d],[.34,m.s],[.58,m.b],[.82,m.l],[1,m.b]])}
function limb(sp,m,o){o=o||{};const d=tube(sp,o.cap),g=limbGrad(sp,m);
  let s=`<path d="${d}" fill="${g}"/>`;
  const inner=(o.in||"");
  if(inner)s+=clip(d,inner);
  return s+edgeLn(d,m,.24)}
function band(sp,t0,t1,k){const a=at(sp,t0),b=at(sp,t1);return tube([[a[0],a[1],a[2]*(k||1.04)],[b[0],b[1],b[2]*(k||1.04)]],false)}
function ring(sp,t0,t1,m,o){o=o||{};const d=band(sp,t0,t1,o.k),a=at(sp,t0),b=at(sp,t1),g=limbGrad([[a[0],a[1],a[2]*1.04],[b[0],b[1],b[2]*1.04]],m,.5);
  let s=`<path d="${d}" fill="${g}"/>`+clip(d,(o.ribs?Array.from({length:o.ribs},(_,i)=>{const t=(i+.5)/o.ribs,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;return`<path d="M${r2(x-a[2]*1.2)} ${r2(y+.15)}L${r2(x+a[2]*1.2)} ${r2(y-.15)}" stroke="${m.d}" stroke-width=".22" opacity=".5"/>`}).join(""):""))+edgeLn(d,m,.22);
  return s}

/* ---------- dłoń ---------- */
function fist(x,y,sk,o){o=o||{};const m=o.glove?mat("#202228",{h:.3}):skin(sk),rot=o.rot||0;
  const d=`M${x-1.6} ${y-1.3}Q${x-.2} ${y-2.4} ${x+1.5} ${y-1.6}Q${x+2.2} ${y-.5} ${x+1.9} ${y+1}Q${x+.6} ${y+2.2} ${x-1.2} ${y+1.7}Q${x-2.1} ${y+.4} ${x-1.6} ${y-1.3}Z`;
  const g=grad(x-2,y+1.5,x+2,y-1.5,[[0,m.s],[.45,m.b],[.8,m.l],[1,m.b]]);
  let s=`<path d="${d}" fill="${g}"/>`+clip(d,`<path d="M${x+1.9} ${y-.7}H${x+.5}M${x+2} ${y+.2}H${x+.6}M${x+1.8} ${y+1}H${x+.6}" stroke="${m.d}" stroke-width=".26" opacity=".6"/><path d="M${x-1.2} ${y+.1}Q${x} ${y-.5} ${x+.8} ${y+1}" stroke="${m.d}" stroke-width=".22" opacity=".4" fill="none"/>`+soft(x+.7,y-1.5,1.3,.6,.5,0,1))+edgeLn(d,m,.22);
  if(o.glove)s+=`<path d="M${x+.2} ${y-2}Q${x+1.7} ${y-1.8} ${x+2.1} ${y-.2}" stroke="#4d505a" stroke-width=".9" fill="none" stroke-linecap="round" opacity=".9"/>`;
  return rot?`<g transform="rotate(${rot} ${x} ${y})">${s}</g>`:s}

/* ---------- głowa 3/4 (twarzą w prawo), ~7,8 jednostki wysokości ---------- */
const HEAD=`M25 2.4C27.7 2.4 29.3 3.9 29.45 6L29.65 6.9C29.95 7.55 30.45 8.3 30.45 8.65L29.95 9L29.95 9.35C30 9.7 29.8 9.95 29.75 10.1C29.75 10.5 29.5 10.75 29.2 10.95C28.7 11.55 27.6 11.65 26.7 11.3C25.2 11 24.1 10.1 23.1 8.9C22 7.9 21.4 6.8 21.4 5.5C21.4 3.5 22.9 2.4 25 2.4Z`;
function headSkin(sk,o){o=o||{};const m=skin(sk);
  const g=grad(21.4,6,29.8,6,[[0,m.d],[.16,m.s],[.42,m.b],[.78,m.l],[1,m.b]]);
  let s=`<path d="${HEAD}" fill="${g}"/>`;
  let in_="";
  in_+=soft(23.2,9.4,2.6,2.2,.5)+soft(27.2,11.3,3.2,1.2,.55);               /* cień pod żuchwą */
  in_+=soft(25.3,4.2,4,1.8,.28,0,1)+soft(28.4,4.7,1.4,1,.3,0,1);            /* światło na czole */
  in_+=soft(27.6,8.2,1.8,1.4,.28,0,1,mix(sk,"#ff8a6a",.35));                /* policzek (rumieniec) */
  in_+=soft(27.3,6.5,1.55,.95,.26);                                          /* oczodół */
  in_+=soft(29.2,6.0,.9,1.1,.26);                                            /* po stronie nosa */
  in_+=soft(28.6,10.7,1.4,.5,.3);                                            /* pod dolną wargą */
  in_+=soft(22.2,6.5,1.5,3.5,.3);if(o.cap)in_+=soft(27,5.7,3.6,1.1,.5)+soft(26.6,6.3,3,.6,.3);                                            /* tył głowy w cieniu */
  s+=clip(HEAD,in_)+edgeLn(HEAD,m,.28);
  return s}
function ear(sk,x,y,cauli){const m=skin(sk);
  const d=cauli?`M${x-.6} ${y-1}Q${x+.5} ${y-1.5} ${x+1} ${y-.3}Q${x+1.4} ${y+.7} ${x+.6} ${y+1.4}Q${x-.1} ${y+1.8} ${x-.6} ${y+1.2}Q${x-1} ${y} ${x-.6} ${y-1}Z`:`M${x-.6} ${y-1.1}Q${x+.5} ${y-1.4} ${x+.9} ${y-.2}Q${x+1} ${y+.9} ${x+.2} ${y+1.5}Q${x-.4} ${y+1.6} ${x-.7} ${y+1}Q${x-1} ${y-.2} ${x-.6} ${y-1.1}Z`;
  return`<path d="${d}" fill="${grad(x-1,y,x+1,y,[[0,m.d],[.5,m.s],[1,m.b]])}"/><path d="M${x-.1} ${y-.7}Q${x+.5} ${y-.5} ${x+.4} ${y+.3}Q${x+.1} ${y+.8} ${x-.1} ${y+.9}" stroke="${m.d}" stroke-width=".22" fill="none" opacity=".7"/>`+edgeLn(d,m,.22)}
function neckSk(sk){const m=skin(sk),d=`M22.6 8.6L22.9 13.4L27.8 13.6L27.4 10.2Z`;
  return`<path d="${d}" fill="${grad(22.6,0,27.8,0,[[0,m.d],[.35,m.s],[.75,m.b],[1,m.l]])}"/>`+clip(d,soft(26,10.8,3,1.8,.6)+soft(25,13.4,3.4,.8,.4))+edgeLn(d,m,.22)}
/* rysy twarzy: oczy, brwi, nos, usta */
function features(sk,o){o=o||{};const m=skin(sk),hr=o.brow||"#2a1d14";let s="";
  const lid=m.d,iris=o.eye||"#4a3a2a";
  /* dalsze oko */
  s+=`<path d="M28.5 6.55Q28.95 6.15 29.4 6.5Q29 6.9 28.5 6.55Z" fill="#cfc6b8"/><circle cx="29" cy="6.52" r=".26" fill="${iris}"/><circle cx="29.02" cy="6.52" r=".12" fill="#0b0806"/><path d="M28.45 6.6Q29 6.05 29.5 6.5" stroke="${lid}" stroke-width=".24" fill="none"/>`;
  if(!o.noEyes){
    /* bliższe oko */
    const ig=rgrad([[0,mix(iris,"#fff",.25),1],[.65,iris,1],[1,mix(iris,"#000",.5),1]]);
    s+=`<path d="M26.55 6.7Q27.3 6.05 28.05 6.55Q27.4 7.05 26.55 6.7Z" fill="#d8cfc2"/><path d="M26.55 6.7Q27.3 6.05 28.05 6.55Q27.4 7.05 26.55 6.7Z" fill="${grad(0,6,0,7,[[0,"#7a6e62",.6],[.5,"#7a6e62",0]])}"/>`;
    s+=`<circle cx="27.45" cy="6.55" r=".44" fill="${ig}"/><circle cx="27.48" cy="6.55" r=".2" fill="#070504"/><circle cx="27.33" cy="6.4" r=".1" fill="#fff" opacity=".95"/>`;
    s+=`<path d="M26.45 6.75Q27.3 5.95 28.15 6.5" stroke="${mix(lid,"#000",.3)}" stroke-width=".3" fill="none" stroke-linecap="round"/><path d="M26.9 7Q27.4 7.2 27.9 6.85" stroke="${lid}" stroke-width=".16" fill="none" opacity=".7"/><path d="M26.7 6.2Q27.3 5.7 28 6.05" stroke="${lid}" stroke-width=".2" fill="none" opacity=".55"/>`;
    /* brwi z włosków */
    const by=o.angry?.3:0,bw=o.bw||1;
    let b="";for(let i=0;i<9;i++){const t=i/8,x=26+t*2.5,y=5.45+by*(1-t)*.6-Math.sin(t*3.1)*.35+t*by*.2;b+=`<path d="M${r2(x)} ${r2(y+.35)}Q${r2(x+.2)} ${r2(y-.1)} ${r2(x+.45)} ${r2(y-.05)}" stroke="${hr}" stroke-width="${r2(.22*bw)}" fill="none" stroke-linecap="round" opacity=".9"/>`}
    s+=b+`<path d="M28.7 ${5.7+by*.4}Q29.1 ${5.5+by*.4} 29.45 ${5.75+by*.5}" stroke="${hr}" stroke-width="${r2(.3*bw)}" fill="none" stroke-linecap="round" opacity=".85"/>`;
  }
  /* nos */
  if(!o.noNose){
    const nd=`M28.9 6.2C29.4 7 29.9 7.8 30.4 8.6C30.5 8.95 30.2 9.15 29.8 9.1C29.3 9.2 28.9 9 28.6 8.7C28.7 7.8 28.8 7 28.9 6.2Z`;
    s+=`<path d="${nd}" fill="${grad(28.4,0,30.5,0,[[0,m.s],[.4,m.b],[.75,m.l],[1,m.b]])}"/>`+clip(nd,soft(29.3,9.2,1.3,.5,.55)+soft(30,8.4,.5,.45,.45,0,1)+`<ellipse cx="29.5" cy="9.1" rx=".34" ry=".2" fill="${m.d}" opacity=".85"/>`)+`<path d="M28.95 6.3C29.2 7 29.6 7.7 29.9 8.3" stroke="${m.d}" stroke-width=".2" fill="none" opacity=".45"/>`+(o.broken?`<path d="M29.1 6.8Q29.5 7.4 29.3 7.9" stroke="${m.d}" stroke-width=".25" fill="none" opacity=".6"/>`:"");
  }
  /* usta */
  if(o.shout){
    s+=`<path d="M28 9.75Q29 9.45 29.85 9.7Q29.85 11.1 28.9 11.2Q28.1 11 28 9.75Z" fill="#3a0f10"/><path d="M28.15 9.8Q29 9.6 29.75 9.78Q29.7 10.15 28.95 10.15Q28.3 10.1 28.15 9.8Z" fill="#efe9de"/><path d="M28.4 10.9Q29 11.1 29.5 10.8" stroke="#a5424a" stroke-width=".35" fill="none"/><path d="M27.9 9.85Q28.9 9.35 29.9 9.65" stroke="${mix(m.s,"#a5424a",.5)}" stroke-width=".26" fill="none"/>`;
  }else if(!o.noMouth){
    const lp=mix(sk,"#a5484a",.45),lpl=mix(sk,"#b85a58",.4);
    s+=`<path d="M28.05 9.95Q28.9 9.7 29.8 9.85Q29.2 10.1 28.05 9.95Z" fill="${mix(lp,"#000",.15)}"/><path d="M28.15 10Q29 10.3 29.7 10.05Q29.4 10.6 28.9 10.62Q28.3 10.5 28.15 10Z" fill="${lpl}"/><path d="M28.5 10.2Q29 10.3 29.4 10.15" stroke="#fff" stroke-width=".18" opacity=".35" fill="none"/><path d="M28 9.95Q28.9 9.8 29.85 9.88" stroke="#4a1c1a" stroke-width=".15" fill="none" opacity=".6"/>`;
  }
  return s}
function stubbleSk(c,a){const id=nid();DEFS.push(`<pattern id="${id}" width="1" height="1" patternUnits="userSpaceOnUse">`+Array.from({length:12},()=>`<circle cx="${r2(Math.random())}" cy="${r2(Math.random())}" r=".055" fill="${c}"/>`).join("")+`</pattern>`);
  const d=`M23.2 8.8Q24.2 10.9 26.6 11.4Q28.4 11.4 29.3 10.7L29.7 10.2Q28.5 10.5 27.6 10.2Q26 10.2 25.4 9Z`;
  return`<path d="${d}" fill="url(#${id})" opacity="${a}"/><path d="${d}" fill="${c}" opacity="${r2(a*.22)}"/>`}
/* włosy: baza + pasma */
function hairStrands(d,col,n,box,seed){let s=`<path d="${d}" fill="${col}"/>`;const [x0,y0,x1,y1]=box,lc=mix(col,"#fff",.25),dc=mix(col,"#000",.4);
  let str="";for(let i=0;i<n;i++){const t=i/n,x=x0+(x1-x0)*t,y=y0+(y1-y0)*(.3+.4*Math.sin(t*3.1+(seed||0)));str+=`<path d="M${r2(x)} ${r2(y)}Q${r2(x+.3)} ${r2(y+1.2)} ${r2(x-.1+Math.cos(i)*.4)} ${r2(y+2.2)}" stroke="${i%3?dc:lc}" stroke-width=".18" fill="none" opacity=".5"/>`}
  return s+clip(d,str)+edgeLn(d,{d:col},.22)}
function shades(){return`<path d="M26.4 6.05H29.7V7.2Q29.2 7.9 28.1 7.7Q26.9 7.6 26.4 7.1Z" fill="#0a0a0d"/><path d="M26.5 6.2L22.9 6.5" stroke="#0a0a0d" stroke-width=".5"/><path d="M26.9 6.35Q27.8 6.25 28.6 6.5" stroke="#9cc4ff" stroke-width=".3" opacity=".55" fill="none"/>`}

/* ---------- korpus ---------- */
function TP(o){o=o||{};const sl=o.sl??18.7,sr=o.sr??31,wl=o.wl??19.5,wr=o.wr??30.3,hl=o.hl??18.8,hr=o.hr??30.9,hy=o.hy??33.6;return`M${r2(sl+.6)} 13.8Q21.4 12.7 23.4 12.9L26.6 12.8Q28.6 12.5 ${r2(sr-.9)} 13.7Q${sr} 14.7 ${sr} 17Q${r2((sr+wr)/2)} 20.4 ${wr} 24.4Q${r2((wr+hr)/2-.3)} 28.4 ${hr} ${hy}Q24.9 ${r2(hy+1.2)} ${hl} ${hy}Q${r2((wl+hl)/2+.3)} 28.4 ${wl} 24.4Q${r2((sl+wl)/2-.1)} 20 ${sl} 17Q${sl} 14.8 ${r2(sl+.6)} 13.8Z`}
const TORSO=`M19.3 13.8Q21.4 12.7 23.4 12.9L26.6 12.8Q28.6 12.5 30.1 13.7Q31.1 14.7 31 17Q30.9 20.4 30.3 23.4Q30 27 30.9 32Q25 33.3 18.8 32.1Q19.6 27 19.5 23.4Q18.6 20 18.7 17Q18.7 14.8 19.3 13.8Z`;
function torsoFill(m,x0,x1,T){x0=x0==null?18.6:x0;x1=x1==null?31.1:x1;T=T||TORSO;
  return`<path d="${T}" fill="${grad(x0,0,x1,0,[[0,mix(m.s,m.r,.2)],[.1,m.d],[.3,m.s],[.58,m.b],[.82,m.l],[1,m.b]])}"/>`}
function torsoShade(m,hemY){hemY=hemY||32;return soft(24.8,hemY,7,2.2,.5)+soft(24.6,13.4,5,1.5,.4)+soft(21,22,2.2,6,.28)+soft(29.6,17,1.8,4,.2,0,1)+soft(27.8,15.6,2.4,1.6,.32,0,1)}

/* ---------- nogi ---------- */
const LEGB=[[21.7,31,3.5],[21.3,37,3.1],[21.2,43,2.6],[21,49.2,2.1],[20.9,54.2,1.8]];
const LEGF=[[27.3,31,3.6],[27.9,37,3.2],[28,43,2.7],[28.1,49.2,2.15],[28.2,54.3,1.85]];
function pants(sp,col,type,c2,back){const m=mat(col,{s:.46});let inn="";
  const k=at(sp,.5),a=at(sp,.9),b=at(sp,.97),h=at(sp,.18);
  inn+=soft(k[0]-.8,k[1]-.4,2.3,.9,.45)+soft(a[0]-.4,a[1]-.3,2.3,.8,.4)+soft(h[0],h[1]+.4,3,1,.35);
  inn+=fold(`M${r2(k[0]-1.9)} ${r2(k[1]-.5)}Q${r2(k[0])} ${r2(k[1]+.6)} ${r2(k[0]+2)} ${r2(k[1]-.3)}`,m)+fold(`M${r2(k[0]-1.6)} ${r2(k[1]+.9)}Q${r2(k[0]-.2)} ${r2(k[1]+1.5)} ${r2(k[0]+1.8)} ${r2(k[1]+.7)}`,m,.8);
  inn+=fold(`M${r2(a[0]-1.8)} ${r2(a[1]-.6)}Q${r2(a[0])} ${r2(a[1]+.3)} ${r2(a[0]+1.9)} ${r2(a[1]-.5)}`,m)+fold(`M${r2(b[0]-1.7)} ${r2(b[1]-.3)}Q${r2(b[0])} ${r2(b[1]+.5)} ${r2(b[0]+1.8)} ${r2(b[1]-.2)}`,m,.8);
  inn+=fold(`M${r2(h[0]-2)} ${r2(h[1]+.8)}Q${r2(h[0])} ${r2(h[1]+2.4)} ${r2(h[0]+1.4)} ${r2(h[1]+5)}`,m,.7);
  if(type==="jeans"){inn+=seam(edgePath(sp,-.55),"#e2b878",.7)+seam(edgePath(sp,.62),"#e2b878",.4);
    const t=at(sp,.985);inn+=`<path d="M${r2(t[0]-2.2)} ${r2(t[1]-1)}H${r2(t[0]+2.4)}V${r2(t[1]+.7)}H${r2(t[0]-2.2)}Z" fill="${m.l}" opacity=".6"/><path d="M${r2(t[0]-2.2)} ${r2(t[1]-1)}H${r2(t[0]+2.4)}" stroke="${m.h}" stroke-width=".3" opacity=".7"/>`}
  if(type==="track")inn+=`<path d="${edgePath(sp,-.8)}" stroke="${c2}" stroke-width=".6" fill="none"/><path d="${edgePath(sp,-.5)}" stroke="${c2}" stroke-width=".34" fill="none" opacity=".9"/>`;
  if(type==="cargo"){const p=at(sp,.36);inn+=`<path d="M${r2(p[0]-.8)} ${r2(p[1]-1.8)}H${r2(p[0]+2.8)}L${r2(p[0]+2.6)} ${r2(p[1]+2.8)}H${r2(p[0]-.7)}Z" fill="${m.l}" opacity=".5"/><path d="M${r2(p[0]-.8)} ${r2(p[1]-1.8)}H${r2(p[0]+2.8)}L${r2(p[0]+2.6)} ${r2(p[1]+2.8)}H${r2(p[0]-.7)}Z" fill="none" stroke="${m.d}" stroke-width=".26" opacity=".7"/><path d="M${r2(p[0]-.9)} ${r2(p[1]-1.9)}H${r2(p[0]+2.9)}L${r2(p[0]+2.8)} ${r2(p[1]-.5)}H${r2(p[0]-.8)}Z" fill="${m.b}" stroke="${m.d}" stroke-width=".24"/><circle cx="${r2(p[0]+1)}" cy="${r2(p[1]-1.2)}" r=".24" fill="${m.d}"/>`}
  let s=limb(sp,m,{in:inn,cap:false});
  if(back)s+=`<path d="${tube(sp,false)}" fill="#0a0812" opacity=".3"/>`;
  return s}
function pelvis(col,type){const m=mat(col,{s:.46}),d=`M18.9 30Q24.6 29 30.4 30L30.8 33.6Q27.4 35.8 24.6 34.8Q21.8 36 18.8 33.6Z`;
  return`<path d="${d}" fill="${grad(18.8,0,30.8,0,[[0,m.s],[.4,m.b],[.8,m.l],[1,m.b]])}"/>`+clip(d,soft(24.6,30.4,5,1.1,.4)+soft(24.6,34.6,4,1.2,.3)+fold(`M24.7 30.4V34.6`,m,.8))+edgeLn(d,m,.24)}
function shoe(t,dx,col,acc){const X=v=>r2(v+dx);let s="";
  const body=(d,m,inn)=>`<path d="${d}" fill="${grad(0,51.5,0,58,[[0,m.l],[.3,m.b],[.78,m.s],[1,m.d]])}"/>`+clip(d,inn||"")+edgeLn(d,m,.24);
  const sole=(d,top,bot)=>`<path d="${d}" fill="${grad(0,56,0,57.9,[[0,top],[1,bot]])}"/>`+edgeLn(d,{d:bot},.22);
  if(t==="boot"){const m=mat("#2a2523",{h:.55,sp:1});
    s+=body(`M${X(25.6)} 49.4H${X(30.6)}L${X(31)} 52.4Q${X(35.4)} 52.8 ${X(37)} 54.9Q${X(37.7)} 55.7 ${X(37.5)} 56.4H${X(25.4)}Q${X(25.2)} 53 ${X(25.6)} 49.4Z`,m,
      soft(X(27.8),50.6,3,.9,.55)+soft(X(26.2),54,1.2,3,.4)+`<path d="M${X(26.4)} 51.6Q${X(28)} 53.8 ${X(32.4)} 54.6Q${X(28.6)} 52.6 ${X(26.4)} 51.6Z" fill="${m.h}" opacity=".3"/>`+soft(X(35.2),54.9,2.2,.7,.35,0,1)+
      `<path d="M${X(25.6)} 49.4H${X(30.6)}" stroke="#4a423c" stroke-width="1.1"/>`+[0,1,2,3].map(k=>`<path d="M${X(29.2+k*.55)} ${50.2+k*.85}L${X(31.2+k*.5)} ${50.5+k*.85}" stroke="#aaa07e" stroke-width=".3"/><circle cx="${X(29.1+k*.55)}" cy="${50.2+k*.85}" r=".24" fill="#c9ced6"/>`).join("")+
      `<path d="M${X(33.6)} 53.2Q${X(36)} 53.6 ${X(37.2)} 55.2" stroke="${m.d}" stroke-width=".3" fill="none" opacity=".7"/>`);
    s+=sole(`M${X(25.2)} 56H${X(37.8)}Q${X(38.2)} 57.9 ${X(36.6)} 57.9H${X(26)}Q${X(25)} 57.8 ${X(25.2)} 56Z`,"#1a1817","#050505")+`<path d="M${X(26)} 57.2H${X(37)}" stroke="#4a4642" stroke-width=".3" stroke-dasharray=".8 .5"/><path d="M${X(25.3)} 56.1H${X(37.7)}" stroke="#8a847c" stroke-width=".22" opacity=".6"/>`;
  }else if(t==="runner"){const m=mat(col||"#2b2e35",{sp:1});
    s+=body(`M${X(25.9)} 52.2Q${X(26)} 51.8 ${X(27)} 51.8H${X(29.9)}Q${X(30.5)} 51.9 ${X(30.8)} 52.7L${X(31.6)} 53.3Q${X(35.2)} 53.6 ${X(36.8)} 55.1Q${X(37.4)} 55.7 ${X(37.3)} 56.3H${X(25.7)}Q${X(25.5)} 54.2 ${X(25.9)} 52.2Z`,m,
      soft(X(27.8),52.8,2.4,.9,.5)+soft(X(35),54.6,2.4,.7,.3,0,1)+`<path d="M${X(26.8)} 55.9Q${X(29.8)} 53.4 ${X(34)} 54.3" stroke="${acc}" stroke-width=".9" fill="none"/><path d="M${X(30.4)} 52.9L${X(31.6)} 53.5M${X(30.9)} 52.7L${X(32.1)} 53.3M${X(31.4)} 52.9L${X(32.6)} 53.5" stroke="#e8e8e8" stroke-width=".28"/><path d="M${X(25.8)} 52.2H${X(30.2)}" stroke="#16181c" stroke-width=".9"/>`);
    s+=sole(`M${X(25.2)} 55.8H${X(37.9)}Q${X(38.3)} 57.9 ${X(36.7)} 57.9H${X(26)}Q${X(25)} 57.5 ${X(25.2)} 55.8Z`,mix(acc,"#fff",.45),mix(acc,"#000",.45))+`<path d="M${X(26)} 57.2L${X(26.7)} 56.7L${X(27.4)} 57.2L${X(28.1)} 56.7L${X(28.8)} 57.2L${X(29.5)} 56.7" stroke="#000" stroke-width=".22" fill="none" opacity=".4"/>`;
  }else{const m=mat(col||"#efede6",{s:.3,h:.5});
    s+=body(`M${X(25.9)} 52.4Q${X(26)} 52 ${X(27)} 52H${X(29.8)}Q${X(30.4)} 52.1 ${X(30.7)} 52.9L${X(31.6)} 53.5Q${X(35.2)} 53.8 ${X(36.8)} 55.3Q${X(37.4)} 55.9 ${X(37.3)} 56.4H${X(25.7)}Q${X(25.5)} 54.4 ${X(25.9)} 52.4Z`,m,
      soft(X(27.6),53,2.4,.9,.45)+soft(X(35),54.8,2.4,.7,.28,0,1)+`<path d="M${X(33.4)} 54.1Q${X(36)} 54.6 ${X(37.2)} 55.9V56.4H${X(33.2)}Z" fill="${m.s}" opacity=".5"/><path d="M${X(30.3)} 53L${X(31.5)} 53.6M${X(30.8)} 52.8L${X(32)} 53.4M${X(31.3)} 53L${X(32.5)} 53.6" stroke="#9a9ea6" stroke-width=".26"/><path d="M${X(27)} 55.7Q${X(29.8)} 54 ${X(32.8)} 54.7" stroke="${acc}" stroke-width=".75" fill="none"/><path d="M${X(25.8)} 52.4H${X(29.9)}" stroke="#8f939a" stroke-width=".8"/>`);
    s+=sole(`M${X(25.3)} 56H${X(37.7)}Q${X(38.1)} 57.9 ${X(36.5)} 57.9H${X(26)}Q${X(25.1)} 57.7 ${X(25.3)} 56Z`,"#dcb578","#8a6030")+`<path d="M${X(26)} 57.2H${X(37)}" stroke="#6a4820" stroke-width=".22" opacity=".6"/><path d="M${X(25.4)} 56.15H${X(37.6)}" stroke="#fff4d8" stroke-width=".22" opacity=".6"/>`;
  }
  const ax=r2(28.2+dx);
  return`<g transform="translate(${ax} 57.8) scale(.74 .84) translate(${-ax} -57.8)">${s}</g>`}

/* ---------- ręce ---------- */
const ARMB=[[19.9,15.2,2.35],[18.7,22.4,2.0],[19.4,28.8,1.55],[19.6,30.6,1.4]];
const ARMF=[[28.3,15.1,2.45],[30.2,22.3,2.1],[32.5,28.4,1.6],[33.5,30.2,1.45]];
function sleeve(sp,col,o){o=o||{};const m=mat(col,o.m);
  const e=at(sp,.5),sh=at(sp,.12);
  let inn=soft(e[0]-.9,e[1]+.2,1.8,1.2,.4)+soft(sh[0]-.2,sh[1]+2.4,2.4,1,.38)+soft(e[0]+.9,e[1]-1.8,1.2,2.2,.22,0,1);
  inn+=fold(`M${r2(e[0]-1.4)} ${r2(e[1]-.7)}L${r2(e[0]+.1)} ${r2(e[1]+.3)}L${r2(e[0]-1)} ${r2(e[1]+1)}`,m)+fold(`M${r2(e[0]-1.3)} ${r2(e[1]+1.5)}L${r2(e[0]+.3)} ${r2(e[1]+2.2)}`,m,.8)+fold(`M${r2(sh[0]+.6)} ${r2(sh[1]+2)}Q${r2(sh[0]+1.6)} ${r2(sh[1]+3)} ${r2(sh[0]+2)} ${r2(sh[1]+4.4)}`,m,.9);
  let s=limb(sp,m,{in:inn+(o.in||""),cap:true});
  if(o.back)s+=`<path d="${tube(sp)}" fill="#0a0812" opacity=".3"/>`;
  return s}

/* ---------- szalik klubowy ---------- */
function clubScarf(col,c2,long){const m=mat(col),L=long?29.6:26.4,d1=`M22.6 11.6Q25 13.4 28.4 11.8L29.6 14.4Q25.2 17 21.8 14.6Z`;
  let s=`<path d="${d1}" fill="${grad(21.8,0,29.6,0,[[0,m.s],[.5,m.l],[1,m.b]])}"/>`+clip(d1,soft(25,15.6,4.6,1.3,.5)+[12.4,13.4,14.4].map((y,i)=>`<path d="M21.6 ${y+.5}Q25.4 ${y+2.5} 29.8 ${y+.3}" stroke="${c2}" stroke-width=".62" fill="none" opacity="${i==1?.95:.9}" transform="translate(0 ${-i*.1})"/>`).join(""))+edgeLn(d1,m,.22);
  const d2=`M26.4 14.8L${long?29.2:28.6} ${L}L${long?26.4:25.8} ${r2(L-.2)}L25 15.4Z`;
  s+=`<path d="${d2}" fill="${grad(25,0,29,0,[[0,m.s],[.5,m.l],[1,m.b]])}"/>`+clip(d2,Array.from({length:Math.floor((L-16)/2.2)+1},(_,i)=>{const y=16.6+i*2.2;return`<path d="M24.8 ${r2(y)}L${r2(29.4)} ${r2(y+.3)}" stroke="${c2}" stroke-width=".78"/>`}).join("")+soft(25.4,L-1,2,2.6,.35))+edgeLn(d2,m,.22);
  s+=[0,.8,1.6,2.4].map(d=>`<path d="M${r2((long?26.5:25.9)+d)} ${r2(L-.1)}V${r2(L+1.2)}" stroke="${mix(col,"#000",.25)}" stroke-width=".32"/>`).join("");
  return s}

/* ================= KLASY ================= */
const CL={};
/* PROWODYR: kaszkiet z tweedu, overshirt z kieszeniami i naszywką, biały t-shirt, złoty łańcuch, mosiężny kastet, sygnet */
CL["Prowodyr"]=c=>{const{col,c2,sk,hr,fa}=c,m=mat(col);
  let back=sleeve(ARMB,col,{back:1})+ring(ARMB,.84,.97,mat(mix(col,"#000",.15)))+fist(19.6,31.4,sk,{rot:6})+`<circle cx="18.2" cy="29.8" r=".55" fill="#d9a93a"/><circle cx="18.2" cy="29.8" r=".28" fill="#9e1520"/>`;
  let body=back+neckSk(sk);
  /* t-shirt i łańcuch */
  const tee=`M23.2 12.9L26.4 12.8L26.8 16.4Q25 18.2 23.4 16.4Z`;
  body+=`<path d="${tee}" fill="${grad(23.2,0,26.8,0,[[0,"#bdb8b0"],[.5,"#f2efe8"],[1,"#d8d3ca"]])}"/>`;
  body+=torsoFill(m)+clip(TORSO,torsoShade(m,32)+
    /* listwa, kieszenie, fałdy */
    `<path d="M25 13.2V32" stroke="${m.d}" stroke-width=".55" opacity=".6"/><path d="M25.25 13.2V32" stroke="${m.h}" stroke-width=".25" opacity=".4"/>`+[15,18,21,24,27,30].map(y=>`<circle cx="25.7" cy="${y}" r=".28" fill="${m.d}"/><circle cx="25.65" cy="${y-.08}" r=".12" fill="${m.h}" opacity=".6"/>`).join("")+
    `<path d="M20.2 19.4H24.2V23.2L22.2 23.9L20.2 23.2Z" fill="${m.l}" opacity=".35"/><path d="M26.6 19.4H30.4V23.2L28.5 23.9L26.6 23.2Z" fill="${m.l}" opacity=".35"/><path d="M20.2 19.4H24.2V23.2L22.2 23.9L20.2 23.2Z" fill="none" stroke="${m.d}" stroke-width=".3" opacity=".7"/><path d="M26.6 19.4H30.4V23.2L28.5 23.9L26.6 23.2Z" fill="none" stroke="${m.d}" stroke-width=".3" opacity=".7"/><path d="M20 19.4H24.4M26.4 19.4H30.6" stroke="${m.d}" stroke-width=".4" opacity=".7"/>`+
    seam(`M20.5 20.2H24M26.8 20.2H30.2`,m.h,.5)+fold(`M19.2 16.6Q21 18.6 22.6 18.2`,m)+fold(`M30.6 16Q29.2 18 28 17.6`,m)+fold(`M19.2 26.6Q21.6 28.4 24 27.8`,m)+fold(`M30 26.4Q28.2 28.2 26.4 27.8`,m)+fold(`M21 30Q22.6 31 24.4 30.4`,m,.8)+
    `<path d="M18.7 31.6Q24.8 33 30.8 31.6" stroke="${m.d}" stroke-width=".5" opacity=".5" fill="none"/>`)+edgeLn(TORSO,m,.26);
  /* łańcuch */
  body+=`<path d="M23.4 13.4Q25 18.4 26.6 13.4" stroke="#6b4a10" stroke-width=".78" fill="none" opacity=".8"/><path d="M23.4 13.4Q25 18.4 26.6 13.4" stroke="#f2cc62" stroke-width=".52" stroke-dasharray=".5 .22" fill="none"/>`+`<circle cx="25" cy="17.4" r=".95" fill="${grad(24,16.4,26,18.4,[[0,"#fff0a8"],[.45,"#d9a93a"],[1,"#7a5714"]])}"/><path d="M24.5 17L25.5 17.9M25.5 17L24.5 17.9" stroke="#7a5714" stroke-width=".2"/>`;
  /* kołnierz overshirta */
  body+=`<path d="M22.4 12.7Q25 14.6 27.6 12.9L28.6 14.4L26.2 17L25 15.4L23.6 17L21.6 14.6Z" fill="${m.l}"/>`+clip(`M22.4 12.7Q25 14.6 27.6 12.9L28.6 14.4L26.2 17L25 15.4L23.6 17L21.6 14.6Z`,soft(24.5,13.6,3,1,.45)+`<path d="M25 15.4V17" stroke="${m.d}" stroke-width=".3"/>`)+edgeLn(`M22.4 12.7Q25 14.6 27.6 12.9L28.6 14.4L26.2 17L25 15.4L23.6 17L21.6 14.6Z`,m,.24);
  if(fa.stripes)body+=`<path d="M18.9 24.4H30.7M18.9 27H30.8" stroke="${c2}" stroke-width="1" opacity=".8"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  /* głowa */
  let hd=ear(sk,22.7,7.3)+headSkin(sk,{cap:1})+features(sk,{brow:hr})+stubbleSk(hr,.55);
  /* baki i włosy pod kaszkietem */
  hd+=hairStrands(`M21.5 4.8Q21.3 8.6 22.7 10.2L23.3 8.4L22.9 5.6Z`,hr,6,[21.6,5,23,8],1);
  /* kaszkiet z tweedu */
  const cp=`M20.9 5.3Q20.4 2 25 1.8Q29 1.8 29.9 4.2L32.6 5.2Q31.8 6.4 29.4 6Q25 5.4 20.9 5.3Z`;
  const tw=mat("#6a5d4e",{h:.3});
  hd+=`<path d="${cp}" fill="${grad(20.4,0,32.4,0,[[0,tw.d],[.25,tw.s],[.55,tw.l],[.85,tw.b],[1,tw.s]])}"/>`+clip(cp,
    Array.from({length:22},(_,i)=>`<path d="M${r2(20.8+i*.55)} ${r2(2+((i*7)%9)*.4)}l.32 .5l.32 -.5" stroke="${i%2?"#3e342a":"#8e806c"}" stroke-width=".18" fill="none" opacity=".75"/>`).join("")+
    `<path d="M21.4 4.6Q25 3.4 29.6 4.2M21 3.4Q25 2.3 28.6 3" stroke="${tw.d}" stroke-width=".2" opacity=".5" fill="none"/>`+soft(23,3,2.4,1.4,.4)+soft(27.6,2.6,2.2,.8,.45,0,1)+soft(25,5.6,5,.8,.5))+edgeLn(cp,tw,.26);
  hd+=`<path d="M29.8 4.2L32.6 5.2Q31.8 6.4 29.4 6Q29.8 5.2 29.8 4.2Z" fill="${tw.d}"/><path d="M29.9 4.3L32.4 5.2" stroke="${tw.h}" stroke-width=".3" opacity=".5"/><circle cx="25.2" cy="2" r=".4" fill="${tw.s}"/>`;
  /* cień daszka na czole */
  if(fa.shades)hd+=shades();
  /* mosiężny kastet na dłoni z przodu */
  const bm=mat("#d4a63a",{h:.5,l:.4});
  const wp=`<path d="M31.6 27.4Q33.6 26.7 35.7 27.4V30Q33.6 30.7 31.6 30Z" fill="${grad(31.6,26.6,31.6,30.8,[[0,"#fff0a8"],[.3,"#d9a93a"],[.7,"#9a7220"],[1,"#c9962e"]])}"/>`+[32.2,33.2,34.2,35.2].map(x=>`<circle cx="${x}" cy="27.9" r=".52" fill="none" stroke="#fbe8a4" stroke-width=".28"/><circle cx="${x+.05}" cy="27.95" r=".52" fill="none" stroke="#6a4a10" stroke-width=".14"/>`).join("")+edgeLn(`M31.6 27.4Q33.6 26.7 35.7 27.4V30Q33.6 30.7 31.6 30Z`,bm,.22);
  const badge=`<path d="M29.4 17.4L31.7 17L32.4 19.6L30 20Z" fill="#1f2228"/><path d="M29.9 18.2L31.8 17.9" stroke="${c2}" stroke-width=".32"/><circle cx="30.2" cy="19.4" r=".22" fill="#c9ced6"/>`;
  const arm=sleeve(ARMF,col,{in:badge})+ring(ARMF,.82,.97,mat(mix(col,"#000",.15)))+fist(33.6,30.4,sk)+`<g class="wp"><g transform="translate(0 1.2)">${wp}</g></g>`;
  return{legs:["jeans","#2f4468","terrace"],body,head:hd,arm}};

/* ---------- broń i dodatki ---------- */
const lerp=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function rod(sp,m,inn){const d=tube(sp,false);return`<path d="${d}" fill="${limbGrad(sp,m,.5)}"/>`+(inn?clip(d,inn):"")+edgeLn(d,m,.22)}
const knit=(d,cols,rows,x0,y0,x1,y1,col,op)=>{let s="";for(let i=0;i<cols;i++){const x=x0+(x1-x0)*i/cols;s+=`<path d="M${r2(x)} ${y0}V${y1}" stroke="${col}" stroke-width=".18" opacity="${op}"/>`}return s};

/* STARY WYGA: łysina z siwymi bokami, siwa broda i wąsy, blizna, ucho kalafior, złamany nos; skórzana kurtka z klapami (sprzęt),
   koszulka klubowa z herbem, brzuch, pas ze stalową klamrą, stalowa rura z rdzą i taśmą, glany, wyblakły tatuaż */
CL["Stary Wyga"]=c=>{const{col,c2,sk,fa}=c,hr="#a9a49c",LM={h:.58,l:.36,s:.5},LP=mat("#46321f",LM);
  const AB=ARMB.map(q=>[q[0]-1.2,q[1]+.1,q[2]*1.14]),AF=ARMF.map(q=>[q[0]+1.3,q[1]+.1,q[2]*1.14]);
  const T=TP({sl:16.8,sr:32.9,wl:17.5,wr:32.3,hl:16.9,hr:33,hy:33.1});
  const spec=`<path d="M17.4 16.4Q16.8 22 17.4 29" stroke="${LP.h}" stroke-width=".8" opacity=".5" fill="none" stroke-linecap="round"/><path d="M31.4 17Q32.3 22 31.9 28" stroke="${LP.h}" stroke-width=".7" opacity=".4" fill="none" stroke-linecap="round"/>`;
  let back=sleeve(AB,"#46321f",{back:1,m:LM,in:`<path d="M${r2(AB[0][0]+.4)} 16.6Q${r2(AB[1][0]+.2)} 21 ${r2(AB[2][0]+.2)} 26" stroke="${LP.h}" stroke-width=".6" opacity=".45" fill="none"/>`})+fist(18.1,31.6,sk,{rot:8})+`<path d="M16.8 29.4l.5.5l.5-.6M17.5 30.7l.5-.4" stroke="#33557f" stroke-width=".22" fill="none" opacity=".75"/>`;
  let body=back+neckSk(sk);
  body+=torsoFill(LP,16.8,33,T)+clip(T,torsoShade(LP,33)+spec+soft(20,20,2.6,5,.28,0,1)+fold(`M17.2 28Q19.6 29 22 28.2`,LP)+fold(`M32.2 27Q30 28.6 27.4 28`,LP)+fold(`M17 22.4L20 21.6`,LP,.8)+fold(`M32.6 22.2L29.6 21.4`,LP,.8))+edgeLn(T,LP,.28);
  /* koszulka klubowa w rozcięciu kurtki */
  const tee=`M22.2 12.9L27.6 12.8L28.7 22.4Q29 28 28.4 33Q25.2 34 21.8 33Q21.2 27 21.6 22.4Z`,tm=mat(col);
  body+=`<path d="${tee}" fill="${grad(21.4,0,28.8,0,[[0,tm.s],[.5,tm.l],[1,tm.b]])}"/>`+clip(tee,soft(25,15,3,1.2,.45)+soft(25,32,4,1.4,.4)+fold(`M22.2 26Q24.6 27.4 28 26.4`,tm)+
    `<path d="M23.6 17.2H27.4V20.4Q27.4 22.2 25.5 23Q23.6 22.2 23.6 20.4Z" fill="${c2}"/><path d="M24.2 17.8H26.8V20.2Q26.8 21.6 25.5 22.2Q24.2 21.6 24.2 20.2Z" fill="${col}"/><path d="M25.5 17.8V22.2" stroke="${c2}" stroke-width=".4"/>`)+edgeLn(tee,tm,.22);
  /* klapy */
  const lap=(d,lt)=>`<path d="${d}" fill="${grad(lt?20:27,0,lt?23:30,0,lt?[[0,LP.s],[1,LP.l]]:[[0,LP.l],[1,LP.b]])}"/>`+clip(d,soft(lt?21.6:28.4,16,1.6,3,.4,0,lt?0:1)+`<path d="${lt?"M20.8 14L22.4 21.6":"M29.2 14L27.6 21.6"}" stroke="#d6bf94" stroke-width=".22" stroke-dasharray=".4 .3" opacity=".7"/>`)+edgeLn(d,LP,.24);
  body+=lap(`M20.4 13.4L22.9 13.1L22.2 22.6L18.6 19.8Z`,1)+lap(`M29.6 13.4L27 13.1L27.7 22.6L31.5 19.8Z`,0);
  /* pas ze stalową klamrą */
  body+=`<path d="M17 31.2Q25 32.7 33 31.2V33.2Q25 34.7 17 33.2Z" fill="${grad(0,31,0,34,[[0,"#4a3524"],[.5,"#2a1c12"],[1,"#140c08"]])}"/><rect x="23.6" y="31.5" width="2.8" height="2" rx=".3" fill="${grad(23.6,31.5,26.4,33.5,[[0,"#f0f3f7"],[.5,"#8f969f"],[1,"#d8dde3"]])}" stroke="#4a4f57" stroke-width=".2"/><rect x="24.3" y="32" width="1.4" height=".9" fill="#2a1c12"/>`;
  if(fa.stripes)body+=`<path d="M21.8 26H28.4M21.7 28.2H28.5" stroke="${c2}" stroke-width=".9" opacity=".8"/>`;
  if(fa.scarf)body+=clubScarf(col,c2,1);
  /* głowa */
  const gm=mat(hr,{h:.4}),beard=`M22.9 8.8Q23 12 25.8 12.7Q29.2 12.7 30.1 10.4Q29.4 11 28.6 10.9Q27.6 11.4 26.6 10.8Q25.4 10.2 24.5 8.7Z`,must=`M27.7 9.5Q28.9 8.9 30.2 9.6Q29.4 10.6 28.6 10.3Q28 10.5 27.7 9.5Z`;
  let hd=ear(sk,22.7,7.3,true)+headSkin(sk)+features(sk,{cauli:1,broken:1,brow:hr,bw:1.5,angry:1,noMouth:1,eye:"#5a6c7c"});
  hd+=soft(25.6,3.4,2.8,1.1,.6,0,1)+`<path d="M25.4 4.5Q27.4 3.9 29 4.5M25.6 5Q27.4 4.5 28.8 5" stroke="${skin(sk).d}" stroke-width=".2" opacity=".3" fill="none"/>`;
  hd+=`<path d="M26.3 3.9L28.1 7.3" stroke="#a85a4e" stroke-width=".38"/><path d="M26.4 3.9L28.2 7.3" transform="translate(.28 0)" stroke="#f0b8a8" stroke-width=".14" opacity=".8"/>`;
  hd+=hairStrands(`M21.4 4.6Q21.2 8.4 22.7 10.2L23.4 8.6L23 5.4Q22.2 3.6 21.4 4.6Z`,hr,7,[21.5,4.8,23,8],2);
  hd+=`<path d="${beard}" fill="${grad(22.9,0,30.1,0,[[0,gm.s],[.4,gm.b],[.8,gm.l],[1,gm.b]])}"/>`+clip(beard,Array.from({length:14},(_,i)=>`<path d="M${r2(23.2+i*.52)} ${r2(9+Math.abs(i-7)*.12)}Q${r2(23.3+i*.52)} 11 ${r2(23.7+i*.5)} 12.6" stroke="${i%2?gm.d:gm.h}" stroke-width=".16" opacity=".55" fill="none"/>`).join("")+soft(25.2,11.9,3,.9,.4))+edgeLn(beard,gm,.2);
  hd+=`<path d="${must}" fill="${grad(27.7,0,30.2,0,[[0,gm.b],[1,gm.l]])}"/>`+clip(must,`<path d="M27.9 9.8Q28.9 9.4 30 9.8M28 10.2Q28.9 9.9 29.7 10.1" stroke="${gm.d}" stroke-width=".15" opacity=".5" fill="none"/>`)+edgeLn(must,gm,.18);
  if(fa.shades)hd+=shades();
  /* stalowa rura */
  const P0=[32.4,29.8],P1=[43.8,13.4],st=mat("#8a919b",{h:.6,l:.3,s:.55});
  let wp=rod([[...P0,1.15],[...P1,1.15]],st,[[.4,.35],[.52,-.3],[.64,.45],[.76,-.2],[.88,.3]].map(([t,o])=>{const q=lerp(P0,P1,t);return`<ellipse cx="${r2(q[0]+o*.6)}" cy="${r2(q[1])}" rx=".55" ry=".4" fill="#8a4a1f" opacity=".85"/><ellipse cx="${r2(q[0]+o*.6)}" cy="${r2(q[1])}" rx=".28" ry=".2" fill="#c06a2a" opacity=".7"/>`}).join(""));
  const g0=lerp(P0,P1,0),g1=lerp(P0,P1,.28);
  wp+=rod([[g0[0],g0[1],1.32],[g1[0],g1[1],1.32]],mat("#262629",{h:.35}),Array.from({length:7},(_,i)=>{const q=lerp(g0,g1,(i+.5)/7);return`<path d="M${r2(q[0]-1.5)} ${r2(q[1]+.4)}L${r2(q[0]+1.5)} ${r2(q[1]-.4)}" stroke="#55555e" stroke-width=".22"/>`}).join(""));
  const e0=lerp(P0,P1,.9),e1=lerp(P0,P1,1.03);
  wp+=rod([[e0[0],e0[1],1.55],[e1[0],e1[1],1.55]],mat("#707780",{h:.6}),`<path d="M${r2(e0[0]-1.8)} ${r2(e0[1]+.6)}L${r2(e0[0]+1.8)} ${r2(e0[1]-.6)}M${r2((e0[0]+e1[0])/2-1.8)} ${r2((e0[1]+e1[1])/2+.6)}L${r2((e0[0]+e1[0])/2+1.8)} ${r2((e0[1]+e1[1])/2-.6)}" stroke="#2a2e34" stroke-width=".24"/>`);
  const arm=sleeve(AF,"#46321f",{m:LM,in:`<path d="M${r2(AF[0][0]+.8)} 16.6Q${r2(AF[1][0]+.8)} 21 ${r2(AF[2][0]+.6)} 26" stroke="${LP.h}" stroke-width=".7" opacity=".5" fill="none"/>`})+ring(AF,.82,.97,mat("#2a1c13",{h:.4}),{ribs:0})+`<g class="wp"><g transform="translate(0 1.2)">${wp}</g></g>`+fist(34.7,30.6,sk);
  return{legs:["jeans","#283a58","boot"],body,head:hd,arm,wide:.6}};

/* GNIAZDOWY (capo): kapelusz bucket, krzyczy, długi szalik, bluza klubowa z herbem, megafon na pasku (sprzęt), raca w uniesionej ręce */
CL["Gniazdowy"]=c=>{const{col,c2,sk,hr,fa}=c,m=mat(col);
  const AFR=[[28.3,15.1,2.45],[31.4,11.8,2.1],[33.2,8.4,1.7],[33.9,6.7,1.5]];
  let body="";
  /* megafon przy biodrze */
  const mg=mat("#ecebe6",{s:.3}),cone=`M16.4 30.6L12.8 28.6V35.2L16.4 33.4Z`;
  body+=`<path d="${cone}" fill="${grad(12.8,0,16.4,0,[[0,mg.s],[.5,mg.l],[1,mg.b]])}"/>`+clip(cone,`<path d="M14.6 29.4V34.4" stroke="${col}" stroke-width=".7"/>`+soft(15,34,3,1.2,.35))+edgeLn(cone,mg,.22)+`<ellipse cx="12.85" cy="31.9" rx=".8" ry="3.3" fill="${grad(0,28.6,0,35.2,[[0,"#d6d9de"],[1,"#7a7f87"]])}" stroke="#3a3e45" stroke-width=".22"/><ellipse cx="12.95" cy="31.9" rx=".42" ry="2.5" fill="#23262b"/>`+`<path d="M16.2 30.4H17.8V33.8H16.2Z" fill="#2a2c31" stroke="#0e0f12" stroke-width=".2"/><path d="M16.6 33.6L16.3 35.6H17.3L17.5 33.6" fill="#2a2c31" stroke="#0e0f12" stroke-width=".2"/><circle cx="17" cy="32" r=".3" fill="#d4262e"/>`;
  body+=sleeve(ARMB,col,{back:1})+ring(ARMB,.84,.97,mat(c2),{ribs:3})+fist(19.6,31.4,sk,{rot:6})+neckSk(sk);
  const T=TP();
  body+=torsoFill(m)+clip(T,torsoShade(m,32)+
    `<path d="M27 19.4H30.2V22.8Q28.6 24.4 27 22.8Z" fill="${c2}"/><path d="M27.5 19.9H29.7V22.4Q28.6 23.6 27.5 22.4Z" fill="${col}"/><path d="M28.6 19.9V23.4" stroke="${c2}" stroke-width=".35"/>`+
    fold(`M19.2 17.2Q21.6 19 23.6 22.6`,m)+fold(`M30.6 16.6Q29 18.4 27.6 20.6`,m)+fold(`M19.4 26Q21.6 27.8 24 27.2`,m)+fold(`M30.4 26.4Q28.4 28.2 26.4 27.6`,m,.9)+
    `<path d="M19 31.2Q25 32.4 31 31.2V33H19Z" fill="${m.s}"/><path d="M19.2 31.6Q25 32.8 30.8 31.6" stroke="${c2}" stroke-width=".4" opacity=".8" fill="none"/>`)+edgeLn(T,m,.26);
  body+=`<path d="M30.6 15.4L17.2 30.8" stroke="#16181c" stroke-width="1.15"/><path d="M30.4 15.7L17.3 30.7" stroke="#5a5e66" stroke-width=".25" stroke-dasharray=".4 .3"/><rect x="28.6" y="16.8" width="1.6" height="1.5" rx=".2" fill="#9aa0a8" stroke="#16181c" stroke-width=".2" transform="rotate(-40 29.4 17.5)"/>`;
  if(fa.stripes)body+=`<path d="M19 25H30.8M19 27.4H30.9" stroke="${c2}" stroke-width=".9" opacity=".8"/>`;
  body+=clubScarf(col,c2,1);
  let hd=ear(sk,22.7,7.3)+headSkin(sk,{cap:1})+features(sk,{shout:1,angry:1,brow:hr,bw:1.15})+stubbleSk(hr,.3);
  /* kapelusz bucket */
  const crown=`M21.8 4.8Q21.6 1.4 25.3 1.3Q29 1.4 29.3 4.8Z`,brim=`M19.7 4.5Q25.4 3 31.3 4.8L31.7 5.8Q25.4 4.4 19.5 5.9Z`;
  hd+=`<path d="${crown}" fill="${grad(21.6,0,29.4,0,[[0,m.d],[.3,m.s],[.65,m.l],[1,m.b]])}"/>`+clip(crown,soft(23,3.4,2,2,.4)+soft(27.6,2.4,2,.8,.4,0,1)+`<path d="M24 1.6Q23.6 3.4 23.9 5M26.8 1.5Q27.2 3.4 27.1 5" stroke="${m.d}" stroke-width=".2" opacity=".5" fill="none"/>`+`<rect x="21" y="4" width="9" height="1" fill="${c2}"/><rect x="21" y="4.1" width="9" height=".25" fill="#fff" opacity=".3"/>`)+edgeLn(crown,m,.24);
  hd+=`<path d="${brim}" fill="${grad(0,3,0,6,[[0,m.l],[.6,m.b],[1,m.s]])}"/>`+clip(brim,`<path d="M20 5.2Q25.4 3.9 31.2 5.4" stroke="${c2}" stroke-width=".45" fill="none"/>`+soft(25.5,5.8,6,.7,.5)+soft(29,4.4,2.4,.6,.35,0,1))+edgeLn(brim,m,.24);
  if(fa.shades)hd+=shades();
  /* raca */
  const fl=mat("#c4252c",{h:.4});
  let wp=`<circle cx="35.4" cy="-.4" r="9" fill="url(#f3r)"/>`;
  wp+=rod([[33.7,8.6,.85],[35.2,.2,.8]],fl,`<path d="M33.5 6.8L36 7.2L35.7 9.4L33.2 9Z" fill="#efe8d8"/><path d="M34.2 7.7L35.4 8" stroke="#c4252c" stroke-width=".3"/><path d="M34.5 2.4L35.9 2.6" stroke="#8a1218" stroke-width=".3"/>`)+rod([[35.2,.2,.9],[35.3,-.5,.9]],mat("#26262a"),"");
  wp+=`<g class="flm"><path d="M35.4 -.4Q33 -2.8 35.4 -6.4Q35.7 -4 37.4 -3.8Q38.5 -1.6 35.4 -.4Z" fill="#ff6a12"/><path d="M35.45 -.8Q34.2 -2.4 35.6 -4.4Q35.9 -2.9 36.8 -2.7Q37.1 -1.4 35.45 -.8Z" fill="#ffd24a"/><ellipse cx="35.4" cy="-.9" rx="1" ry=".8" fill="#fffbe6"/></g>`;
  wp+=[[38.2,-4],[32.8,-3.4],[37.4,-6.6],[34,-7.6],[39.2,-5.4],[32.2,-5.6]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${r2(.12+i%3*.05)}" fill="${["#ffd24a","#ffb14a","#fff0a0"][i%3]}"/>`).join("");
  wp+=[[33.9,-7.4,1.6,.4],[32.4,-9.4,2.1,.3],[30.2,-11.2,2.6,.2],[27.6,-12.4,3,.12]].map(([x,y,r,o])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#cfc7c2" opacity="${o}"/><circle cx="${r2(x+r*.3)}" cy="${r2(y-r*.3)}" r="${r2(r*.55)}" fill="#e8e2dd" opacity="${r2(o*.8)}"/>`).join("");
  const arm=`<g class="wp" style="transform-origin:33.9px 6.7px">${wp}</g>`+sleeve(AFR,col)+ring(AFR,.8,.97,mat(c2),{ribs:3})+fist(33.9,6.6,sk,{rot:-70});
  return{legs:["jeans","#2f4468","terrace"],body,head:hd,arm,acc:c2}};

/* CZUJKA: anorak z kapturem (pół-zamek, kieszeń kangurka), komin na twarzy, czujne oczy, wąskie dresy z lampasami,
   łańcuch rowerowy owinięty na dłoni, buty biegowe z neonową pianką (sprzęt) */
CL["Czujka"]=c=>{const{col,c2,sk,hr,fa}=c,m=mat(col);
  const AB=ARMB.map(q=>[q[0]+.7,q[1],q[2]*.9]),AF=ARMF.map(q=>[q[0]-.7,q[1],q[2]*.9]);
  const T=TP({sl:19.3,sr:30.6,wl:20,wr:29.9,hl:19.5,hr:30.4,hy:31.8});
  let body=sleeve(AB,col,{back:1,in:`<path d="${edgePath(AB,.6)}" stroke="${c2}" stroke-width=".5" fill="none"/>`})+ring(AB,.84,.97,mat("#17191e"),{ribs:3})+fist(20.1,31.2,sk,{rot:6})+neckSk(sk);
  body+=torsoFill(m,19.3,30.6,T)+clip(T,torsoShade(m,31.8)+
    `<path d="M24.8 12.8V30" stroke="#1a1c21" stroke-width=".5"/><path d="M24.8 13V30" stroke="#d4d7dc" stroke-width=".26" stroke-dasharray=".22 .22"/>`+
    `<path d="M21 25.2H28.8L29.6 30.6H20.2Z" fill="${m.s}" opacity=".7"/><path d="M21.2 25.6H28.6M20.4 30.2H29.4" stroke="${m.h}" stroke-width=".18" stroke-dasharray=".3 .25" opacity=".6"/><path d="M21 25.2L20.3 30.6M28.8 25.2L29.5 30.6" stroke="${m.d}" stroke-width=".4" opacity=".7"/>`+
    fold(`M19.8 17.6Q21.6 19.4 23.4 19`,m)+fold(`M30 17.2Q28.8 18.8 27.4 18.6`,m)+fold(`M20.4 22.6Q22.4 24 24.2 23.4`,m,.8)+
    `<path d="M19.6 31Q25 32.1 30.4 31V32.2H19.6Z" fill="#17191e"/>`)+edgeLn(T,m,.26);
  body+=`<path d="M25 12.9V17.4" stroke="${c2}" stroke-width=".5"/><rect x="24.55" y="16.6" width=".9" height="1.3" rx=".3" fill="#d4d7dc" stroke="#14161b" stroke-width=".14"/>`;
  if(fa.stripes)body+=`<path d="M19.6 22.6H30.4M19.8 24.8H30.2" stroke="${c2}" stroke-width=".9" opacity=".8"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  /* głowa pod kapturem */
  let hd=ear(sk,22.7,7.3)+headSkin(sk,{cap:1})+features(sk,{noNose:1,noMouth:1,eye:"#3a4a32",brow:hr,bw:1,angry:1});
  const gm=mat("#1f2126",{h:.3}),mask=`M23.3 7.5Q27 7.1 31 7.3L31.3 9.5Q31.4 12.4 28.6 13.2Q25 13.6 23 11.2Z`;
  hd+=`<path d="${mask}" fill="${grad(23,0,31.3,0,[[0,gm.d],[.4,gm.b],[.8,gm.l],[1,gm.b]])}"/>`+clip(mask,Array.from({length:8},(_,i)=>`<path d="M${r2(24+i*.9)} 7V14" stroke="${gm.d}" stroke-width=".16" opacity=".6"/><path d="M${r2(24.4+i*.9)} 7V14" stroke="${gm.h}" stroke-width=".1" opacity=".4"/>`).join("")+soft(30,9.4,1.2,1.4,.4,0,1)+soft(26,12.4,4,1,.45))+edgeLn(mask,gm,.22);
  /* kaptur */
  const hm=mat(col,{s:.46}),hood=`M20 8.2Q19.2 1.2 25.2 1Q31.4 1.2 31.6 7.6L31 11.6Q29 14.4 25 13.8Q21 13.2 20 8.2ZM24.4 4.6Q29.6 4 30.4 7.4L30.8 9.4L30.3 11.4Q28 12.6 25.2 11.8Q23.6 8 24.4 4.6Z`,hid=nid();
  hd+=`<path d="${hood}" fill-rule="evenodd" fill="${grad(19.4,0,31.6,0,[[0,hm.d],[.3,hm.s],[.6,hm.l],[1,hm.b]])}"/><clipPath id="${hid}"><path d="${hood}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${hid})">${soft(22.4,7,2,6.4,.4)+soft(28.4,2,3,1.4,.4,0,1)+`<path d="M24.4 4.6Q29.6 4 30.4 7.4L30.8 9.4L30.3 11.4Q28 12.6 25.2 11.8Q23.6 8 24.4 4.6Z" fill="none" stroke="${hm.d}" stroke-width="1.2" opacity=".75"/><path d="M21.7 4.4Q20.8 9.6 22.8 13.4" stroke="${hm.d}" stroke-width=".3" fill="none" opacity=".6"/>`}</g><path d="${hood}" fill="none" stroke="${mix(hm.d,"#000",.4)}" stroke-width=".26" fill-rule="evenodd" opacity=".62"/>`;
  hd+=`<path d="M23.4 13.4L23 16.6M24 13.6L23.8 17" stroke="${c2}" stroke-width=".34"/><rect x="22.6" y="16.3" width=".8" height=".95" rx=".28" fill="#2a2d33"/><rect x="23.4" y="16.8" width=".8" height=".95" rx=".28" fill="#2a2d33"/>`;
  if(fa.shades)hd+=shades();
  /* łańcuch rowerowy */
  const A=[34,29.2],B=[43.2,31.8],C=[39.4,38.6];let wp="";
  for(let i=0;i<=17;i++){const t=i/17,x=(1-t)*(1-t)*A[0]+2*(1-t)*t*B[0]+t*t*C[0],y=(1-t)*(1-t)*A[1]+2*(1-t)*t*B[1]+t*t*C[1],dx=2*(1-t)*(B[0]-A[0])+2*t*(C[0]-B[0]),dy=2*(1-t)*(B[1]-A[1])+2*t*(C[1]-B[1]),an=r2(Math.atan2(dy,dx)*180/Math.PI),X=r2(x),Y=r2(y);
    wp+=i%2?`<g transform="rotate(${an} ${X} ${Y})"><rect x="${r2(X-.6)}" y="${r2(Y-.22)}" width="1.2" height=".44" rx=".2" fill="${grad(0,Y-.3,0,Y+.3,[[0,"#c9ced5"],[1,"#5a5f66"]])}" stroke="#25282d" stroke-width=".14"/></g>`:`<g transform="rotate(${an} ${X} ${Y})"><rect x="${r2(X-.7)}" y="${r2(Y-.45)}" width="1.4" height=".9" rx=".44" fill="none" stroke="#25282d" stroke-width=".5"/><rect x="${r2(X-.7)}" y="${r2(Y-.45)}" width="1.4" height=".9" rx=".44" fill="none" stroke="#c9ced5" stroke-width=".2"/><circle cx="${X}" cy="${Y}" r=".14" fill="#5a5f66"/></g>`}
  const arm=sleeve(AF,col,{in:`<path d="${edgePath(AF,-.6)}" stroke="${c2}" stroke-width=".5" fill="none"/>`})+ring(AF,.84,.97,mat("#17191e"),{ribs:3})+`<g class="wp"><g transform="translate(0 1.2)">${wp}</g></g>`+fist(33.6,30.4,sk)+`<path d="M32.4 29.8Q33.8 31.8 35.2 30.4M32.3 31Q33.6 32.6 35 31.6" stroke="#25282d" stroke-width=".5" fill="none"/><path d="M32.4 29.8Q33.8 31.8 35.2 30.4M32.3 31Q33.6 32.6 35 31.6" stroke="#b9bec5" stroke-width=".22" fill="none" stroke-dasharray=".5 .3"/>`;
  return{legs:["track","#1d2026","runner"],body,head:hd,arm,acc:"#c6f432"}};

/* BOJÓWKARZ: czarny blok – kominiarka z dzianiny, ciemna bluza z kapturem, opaska klubowa, mapa dzielnic w kieszeni (sprzęt),
   taktyczne rękawice, kij bejsbolowy, bojówki, glany */
CL["Bojówkarz"]=c=>{const{col,c2,sk,fa}=c,DK=mix(col,"#15161a",.88),m=mat(DK,{h:.2});
  const AB=ARMB.map(q=>[q[0]-.4,q[1]+.1,q[2]*1.07]),AF=ARMF.map(q=>[q[0]+.4,q[1]+.1,q[2]*1.07]);
  const T=TP({sl:18.3,sr:31.4,wl:19.1,wr:30.8,hl:18.4,hr:31.4,hy:32.5});
  let body=sleeve(AB,DK,{back:1,m:{h:.2}})+ring(AB,.84,.97,mat(mix(DK,"#000",.25)),{ribs:3})+fist(19.4,31.6,sk,{glove:1,rot:6})+neckSk(sk);
  body+=torsoFill(m,18.3,31.4,T)+clip(T,torsoShade(m,32.5)+
    `<path d="M19.6 25.4H29.8L31 31.8H18.4Z" fill="${mix(DK,"#000",.2)}" opacity=".8"/><path d="M20.4 25.4L19.2 31.4M29 25.4L30.2 31.4" stroke="${m.h}" stroke-width=".22" opacity=".45"/><path d="M19.8 25.9H29.6M18.7 31.4H30.9" stroke="${m.h}" stroke-width=".18" stroke-dasharray=".3 .25" opacity=".55"/>`+
    fold(`M19.2 17.4Q21.4 19.2 23.2 22.8`,m)+fold(`M31 17.2Q29.4 19 28 21.4`,m)+fold(`M19.4 24Q21.6 25 24 24.4`,m,.8)+
    `<path d="M18.4 31.9Q25 33.2 31.4 31.9V33.4H18.4Z" fill="${mix(DK,"#000",.25)}"/>`)+edgeLn(T,m,.26);
  /* mapa wystająca z kieszeni */
  const mp=`M20.6 27.2L22.6 23.6L25.4 25.2L23.6 27.6Z`;
  body+=`<path d="${mp}" fill="${grad(20.6,23.6,25.4,27.6,[[0,"#f4ecd6"],[1,"#cfc3a0"]])}"/>`+clip(mp,`<path d="M21.4 25.6L24.2 26.6M22.6 23.6L23.2 26.8" stroke="#b0a27c" stroke-width=".18"/><path d="M21.2 26.6Q22.4 24.8 23.4 25.8T24.6 25.5" stroke="#c4252c" stroke-width=".34" fill="none" stroke-dasharray=".4 .2"/><circle cx="24.5" cy="25.5" r=".3" fill="#c4252c"/>`)+edgeLn(mp,{d:"#6a5e3c"},.2);
  /* kaptur zsunięty na kark */
  const hb=`M19.4 13.2Q19.2 17.6 23.4 17.9L29 17.7Q30.2 15.6 29 13.4Q24.2 16.6 19.4 13.2Z`;
  body+=`<path d="${hb}" fill="${grad(19,0,30,0,[[0,m.d],[.5,m.s],[1,m.b]])}"/>`+clip(hb,`<path d="M20.4 14.4Q24.2 17.2 28.6 14.6" stroke="${col}" stroke-width=".9" fill="none"/>`+soft(24,16.6,4,1.2,.4))+edgeLn(hb,m,.22);
  body+=`<path d="M23 17.8L22.8 23.6M26 17.8L26.4 23.8" stroke="${col}" stroke-width=".42"/><rect x="22.45" y="23.4" width=".7" height="1.1" rx=".2" fill="#c9ced6"/><rect x="26.05" y="23.6" width=".7" height="1.1" rx=".2" fill="#c9ced6"/>`;
  if(fa.stripes)body+=`<path d="M18.6 22.4H31.2" stroke="${c2}" stroke-width=".9" opacity=".8"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  /* kominiarka */
  const bm=mat("#1c1d22",{h:.2,l:.18}),bal=HEAD;
  let hd=`<path d="M22.6 9.8L22.9 13.4L27.8 13.6L27.4 11Z" fill="${grad(22.6,0,27.8,0,[[0,bm.d],[.5,bm.s],[1,bm.b]])}"/>`;
  hd+=`<path d="${bal}" fill="${grad(21.4,0,30.4,0,[[0,bm.d],[.3,bm.s],[.7,bm.l],[1,bm.b]])}"/>`+clip(bal,
    Array.from({length:14},(_,i)=>`<path d="M${r2(21.6+i*.65)} 2V12" stroke="${bm.d}" stroke-width=".2" opacity=".7"/><path d="M${r2(21.95+i*.65)} 2V12" stroke="${bm.h}" stroke-width=".12" opacity=".45"/>`).join("")+
    soft(23,7,2,5,.4)+soft(27.6,3.8,2.6,1.2,.4,0,1)+soft(27,11.6,4,1,.45))+edgeLn(bal,bm,.26);
  const slit=`M25.2 5.6Q27.8 5.1 30.2 5.8V7.6Q27.8 7.9 25.2 7.6Z`,sm=skin(sk);
  hd+=`<path d="${slit}" fill="${grad(25.2,0,30.2,0,[[0,sm.s],[.4,sm.b],[1,sm.l]])}"/>`+clip(slit,soft(27,5.4,3,.8,.5)+soft(27.4,7.8,3,.7,.35))+edgeLn(slit,sm,.2);
  hd+=features(sk,{noNose:1,noMouth:1,brow:"#1b1410",bw:.9,angry:1});
  if(fa.shades)hd+=`<path d="M26.1 5.9H30V7.4Q29.2 7.9 27.8 7.7Q26.6 7.7 26.1 7.2Z" fill="#0a0a0d"/>`;
  /* kij bejsbolowy */
  const P0=[31.4,32.6],P1=[45.4,10.8],bw=mat("#c4915a",{h:.5,l:.3,s:.5});
  const sp2=[[...P0,.55],[...lerp(P0,P1,.4),.6],[...lerp(P0,P1,.66),.95],[...lerp(P0,P1,.9),1.3],[...lerp(P0,P1,1),1.35]];
  let wp=rod(sp2,bw,[[.6,.3],[.68,-.2],[.76,.5],[.84,-.4],[.92,.2]].map(([t,o])=>{const q=lerp(P0,P1,t);return`<path d="M${r2(q[0]+o)} ${r2(q[1])}l.6 -.9" stroke="#8a5c32" stroke-width=".16" opacity=".6"/>`}).join("")+[[.74,.7],[.82,-.6],[.9,.4]].map(([t,o])=>{const q=lerp(P0,P1,t);return`<ellipse cx="${r2(q[0]+o)}" cy="${r2(q[1])}" rx=".35" ry=".22" fill="#4a2c14" opacity=".6"/>`}).join(""));
  const g0=lerp(P0,P1,.04),g1=lerp(P0,P1,.33);
  wp+=rod([[g0[0],g0[1],.68],[g1[0],g1[1],.66]],mat("#18181b",{h:.3}),Array.from({length:8},(_,i)=>{const q=lerp(g0,g1,(i+.5)/8);return`<path d="M${r2(q[0]-.8)} ${r2(q[1]+.3)}L${r2(q[0]+.8)} ${r2(q[1]-.3)}" stroke="#44444c" stroke-width=".2"/>`}).join(""));
  const k0=lerp(P0,P1,-.02);wp+=`<ellipse cx="${k0[0]}" cy="${k0[1]}" rx="1.05" ry=".8" transform="rotate(${r2(Math.atan2(P1[1]-P0[1],P1[0]-P0[0])*180/Math.PI)} ${k0[0]} ${k0[1]})" fill="${grad(k0[0]-1,k0[1]-1,k0[0]+1,k0[1]+1,[[0,"#8a5c32"],[1,"#3a2410"]])}" stroke="#2a1608" stroke-width=".3"/>`;
  const ab=ring(AF,.16,.3,mat(col),{});
  const arm=sleeve(AF,DK,{m:{h:.2}})+ab+`<path d="${band(AF,.2,.24,1.1)}" fill="${c2}" opacity=".9"/>`+ring(AF,.84,.97,mat(mix(DK,"#000",.25)),{ribs:3})+`<g class="wp"><g transform="translate(0 1.2)">${wp}</g></g>`+fist(34.6,31,sk,{glove:1});
  return{legs:["cargo","#2f3329","boot"],body,head:hd,arm,wide:.3}};

/* ---------- składanie ---------- */
function fig3(cls,col,flip,k,fa,c2){
  fa=fa||{};c2=c2||"#ffffff";k=k||0;DEFS=[];
  RD=rgrad([[0,"#0a0508",1],[.5,"#0a0508",.45],[1,"#0a0508",0]]);RL=rgrad([[0,"#fff6e4",1],[.5,"#fff6e4",.4],[1,"#fff6e4",0]]);
  const SKN=["#e3b18d","#c58d67","#f0caa6","#9b6c4c","#d8a47f"],HRN=["#2a1d14","#16120f","#5a3b22","#121212","#3a2a1c"];
  const fn=CL[cls]||CL["Prowodyr"],sk=SKN[k%5],hr=HRN[k%5];
  const p=fn({col,c2,sk,hr,fa,k}),[ptype,pcol,stype]=p.legs,w=p.wide||0;
  const LB=LEGB.map(q=>[q[0]-w*.5,q[1],q[2]*(1+w*.12)]),LF=LEGF.map(q=>[q[0]+w*.4,q[1],q[2]*(1+w*.12)]);
  const scol=fa.shoes?col:null,acc=stype==="runner"?"#c6f432":fa.shoes?"#f0efea":(p.acc||"#9aa1ab");
  const inner=`<ellipse cx="24.8" cy="57.9" rx="12" ry="1.9" fill="${RD}" opacity=".7"/><ellipse cx="24.6" cy="57.8" rx="7" ry="1" fill="${RD}" opacity=".6"/>
<g class="lg2">${pants(LB,pcol,ptype,c2,1)}${shoe(stype,-7.2,scol,acc)}</g>
<g class="lg1">${pants(LF,pcol,ptype,c2)}${shoe(stype,0,scol,acc)}</g>
<g class="bd">${pelvis(pcol,ptype)}${p.body}<g transform="translate(25.4 11) scale(1.1) translate(-25.4 -11)">${p.head}</g><g class="arf">${p.arm}</g></g>`;
  const defs=DEFS.join("");
  return`<svg viewBox="0 0 48 60" width="48" height="60" style="overflow:visible" aria-hidden="true"><defs>${defs}</defs>${flip?`<g transform="translate(48 0) scale(-1 1)">${inner}</g>`:inner}</svg>`;
}
G.fig3=fig3;G.FIG3_CLASSES=Object.keys(CL);
})(typeof window!=="undefined"?window:globalThis);
