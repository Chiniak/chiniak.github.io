/* Ekipy – modele postaci v2 (SVG 48x60, zgodne z animacjami gry:
   .lg2 noga tylna, .lg1 noga przednia, .bd tułów, .arf ramię przednie, .wp broń, .flm płomień)
   Zasady: światło z przodu-góry (z prawej), cień twardy podążający za bryłą, cień kontaktowy,
   chłodna poświata na krawędzi, kontur w ciemnym odcieniu koloru, cienkie linie wewnętrzne. */
(function(G){
let UID=0;
const r2=v=>Math.round(v*100)/100,f=p=>r2(p[0])+" "+r2(p[1]);
const hex=c=>{c=String(c||"").trim();if(!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c))c="#d62839";if(c.length===4)c="#"+c[1]+c[1]+c[2]+c[2]+c[3]+c[3];return[1,3,5].map(i=>parseInt(c.substr(i,2),16))};
const mix=(a,b,t)=>{const A=hex(a),B=hex(b);return"#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join("")};
const lum=c=>{const[r,g,b]=hex(c);return(.299*r+.587*g+.114*b)/255};
/* paleta materiału: baza, cień, głęboki cień, światło, poświata, kontur */
function pal(c,m){m=m||{};const dark=lum(c)<.18;
  return{b:c,s:mix(c,"#2a1d4f",m.s||.4),d:mix(c,"#120b24",m.d||.62),h:mix(c,"#fff4dc",m.h||(dark?.18:.3)),r:mix(c,"#a9d4ff",dark?.35:.5),o:mix(c,"#0b0910",.78)};}
/* część z cieniowaniem przyciętym do własnego kształtu */
function part(d,P,o){o=o||{};const id="k"+(++UID);let s=`<path d="${d}" fill="${P.b}"/>`;
  const inner=(o.sh||[]).map(x=>`<path d="${x}" fill="${P.s}"/>`).join("")+(o.dp||[]).map(x=>`<path d="${x}" fill="${P.d}"/>`).join("")+(o.hi||[]).map(x=>`<path d="${x}" fill="${P.h}"/>`).join("")+(o.rim||[]).map(x=>`<path d="${x}" stroke="${P.r}" stroke-width="${o.rw||.45}" fill="none" stroke-linecap="round" opacity=".75"/>`).join("")+(o.ln||[]).map(x=>`<path d="${x}" stroke="${o.lc||P.d}" stroke-width="${o.lw||.28}" fill="none" stroke-linecap="round"/>`).join("")+(o.extra||"");
  if(inner)s+=`<clipPath id="${id}"><path d="${d}"/></clipPath><g clip-path="url(#${id})">${inner}</g>`;
  return o.ow===0?s:s+`<path d="${d}" fill="none" stroke="${P.o}" stroke-width="${o.ow||.55}" stroke-linejoin="round"/>`;}
/* kończyna: kręgosłup [[x,y,promień]...] -> kształt z objętością (Catmull-Rom) */
const cr=(a,b,c,d,t)=>{const t2=t*t,t3=t2*t;return[0,1,2].map(i=>.5*(2*b[i]+(-a[i]+c[i])*t+(2*a[i]-5*b[i]+4*c[i]-d[i])*t2+(-a[i]+3*b[i]-3*c[i]+d[i])*t3))};
function dense(sp){const P=[],N=sp.length;for(let i=0;i<N-1;i++){const a=sp[Math.max(0,i-1)],b=sp[i],c=sp[i+1],d=sp[Math.min(N-1,i+2)];for(let s=0;s<6;s++)P.push(cr(a,b,c,d,s/6))}P.push(sp[N-1]);return P}
function norms(P){return P.map((p,i)=>{const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)];let dx=b[0]-a[0],dy=b[1]-a[1];const l=Math.hypot(dx,dy)||1;return[-dy/l,dx/l]})}
function tube(sp,cap){const P=dense(sp),N=norms(P);const L=P.map((p,i)=>[p[0]+N[i][0]*p[2],p[1]+N[i][1]*p[2]]),R=P.map((p,i)=>[p[0]-N[i][0]*p[2],p[1]-N[i][1]*p[2]]);
  const e=P[P.length-1],s=P[0];
  return `M${f(L[0])}`+L.slice(1).map(q=>"L"+f(q)).join("")+(cap===false?`L${f(R[R.length-1])}`:`A${r2(e[2])} ${r2(e[2])} 0 0 0 ${f(R[R.length-1])}`)+R.slice(0,-1).reverse().map(q=>"L"+f(q)).join("")+(cap===false?"":`A${r2(s[2])} ${r2(s[2])} 0 0 0 ${f(L[0])}`)+"Z"}
function shift(sp,k,m){const N=norms(sp);return sp.map((p,i)=>[p[0]+N[i][0]*p[2]*k,p[1]+N[i][1]*p[2]*k,p[2]*m])}
function edge(sp,k){const P=dense(sp),N=norms(P);return "M"+P.map((p,i)=>f([p[0]+N[i][0]*p[2]*k,p[1]+N[i][1]*p[2]*k])).join("L")}
function limb(sp,P,o){o=o||{};return part(tube(sp,o.cap),P,{sh:[tube(shift(sp,.75,.75))].concat(o.sh||[]),dp:o.dp,hi:[tube(shift(sp,-.62,.22))].concat(o.hi||[]),rim:[edge(sp,.92)],ln:o.ln,lc:o.lc,ow:o.ow,extra:o.extra})}
const at=(sp,t)=>{const P=dense(sp),i=Math.min(P.length-1,Math.max(0,Math.round(t*(P.length-1))));return P[i]};
const band=(sp,t0,t1,k)=>{const a=at(sp,t0),b=at(sp,t1),r=a[2]*(k||1.03);return tube([[a[0],a[1],r],[b[0],b[1],b[2]*(k||1.03)]],false)};

/* ---------- dłonie ---------- */
function fist(x,y,sk,o){o=o||{};const P=o.glove?pal("#1e1f24"):pal(sk,{s:.3,h:.25}),a=o.rot||0;
  const d=`M${x-1.7} ${y-1.5}Q${x-.2} ${y-2.6} ${x+1.6} ${y-1.7}Q${x+2.3} ${y-.4} ${x+2} ${y+1.1}Q${x+.6} ${y+2.4} ${x-1.3} ${y+1.8}Q${x-2.2} ${y+.4} ${x-1.7} ${y-1.5}Z`;
  let s=part(d,P,{sh:[`M${x-2.4} ${y-.6}Q${x-.4} ${y+.6} ${x+.2} ${y+2.6}L${x-2.4} ${y+2.6}Z`],hi:[`M${x+.2} ${y-2.2}Q${x+1.6} ${y-1.9} ${x+1.9} ${y-.9}Q${x+1} ${y-1.3} ${x+.2} ${y-2.2}Z`],ln:[`M${x+1.9} ${y-.85}H${x+.7}`,`M${x+2.05} ${y+.15}H${x+.8}`,`M${x+1.8} ${y+1}H${x+.8}`,`M${x-1.1} ${y+.2}Q${x+.1} ${y-.5} ${x+.9} ${y+1.1}`],ow:.45});
  if(o.glove)s+=`<path d="M${x+.3} ${y-2.15}Q${x+1.7} ${y-1.9} ${x+2.15} ${y-.2}" stroke="#4a4c55" stroke-width="1" fill="none" stroke-linecap="round"/><path d="M${x+.9} ${y-1.9}V${y-1.1}M${x+1.6} ${y-1.5}V${y-.7}" stroke="#2a2b30" stroke-width=".22"/>`;
  return a?`<g transform="rotate(${a} ${x} ${y})">${s}</g>`:s;}

/* ---------- głowa (3/4, twarzą w prawo): czaszka-koło, żuchwa ~15°, kość policzkowa przy podstawie nosa ---------- */
const HEAD=`M21.2 7.4C21.2 4.6 23 3.3 25 3.3C27.6 3.3 28.9 4.8 28.9 6.8L29.2 7.8L30.4 9.5L29.5 10L29.75 10.6L29.4 11.1L29.55 11.75C29.25 12.85 28 13.45 26.8 13.35C25.2 13.2 23.6 12.3 22.6 11.2C21.6 10 21.2 8.8 21.2 7.4Z`;
function head(sk,o){o=o||{};const P=pal(sk,{s:.34,d:.55,h:.22});
  const side=`M20 2H25.3Q25.9 5.2 25.6 7.1Q26.4 8.6 26.1 9.9Q26.7 11.6 26.5 14H20Z`;
  const sock=`M25.7 6.9Q27.3 6.5 28.8 7Q28.4 8.4 27.2 8.6Q26.1 8.4 25.7 6.9Z`;
  const under=`M22.6 11.2Q25 13.1 27.2 12.9Q28.9 12.6 29.5 11.75Q29.3 13.2 27.6 13.6Q24.4 13.9 22.6 11.2Z`;
  let s=part(HEAD,P,{sh:[side,sock],dp:[under,`M29.6 9.95Q29.2 10.4 28.7 10.3L29.2 9.9Z`],hi:[`M27 4.2Q28.6 4.8 28.7 6.2Q27.8 5.1 27 4.2Z`,`M29.5 8.4L30.2 9.4L29.7 9.3Z`,`M27.6 9.6Q28.3 9.9 28.6 10.4Q27.9 10.3 27.6 9.6Z`],rim:[`M21.25 7.6C21.3 5 22.8 3.6 24.6 3.4`],ln:o.wr?[`M25.8 5.1Q27.3 4.7 28.5 5.2`,`M25.7 5.8Q27.1 5.4 28.6 5.9`,`M27.9 10.6Q28.4 11.2 28.4 11.8`]:[],ow:.5});
  if(o.cauli)s+=part(`M22.2 7.9Q23.5 7.3 24 8.5Q24.4 9.4 23.7 10.2Q24 11 23 11.1Q21.8 10.9 22 9.7Q21.6 8.8 22.2 7.9Z`,P,{sh:[`M21.4 8.8Q22.8 9.8 23.4 11.4H21Z`],ln:[`M22.7 8.6Q23.4 8.9 23.1 9.6`,`M22.7 10Q23.2 10.1 23.3 10.5`],ow:.4});
  else s+=part(`M22.4 7.9Q23.9 7.7 24 9.1Q24 10.6 22.8 10.9Q22 10.9 22 9.9Q21.8 8.6 22.4 7.9Z`,P,{sh:[`M21.6 8.6Q22.9 9.4 23.3 11.2H21.6Z`],ln:[`M22.8 8.5Q23.5 8.9 23.3 9.8Q23 10.3 22.6 10.2`],ow:.4});
  if(!o.noEyes){
    s+=`<path d="M25.95 8.05Q26.7 7.4 27.65 7.9Q26.85 8.5 25.95 8.05Z" fill="#efe9e0"/><circle cx="26.95" cy="7.98" r=".4" fill="${o.eye||"#4a3426"}"/><circle cx="27" cy="7.98" r=".19" fill="#060606"/><circle cx="26.85" cy="7.84" r=".09" fill="#fff"/><path d="M25.9 8Q26.7 7.3 27.75 7.85" stroke="#1d120c" stroke-width=".3" fill="none" stroke-linecap="round"/><path d="M26.1 8.35Q26.8 8.6 27.5 8.25" stroke="${P.s}" stroke-width=".22" fill="none"/>`;
    s+=`<path d="M28.55 8Q28.95 7.55 29.3 7.85Q29 8.3 28.55 8Z" fill="#e6dfd5"/><circle cx="29" cy="7.93" r=".24" fill="${o.eye||"#4a3426"}"/><path d="M28.5 7.95Q28.95 7.45 29.35 7.8" stroke="#1d120c" stroke-width=".26" fill="none"/>`;
    const by=o.angry?.35:0;
    s+=`<path d="M25.6 6.95Q26.8 ${6.35+by} 28.1 ${6.75+by*1.3}" stroke="${o.brow}" stroke-width="${o.bw||.62}" fill="none" stroke-linecap="round"/><path d="M28.6 ${6.85+by*1.2}Q29.1 ${6.7+by} 29.4 ${6.9+by}" stroke="${o.brow}" stroke-width="${(o.bw||.62)*.75}" fill="none" stroke-linecap="round"/>`;
  }
  if(!o.noNose)s+=`<path d="M28.95 7.4${o.broken?"Q29.7 8 29.35 8.5":""}L30.4 9.5Q29.9 10.05 29.2 9.95" stroke="${P.d}" stroke-width=".32" fill="none" stroke-linejoin="round"/><path d="M28.6 9.55Q28.9 10.1 29.5 10" stroke="${P.d}" stroke-width=".26" fill="none"/>`;
  if(o.shout)s+=`<path d="M27.3 10.75Q28.5 10.35 29.6 10.7Q29.5 12.5 28.4 12.65Q27.5 12.4 27.3 10.75Z" fill="#2e0f0c" stroke="${P.o}" stroke-width=".3"/><path d="M27.5 10.85Q28.5 10.6 29.45 10.8" stroke="#f1ece2" stroke-width=".42" fill="none"/><path d="M27.8 12.1Q28.4 12.3 28.95 12.05" stroke="#b34650" stroke-width=".4" fill="none"/>`;
  else if(!o.noMouth)s+=`<path d="M27.7 11.05Q28.6 11.25 29.45 10.95" stroke="#5e2a22" stroke-width=".42" fill="none" stroke-linecap="round"/><path d="M27.7 11.05L27.45 10.9" stroke="#5e2a22" stroke-width=".3"/><path d="M28.1 11.6Q28.7 11.75 29.2 11.55" stroke="${P.h}" stroke-width=".3" fill="none"/>`;
  return s;}
function stubble(c,a){return `<path d="M23.4 10.4Q24.6 12.9 27 12.95Q29 12.7 29.5 11.7L29.4 11.1Q28.6 11.6 27.6 11.45Q26.4 11.5 25.6 10.6Q24.6 10.9 23.4 10.4Z" fill="${c}" opacity="${a}"/><path d="M27.5 10.65Q28.6 10.45 29.55 10.65" stroke="${c}" stroke-opacity="${a*1.4}" stroke-width=".5" fill="none"/>`}
function neck(sk){const P=pal(sk,{s:.4});return part(`M22.8 11.4H26.6L26.9 16.6H22.5Z`,P,{sh:[`M22 11H24.4L24.2 17H22Z`],dp:[`M22.5 11.6Q24.8 13.6 27 12.9V14.2Q24.6 15 22.5 13.8Z`],ow:.45})}
function shades(){return `<path d="M25.6 7.35H29.5V8.3Q29.1 9.2 27.7 9.05Q26.3 9.05 25.6 8.5Z" fill="#0b0b0e"/><path d="M25.6 7.55L22.9 8.1" stroke="#0b0b0e" stroke-width=".5"/><path d="M26.1 7.7Q27 7.6 27.8 7.8" stroke="#8fb8ff" stroke-opacity=".6" stroke-width=".3" fill="none"/>`}

/* ---------- nogi i buty (ciężar na tylnej nodze, przednia lekko wysunięta) ---------- */
const LEGB=[[21.4,35.2,2.85],[20.9,40.4,2.5],[20.7,45.4,2.15],[20.5,50,1.85],[20.4,53.6,1.75]];
const LEGF=[[27,35.2,2.95],[27.6,40.4,2.6],[28.2,45.2,2.25],[28.4,50,1.9],[28.6,53.7,1.8]];
function pants(sp,col,type,c2,back){const P=pal(col,{s:.42});let ln=[],extra="";
  const k=at(sp,.5),a=at(sp,.93),b=at(sp,.98);
  ln.push(`M${r2(k[0]-1.6)} ${r2(k[1]-.4)}Q${r2(k[0])} ${r2(k[1]+.5)} ${r2(k[0]+1.8)} ${r2(k[1]-.2)}`);
  ln.push(`M${r2(a[0]-1.6)} ${r2(a[1]-.5)}Q${r2(a[0]-.2)} ${r2(a[1]+.4)} ${r2(a[0]+1.6)} ${r2(a[1]-.4)}`,`M${r2(b[0]-1.5)} ${r2(b[1]-.2)}Q${r2(b[0]+.2)} ${r2(b[1]+.5)} ${r2(b[0]+1.6)} ${r2(b[1])}`);
  if(type==="jeans"){extra=`<path d="${edge(sp,-.55)}" stroke="#d8b06a" stroke-opacity=".55" stroke-width=".22" stroke-dasharray=".35 .25" fill="none"/>`;
    const t=at(sp,.99);extra+=`<path d="M${r2(t[0]-2)} ${r2(t[1]-.9)}H${r2(t[0]+2.2)}V${r2(t[1]+.6)}H${r2(t[0]-2)}Z" fill="${P.s}"/><path d="M${r2(t[0]-2)} ${r2(t[1]-.9)}H${r2(t[0]+2.2)}" stroke="${P.h}" stroke-width=".3"/>`;}
  if(type==="track")extra=`<path d="${edge(sp,-.78)}" stroke="${c2}" stroke-width=".55" fill="none"/><path d="${edge(sp,-.5)}" stroke="${c2}" stroke-width=".32" fill="none" opacity=".85"/>`;
  if(type==="cargo"){const p=at(sp,.36);extra=`<path d="M${r2(p[0]-.6)} ${r2(p[1]-1.6)}H${r2(p[0]+2.6)}L${r2(p[0]+2.4)} ${r2(p[1]+2.6)}H${r2(p[0]-.5)}Z" fill="${P.s}" stroke="${P.o}" stroke-width=".3"/><path d="M${r2(p[0]-.7)} ${r2(p[1]-1.7)}H${r2(p[0]+2.7)}L${r2(p[0]+2.6)} ${r2(p[1]-.4)}H${r2(p[0]-.6)}Z" fill="${P.b}" stroke="${P.o}" stroke-width=".3"/><circle cx="${r2(p[0]+1)}" cy="${r2(p[1]-1)}" r=".22" fill="${P.d}"/>`;}
  let s=limb(sp,P,{ln,extra,cap:false});
  if(back)s+=`<path d="${tube(sp,false)}" fill="#0c0a18" opacity=".28"/>`;
  return s;}
function shoe(t,dx,col,acc){const X=v=>r2(v+dx);let s="";
  if(t==="boot"){const P=pal("#1f1c1a",{h:.22});
    s+=part(`M${X(25.6)} 51.4H${X(30.3)}L${X(30.5)} 53.3Q${X(34.4)} 53.6 ${X(35.2)} 55.5V56.4H${X(25.2)}Z`,P,{sh:[`M${X(24)} 54.8H${X(36)}V57H${X(24)}Z`],hi:[`M${X(26.2)} 52.2Q${X(27)} 54 ${X(29.6)} 54.3Q${X(27.4)} 53.4 ${X(26.2)} 52.2Z`,`M${X(32.4)} 53.9Q${X(34.2)} 54.3 ${X(34.8)} 55.3Q${X(33.4)} 54.6 ${X(32.4)} 53.9Z`],ln:[`M${X(30)} 52.2L${X(31.3)} 53.5`,`M${X(30.4)} 53.5L${X(31.9)} 53.7`,`M${X(29.8)} 53.1L${X(31.1)} 52.6`],lc:"#9a8c6c",lw:.3});
    s+=part(`M${X(25)} 56.2H${X(35.4)}V57.75H${X(25)}Z`,pal("#0d0d0e"),{ln:[`M${X(25.6)} 57.2H${X(34.8)}`],lc:"#3c3c40",lw:.32});
  }else if(t==="runner"){const P=pal(col||"#2a2d34");
    s+=part(`M${X(25.6)} 53.3H${X(29.6)}Q${X(33.6)} 53.5 ${X(35.5)} 55.3V56.2H${X(25.3)}Z`,P,{sh:[`M${X(24)} 55.2H${X(36)}V57H${X(24)}Z`],hi:[`M${X(30)} 53.6Q${X(33)} 53.9 ${X(34.6)} 54.9Q${X(32)} 54.3 ${X(30)} 53.6Z`],ln:[`M${X(30)} 53.5L${X(31)} 53.95`,`M${X(30.6)} 53.4L${X(31.6)} 53.9`],lc:"#e2e2e2",lw:.26,extra:`<path d="M${X(26.6)} 55.8Q${X(29.4)} 53.8 ${X(33)} 54.5" stroke="${acc}" stroke-width=".7" fill="none"/>`});
    s+=part(`M${X(25)} 56H${X(35.7)}Q${X(36)} 57.7 ${X(34.9)} 57.75H${X(25.2)}Q${X(24.7)} 57 ${X(25)} 56Z`,pal(acc),{hi:[`M${X(25)} 56H${X(35.7)}V56.55H${X(25)}Z`],ln:[`M${X(26)} 57.3L${X(26.6)} 56.9L${X(27.2)} 57.3L${X(27.8)} 56.9L${X(28.4)} 57.3L${X(29)} 56.9`],lc:"#000",lw:.22});
    s+=`<path d="M${X(25.4)} 53.3L${X(24.9)} 52.3L${X(26.1)} 52.8" fill="${acc}" stroke="#111" stroke-width=".25"/>`;
  }else{/* tenisówka tarasowa z gumową podeszwą */
    const P=pal(col||"#f0efea",{s:.22});
    s+=part(`M${X(25.5)} 53.2H${X(29.8)}Q${X(33.4)} 53.6 ${X(35.1)} 55.4V56.3H${X(25.1)}Z`,P,{sh:[`M${X(24)} 55.3H${X(36)}V57H${X(24)}Z`,`M${X(25)} 53H${X(26.6)}V57H${X(25)}Z`],hi:[`M${X(31.2)} 53.8Q${X(33.6)} 54.3 ${X(34.4)} 55.1Q${X(32.6)} 54.5 ${X(31.2)} 53.8Z`],ln:[`M${X(29.8)} 53.4L${X(30.6)} 53.85`,`M${X(30.3)} 53.3L${X(31.1)} 53.8`,`M${X(30.8)} 53.35L${X(31.6)} 53.85`,`M${X(32)} 54Q${X(33)} 55 ${X(33.2)} 56.2`],lc:"#8d929a",lw:.24,extra:`<path d="M${X(26.8)} 55.7Q${X(29.2)} 54.3 ${X(31.6)} 54.8" stroke="${acc}" stroke-width=".7" fill="none"/>`});
    s+=part(`M${X(24.9)} 56.1H${X(35.3)}Q${X(35.6)} 57.7 ${X(34.5)} 57.75H${X(25.1)}Z`,pal("#b98a4a",{h:.25}),{hi:[`M${X(25)} 56.1H${X(35.3)}V56.6H${X(25)}Z`],ln:[`M${X(25.4)} 57.2H${X(34.8)}`],lc:"#7a5428",lw:.25});
  }
  return s;}

/* ---------- ręce (barki, łokieć, przedramię zwężające się do nadgarstka) ---------- */
const ARMB=[[18.7,17.6,2.35],[17.3,21.4,2.1],[16.5,25,1.85],[16.8,28.4,1.65],[17.4,31,1.45]];
const ARMF=[[29.5,17.8,2.45],[31,21.2,2.15],[32.1,24.5,1.9],[33.7,27.2,1.7],[35,29.3,1.5]];
function sleeve(sp,col,o){o=o||{};const P=pal(col,o.m);let ln=[];
  const e=at(sp,.5);ln.push(`M${r2(e[0]-1.2)} ${r2(e[1]-.6)}L${r2(e[0]+.2)} ${r2(e[1]+.2)}L${r2(e[0]-.8)} ${r2(e[1]+.8)}`);
  const sh=at(sp,.1);ln.push(`M${r2(sh[0]+.4)} ${r2(sh[1]+1.6)}Q${r2(sh[0]+1.4)} ${r2(sh[1]+2.4)} ${r2(sh[0]+1.8)} ${r2(sh[1]+3.6)}`);
  let s=limb(sp,P,{ln:ln.concat(o.ln||[]),extra:o.extra,cap:true});
  if(o.back)s+=`<path d="${tube(sp)}" fill="#0c0a18" opacity=".26"/>`;
  return s;}
function cuffAt(sp,col,t0,t1,rib){const a=at(sp,t0),b=at(sp,t1),r=a[2]*1.02,P=pal(col);
  const seg=[[a[0],a[1],r],[b[0],b[1],r*.98]];
  return part(tube(seg,false),P,{sh:[tube(shift(seg,.7,.7),false)],ln:rib?[0,.25,.5,.75].map(t=>{const p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];return `M${r2(p[0]-r)} ${r2(p[1]+.3)}L${r2(p[0]+r)} ${r2(p[1]-.3)}`}):[],ow:.4})}

/* ---------- tułów (3/4: przód piersi z prawej, bok w cieniu z lewej) ---------- */
const TOR=`M18 16.2Q24 14.4 30.2 15.9Q31.6 16.4 31.9 18.6L32.2 22Q31.7 27 31 30.6L31.3 35.3Q24 36.1 16.8 35.3L17.4 30.4Q16.6 25 16.4 19.6Q16.6 16.8 18 16.2Z`;
const TSIDE=`M14 14H21.8Q20.6 19 20.8 24Q20.4 30 21.2 37H14Z`;
const TFOLD=[`M18.4 19.6Q20.6 21.6 22.6 21.4`,`M30.8 19.8Q29.4 21.8 28.2 21.6`,`M19 32.4Q20.6 33.4 22.4 33.2`,`M29.4 31.6Q28.4 33.2 27 33.6`];
function clubScarf(col,c2,long){const P=pal(col),L=long?30.6:27.2;
  let s=part(`M21.4 13.7Q24.6 15.4 27.6 13.6L28.5 16.3Q24.6 18.6 20.8 16.4Z`,P,{sh:[`M20 15.4Q24.6 17.6 29 15.4V18H20Z`],ln:[`M21.2 14.9Q24.6 16.7 28 14.9`,`M21 15.8Q24.6 17.6 28.3 15.8`],lc:c2,lw:.55});
  s+=part(`M26 16.8L${long?29:28.4} ${L}L${long?26.3:25.9} ${r2(L-.2)}L25 17.3Z`,P,{sh:[`M24.6 17H25.9L${long?27.2:26.8} ${L+1}H24.6Z`],extra:Array.from({length:Math.floor((L-19)/2.4)+1},(_,i)=>{const y=19.2+i*2.4,t=(y-17)/(L-17);return `<path d="M${r2(25.3+t*1)} ${r2(y)}L${r2(27.6+t*1.4)} ${r2(y+.2)}" stroke="${c2}" stroke-width=".75"/>`}).join("")});
  s+=[0,.8,1.6,2.4].map(d=>`<path d="M${r2((long?26.4:26)+d)} ${r2(L-.1)}V${r2(L+1.1)}" stroke="${mix(col,"#000",.2)}" stroke-width=".35"/>`).join("");
  return s;}

/* ================= KLASY ================= */
const CL={};
/* PROWODYR: kaszkiet z tweedu, overshirt z kieszeniami i naszywką na rękawie, biały t-shirt, złoty łańcuch z medalikiem,
   mosiężny kastet, złoty sygnet (sprzęt), dżinsy z podwinięciem, tenisówki tarasowe na gumowej podeszwie */
CL["Prowodyr"]=c=>{const{col,c2,sk,hr,fa}=c,P=pal(col);
  let body=`<g>${sleeve(ARMB,col,{back:1})}${cuffAt(ARMB,mix(col,"#000",.12),.86,.97)}${fist(17.5,32.2,sk,{rot:8})}<circle cx="16.15" cy="31.75" r=".6" fill="#d9a93a" stroke="#6b4e12" stroke-width=".22"/><circle cx="16.15" cy="31.75" r=".3" fill="#9e1520"/></g>`;
  body+=neck(sk);
  body+=part(TOR,P,{sh:[TSIDE,`M21 30.6Q26 32 31.6 30.2V37H21Z`],hi:[`M27.6 16.4Q30.4 16.6 31.2 19Q29.6 17.8 27.6 16.4Z`,`M28.4 22Q30.4 23 30.2 27Q29.4 24 28.4 22Z`],rim:[`M16.5 19.8Q16.7 25 17.4 30.4`],ln:TFOLD.concat([`M25.4 16.6V35.6`,`M22.6 21.2H26.6V24.4H22.6Z`,`M27.4 21.2H31.2V24.4H27.4Z`,`M22.6 21.2L24.6 22.4L26.6 21.2`,`M27.4 21.2L29.3 22.4L31.2 21.2`]),
    extra:`<circle cx="24.6" cy="22.4" r=".28" fill="${P.d}"/><circle cx="29.3" cy="22.4" r=".28" fill="${P.d}"/>`+[18,21,24,27,30,33].map(y=>`<circle cx="25.85" cy="${y}" r=".26" fill="${P.d}"/>`).join("")});
  body+=part(`M22.2 15.2Q25 16.9 27.6 15.3L27 19.6Q25 21.4 23 19.6Z`,pal("#ecebe6",{s:.2}),{sh:[`M22 15H24.4V21H22Z`]});
  body+=`<path d="M22.6 16Q25 21.6 27.2 16" stroke="#7a5714" stroke-width=".9" stroke-dasharray=".55 .25" fill="none"/><path d="M22.6 16Q25 21.6 27.2 16" stroke="#f0c75a" stroke-width=".55" stroke-dasharray=".55 .25" fill="none"/>`+part(`M24.1 19.7A1.05 1.05 0 1 0 26.2 19.7A1.05 1.05 0 1 0 24.1 19.7Z`,pal("#d9a93a",{h:.45}),{hi:[`M24.4 19.2Q25.1 18.7 25.8 19.1Q25.1 19.4 24.4 19.2Z`],ln:[`M24.6 19.2L25.7 20.2`,`M25.7 19.2L24.6 20.2`],lc:"#7a5714",ow:.35});
  body+=part(`M21.4 14.2Q25 16.6 28.2 14.4L28.9 16.2L26.4 18.6L25 16.6L23.4 18.6L20.8 16.4Z`,P,{sh:[`M20 14H23.8V19H20Z`],hi:[`M26.6 15.8L28.4 15.2L26.6 17.6Z`],ow:.45});
  if(fa.stripes)body+=`<path d="M17.2 26.4H31.4M17.4 29.2H31.1" stroke="${c2}" stroke-width="1.1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  let hd=head(sk,{brow:hr})+stubble(hr,.3);
  hd+=`<path d="M21.3 7.6Q21 10.4 22 11.6L22.6 10.4L22.2 8.4Z" fill="${hr}"/><path d="M24.6 7.6L24.85 10.2" stroke="${hr}" stroke-width=".7" stroke-linecap="round"/>`;
  const CP=pal("#615548",{h:.22});
  hd+=part(`M20.6 7.4Q20.2 2.9 25 2.7Q29.2 2.7 30 5.4L32.4 6.4Q31.6 7.6 29.2 7.2Q25.2 6.5 20.6 7.4Z`,CP,{sh:[`M19 2H23.8Q23 5 23.4 8H19Z`],hi:[`M26 3.2Q28.8 3.3 29.6 5.2Q27.8 4 26 3.2Z`],ln:[`M21.4 6.3Q25.2 4.9 29.6 5.9`,`M21.2 5.1Q24.8 3.8 28.8 4.7`,`M21.8 4Q24.6 3 27.6 3.5`,`M29.6 5.9Q31 6.3 32.2 6.6`],lc:"#3a322a",lw:.24,
    extra:Array.from({length:14},(_,i)=>`<path d="M${r2(21.4+i*.62)} ${r2(6.6-Math.sin(i/13*Math.PI)*.6)}l.3 -.5l.3 .5" stroke="#4a4036" stroke-width=".16" fill="none"/>`).join("")});
  hd+=`<circle cx="25.2" cy="3.05" r=".35" fill="#3a322a"/>`;
  if(fa.shades)hd+=shades();
  const GP=pal("#d4a63a",{h:.5,s:.35});
  const wp=part(`M33.5 28.3Q35.7 27.5 37.9 28.3V30.9Q35.7 31.6 33.5 30.9Z`,GP,{sh:[`M33 30H38.5V32H33Z`],hi:[`M33.8 28.5Q35.6 27.9 37.6 28.5V28.9Q35.6 28.3 33.8 28.9Z`],ow:.35})+[34.15,35.25,36.35,37.4].map(x=>`<circle cx="${x}" cy="28.75" r=".55" fill="none" stroke="#fbe7a0" stroke-width=".3"/><circle cx="${x}" cy="28.75" r=".55" fill="none" stroke="#7a5714" stroke-width=".12"/>`).join("");
  const badge=part(`M30.4 19.4L32.8 19L33.4 21.4L31 21.9Z`,pal("#1f2126"),{ln:[`M30.9 20.1L32.7 19.8`],lc:c2,lw:.35,ow:.35})+`<circle cx="31.15" cy="21.3" r=".22" fill="#c9ced6"/><circle cx="32.9" cy="20.95" r=".22" fill="#c9ced6"/>`;
  const arm=sleeve(ARMF,col,{extra:badge})+cuffAt(ARMF,mix(col,"#000",.12),.84,.97)+fist(35.6,30.2,sk)+`<g class="wp">${wp}</g>`;
  return{legs:["jeans","#2e4266","terrace"],body,head:hd,arm};
};
/* STARY WYGA: łysina z siwymi bokami, siwa broda, blizna, ucho kalafior, złamany nos, zmarszczki;
   skórzana kurtka (sprzęt) z klapami i połyskiem, koszulka klubowa z herbem, brzuch, pas, glany, stalowa rura z rdzą i taśmą */
CL["Stary Wyga"]=c=>{const{col,c2,sk,fa}=c,hr="#9a958d",LP=pal("#3d2b20",{h:.28,s:.45});
  const AB=ARMB.map(p=>[p[0]-1.4,p[1],p[2]*1.12]),AF=ARMF.map(p=>[p[0]+1.4,p[1],p[2]*1.12]);
  const tor=`M16.8 16.1Q24 14 31.4 15.8Q33.2 16.4 33.5 18.8L33.9 23Q34.8 27.4 33.9 31.2L33.1 35.4Q24.6 36.4 15.6 35.3L16 30.4Q15 25 15.2 19.6Q15.4 16.8 16.8 16.1Z`;
  let body=`<g>${sleeve(AB,"#3d2b20",{back:1,m:{h:.28}})}${fist(16.2,32.4,sk,{rot:10})}<path d="M15.1 31.7l.5.5l.5-.6M15.9 32.9l.5-.4" stroke="#2c4a7a" stroke-width=".25" fill="none" opacity=".85"/></g>`;
  body+=neck(sk);
  body+=part(tor,LP,{sh:[`M13 14H21.4Q20.2 20 20.4 25Q20 30 20.8 37H13Z`],hi:[`M16.6 18.4Q17.8 23 17.2 30Q16.4 24 16.6 18.4Z`,`M30.8 17Q32.8 18 32.8 21Q31.8 19 30.8 17Z`,`M32.6 25Q33.6 28 32.8 31Q32.8 28 32.6 25Z`],rim:[`M15.3 20Q15.1 25 16 30.4`],ln:[`M17.4 26.8L20.4 25.8`,`M31.2 26.6L28.6 25.6`,`M17.6 33.6Q19.6 34.4 21.2 34`]});
  body+=`<path d="M17.5 27.05L20.3 26.05" stroke="#b9bcc2" stroke-width=".18"/>`;
  body+=part(`M21.4 15.8Q24.6 17 27.6 15.6L28.6 26Q29.2 31 28.4 35.6H21.2Q20.6 26 21.4 15.8Z`,pal(col),{sh:[`M20 15H23.4Q22.8 26 23.4 36H20Z`,`M20 31Q25 33.6 30 31V37H20Z`],hi:[`M26 17Q27.6 19 27.8 23Q26.8 20 26 17Z`],ln:[`M23 16.6Q24.6 17.8 26.2 16.5`],lc:c2,lw:.5,
    extra:part(`M23.5 22.4Q24.9 21.6 26.4 22.4Q26.3 24.6 24.95 25.4Q23.6 24.6 23.5 22.4Z`,pal(c2),{ln:[`M24.95 22.2V25.2`],lc:col,lw:.5,ow:.3})});
  body+=part(`M19.6 15.4L22 16L22.8 24.4L19 20.2Z`,pal("#4c3628",{h:.3}),{hi:[`M20.2 16L21.6 16.4L22 20Z`],ln:[`M20.3 16.3L22.2 23.2`],lc:"#c7b08a",lw:.2,ow:.45});
  body+=part(`M29.2 15.4L27 16L26.3 24.4L30.2 20.2Z`,pal("#4c3628",{h:.3}),{hi:[`M28.6 16L27.4 16.4L27.2 20.6Z`],ln:[`M28.6 16.3L26.8 23.2`],lc:"#c7b08a",lw:.2,ow:.45});
  body+=part(`M21 33.4H28.8V35.1H21Z`,pal("#24170f"),{ow:.35})+`<path d="M24 33.5H25.9V35H24Z" fill="none" stroke="#c9ced6" stroke-width=".4"/>`;
  if(fa.stripes)body+=`<path d="M21.6 27H28.6M21.4 29.6H28.8" stroke="${c2}" stroke-width="1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2,1);
  let hd=head(sk,{cauli:1,broken:1,brow:"#a8a39a",bw:.8,angry:1,noMouth:1,eye:"#5a6a78",wr:1});
  hd+=part(`M21.3 9.8Q20.9 6.4 21.8 5.2Q22.4 7.6 23.8 8.2L23.6 10.8Z`,pal(hr),{ln:[`M21.5 6.6L22.6 8.6`,`M21.4 7.8L22.4 9.8`],ow:.35});
  hd+=`<path d="M22.8 4.2Q24.6 3.4 26.8 3.8" stroke="#fff" stroke-opacity=".5" stroke-width=".75" fill="none" stroke-linecap="round"/><path d="M26.4 5.9L27.4 7.9" stroke="#c4786a" stroke-width=".38"/><path d="M26.5 5.9L27.5 7.9" stroke="#f0b0a0" stroke-width=".12"/>`;
  hd+=part(`M22.6 9.9Q22.4 14 26 14.7Q29.6 14.8 29.9 11.3L29.2 11.15Q28.6 12.4 27.2 12.4Q25.8 12.2 25.6 11.4Q24.4 11 23.8 9.5Z`,pal(hr,{h:.35}),{sh:[`M21 9H25.2Q25 12 25.6 15H21Z`],hi:[`M27.6 12.8Q28.8 12.4 29.4 11.6Q29 13 27.6 12.8Z`],ln:[`M23.4 11.6L24 13.4`,`M24.6 12.2L25 14.2`,`M26 12.8L26.2 14.4`,`M27.4 13L27.6 14.2`,`M28.6 12.6L28.8 13.6`],lc:"#77726b",lw:.2,ow:.4});
  hd+=part(`M26.8 10.65Q28.3 10 29.85 10.65Q29.1 11.4 28.3 11.2Q27.5 11.45 26.8 10.65Z`,pal("#b0aba3"),{ow:.3});
  if(fa.shades)hd+=shades();
  const P0=[34.2,33.4],P1=[45.6,16.6],ax=[P1[0]-P0[0],P1[1]-P0[1]],L=Math.hypot(...ax),n=[-ax[1]/L,ax[0]/L],w=1.15;
  const q=(t,o)=>[r2(P0[0]+ax[0]*t+n[0]*o),r2(P0[1]+ax[1]*t+n[1]*o)],box=(t0,t1,a,b)=>`M${q(t0,a).join(" ")}L${q(t1,a).join(" ")}L${q(t1,b).join(" ")}L${q(t0,b).join(" ")}Z`;
  const MP={b:"#7d848e",s:"#4c525b",d:"#2c3036",h:"#e2e6eb",r:"#a9d4ff",o:"#1b1e23"};
  let wp=part(box(0,1,w,-w),MP,{sh:[box(0,1,w*.1,w*1.2)],hi:[box(0,1,-w*.35,-w*.65)],
    extra:[[.4,.4,.5],[.52,-.3,.35],[.63,.5,.6],[.74,-.2,.4],[.86,.3,.45]].map(([t,o,r])=>{const p=q(t,o);return `<ellipse cx="${p[0]}" cy="${p[1]}" rx="${r}" ry="${r*.7}" fill="#8a4a1f" opacity=".8"/><ellipse cx="${p[0]}" cy="${p[1]}" rx="${r*.5}" ry="${r*.35}" fill="#b5652a" opacity=".7"/>`}).join("")});
  wp+=part(box(0,.25,w*1.12,-w*1.12),pal("#2b2b2f"),{extra:Array.from({length:6},(_,i)=>`<path d="M${q(.02+i*.04,-w*1.2).join(" ")}L${q(.06+i*.04,w*1.2).join(" ")}" stroke="#4e4e55" stroke-width=".3"/>`).join(""),ow:.35});
  wp+=part(box(.88,1.02,w*1.45,-w*1.45),{b:"#6a717b",s:"#41464e",d:"#2a2e34",h:"#d6dbe1",r:"#a9d4ff",o:"#1b1e23"},{hi:[box(.88,1.02,-w*.7,-w*1)],extra:[.91,.95,.99].map(t=>`<path d="M${q(t,-w*1.45).join(" ")}L${q(t,w*1.45).join(" ")}" stroke="#2a2e34" stroke-width=".22"/>`).join(""),ow:.4});
  const arm=sleeve(AF,"#3d2b20",{m:{h:.28},extra:`<path d="${edge(AF,-.4)}" stroke="#fff" stroke-opacity=".25" stroke-width=".45" fill="none"/>`})+cuffAt(AF,"#2a1c13",.84,.97)+`<g class="wp">${wp}</g>`+fist(36.9,30.4,sk);
  return{legs:["jeans","#263754","boot"],body,head:hd,arm,wide:.5};
};
/* GNIAZDOWY (capo): kapelusz bucket w barwach, krzyczy, długi szalik z frędzlami, bluza klubowa z herbem,
   megafon na pasku przy biodrze (sprzęt), raca w uniesionej ręce z płomieniem, iskrami, dymem i łuną */
CL["Gniazdowy"]=c=>{const{col,c2,sk,hr,fa}=c,P=pal(col);
  const AF=[[29.5,17.8,2.35],[31.4,15.4,2.1],[32.8,13,1.85],[33.8,11.4,1.65],[34.4,10.2,1.5]];
  let body=`<g>`+part(`M16.3 31.4L12.8 29.4V35.4L16.3 33.6Z`,pal("#ecebe6",{s:.3}),{sh:[`M12 32.8H17V36H12Z`],hi:[`M13.4 30.2L16 31.6L13.4 31Z`],ln:[`M14.6 30.4V34.4`],lc:col,lw:.55,ow:.4})+part(`M12.3 32.4A.75 3 0 1 0 13.8 32.4A.75 3 0 1 0 12.3 32.4Z`,pal("#c4c7cc"),{extra:`<ellipse cx="13.05" cy="32.4" rx=".42" ry="2.2" fill="#2a2e34"/>`,ow:.35})+part(`M16.2 31.1H17.6V33.9H16.2Z`,pal("#2a2c31"),{ow:.35})+part(`M16.5 33.8L16.2 35.7H17.2L17.4 33.8Z`,pal("#2a2c31"),{ow:.35})+`<circle cx="16.9" cy="32.5" r=".3" fill="#d4262e"/></g>`;
  body+=`<g>${sleeve(ARMB,col,{back:1})}${cuffAt(ARMB,c2,.86,.97,1)}${fist(17.5,32.2,sk,{rot:8})}</g>`;
  body+=neck(sk);
  body+=part(TOR,P,{sh:[TSIDE,`M21 31Q26 32.4 31.6 30.6V37H21Z`],hi:[`M27.6 16.4Q30.4 16.6 31.2 19Q29.6 17.8 27.6 16.4Z`,`M28.6 22.4Q30.4 24 30.2 27.6Q29.4 24.6 28.6 22.4Z`],rim:[`M16.5 19.8Q16.7 25 17.4 30.4`],ln:TFOLD.concat([`M20 17.6Q23 18.8 24.4 23`,`M31.2 17.4Q29.2 18.4 28 21.4`]),
    extra:part(`M27.2 20.8H30V23Q28.6 24.6 27.2 23Z`,pal(c2),{ln:[`M28.6 21.1V23.6`],lc:col,lw:.55,ow:.3})+part(`M16.8 33.8Q24 34.8 31.3 33.8V35.5Q24 36.3 16.8 35.5Z`,pal(mix(col,"#000",.15)),{ln:[`M17 34.6Q24 35.5 31.2 34.6`],lc:mix(col,"#000",.4),lw:.2,ow:0})});
  body+=`<path d="M30.6 17L17 31.2" stroke="#1d1f24" stroke-width="1.1"/><path d="M30.4 17.4L17.1 31.1" stroke="#50535b" stroke-width=".25" stroke-dasharray=".4 .3"/><path d="M29 18.4H30.6V19.8H29Z" fill="#9aa0a8" stroke="#1d1f24" stroke-width=".2"/>`;
  if(fa.stripes)body+=`<path d="M17.2 26.4H31.4M17.4 29.2H31.1" stroke="${c2}" stroke-width="1.1" opacity=".85"/>`;
  body+=clubScarf(col,c2,1);
  let hd=head(sk,{shout:1,angry:1,brow:hr})+stubble(hr,.15);
  hd+=`<path d="M21.3 7.4Q21 10 21.8 11.2L22.6 10.2L22.4 8Z" fill="${hr}"/>`;
  const BP=pal(col);
  hd+=part(`M21.6 6.2Q21.6 2.6 25.2 2.4Q28.8 2.4 29 6.2Z`,BP,{sh:[`M20 2H24Q23.4 4 23.6 7H20Z`],hi:[`M26.2 2.9Q28.2 3.2 28.6 5.2Q27.4 3.8 26.2 2.9Z`],ln:[`M23.8 2.7Q23.4 4.4 23.8 6.2`,`M26.6 2.6Q27 4.4 26.9 6.2`],lc:BP.s,ow:.45});
  hd+=part(`M19.8 6.6Q25.4 4.9 31.2 6.6L31.6 8Q25.4 6.5 19.6 8Z`,BP,{sh:[`M19 6H23V9H19Z`],ln:[`M20 7.3Q25.4 5.8 31.4 7.3`],lc:c2,lw:.6,ow:.45});
  hd+=`<path d="M21.7 5.6Q25.3 4.9 28.95 5.6" stroke="${c2}" stroke-width=".75" fill="none"/>`;
  if(fa.shades)hd+=shades();
  let wp=`<circle cx="36.4" cy="3.4" r="9.5" fill="url(#f3r)"/>`;
  wp+=part(`M33.4 12.6L35.1 4.4L36.5 4.7L34.8 12.9Z`,pal("#c4252c",{h:.35}),{sh:[`M32.8 12.6L34.4 4.2L35.3 4.4L33.8 12.8Z`],hi:[`M35.5 4.6L36.1 4.7L34.6 12L34.3 11.9Z`],extra:part(`M34 9.6L34.6 6.8L36 7.1L35.4 9.9Z`,pal("#efe8d8"),{ln:[`M34.6 8.6L35.2 7.4`],lc:"#c4252c",lw:.4,ow:0}),ow:.4});
  wp+=part(`M33.2 13.4L33.55 11.8L35 12.1L34.65 13.7Z`,pal("#1d1d20"),{ow:.35});
  wp+=`<g class="flm"><path d="M35.8 4.7Q33.4 2.4 35.8 -1.4Q36.1 1 37.8 1.2Q38.9 3.4 35.8 4.7Z" fill="#ff6a12"/><path d="M35.85 4.3Q34.6 2.6 36 .6Q36.3 2.1 37.2 2.3Q37.5 3.6 35.85 4.3Z" fill="#ffd24a"/><ellipse cx="35.8" cy="4.15" rx="1" ry=".8" fill="#fffbe6"/></g>`;
  wp+=[[38.6,1],[33.2,1.6],[37.8,-1.8],[34.4,-2.8],[39.6,-.6],[32.6,-.4]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="${.12+i%3*.05}" fill="${["#ffd24a","#ffb14a","#fff0a0"][i%3]}"/>`).join("");
  wp+=[[34,-3.8,2.4,.4],[31.2,-6,3.2,.3],[27.8,-7.8,3.9,.2],[24.2,-8.6,4.4,.12]].map(([x,y,r,o])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#cfc7c2" opacity="${o}"/><circle cx="${r2(x+r*.3)}" cy="${r2(y-r*.3)}" r="${r2(r*.55)}" fill="#e8e2dd" opacity="${r2(o*.8)}"/>`).join("");
  const arm=`<g class="wp" style="transform-origin:34.6px 10.4px">${wp}</g>`+sleeve(AF,col)+cuffAt(AF,c2,.84,.97,1)+fist(34.6,10.4,sk,{rot:-60});
  return{legs:["jeans","#2e4266","terrace"],body,head:hd,arm,acc:c2};
};
/* CZUJKA: anorak z kapturem (pół-zamek, kieszeń kangurka) w barwach, komin na nos, czujne oczy,
   wąskie dresy z lampasami, łańcuch rowerowy owinięty na dłoni, buty biegowe z neonową pianką (sprzęt) */
CL["Czujka"]=c=>{const{col,c2,sk,hr,fa}=c,P=pal(col);
  const AB=ARMB.map(p=>[p[0]+.6,p[1],p[2]*.92]),AF=ARMF.map(p=>[p[0]-.6,p[1],p[2]*.92]);
  const tor=`M18.6 16.4Q24 14.6 29.6 16.1Q30.9 16.6 31.2 18.6L31.4 22Q30.9 27 30.4 30.6L30.6 35Q24 35.8 17.6 35L18.1 30.4Q17.4 25 17.2 19.6Q17.4 17 18.6 16.4Z`;
  let body=`<g>${sleeve(AB,col,{back:1,extra:`<path d="${edge(AB,.55)}" stroke="${c2}" stroke-width=".45" fill="none"/>`})}${cuffAt(AB,"#17191e",.86,.97,1)}${fist(18.1,32,sk,{rot:8})}</g>`;
  body+=neck(sk);
  body+=part(tor,P,{sh:[`M14 14H22.2Q21.2 19 21.4 24Q21 30 21.8 37H14Z`,`M21 30.6Q26 32 31 30.4V37H21Z`],hi:[`M27.4 16.6Q29.8 16.9 30.5 19Q29 18 27.4 16.6Z`],rim:[`M17.3 19.8Q17.5 25 18.1 30.4`],ln:[`M18.8 19.6Q20.8 21.4 22.6 21.2`,`M30 19.8Q28.8 21.6 27.8 21.4`,`M20 27.4Q25 28.4 30.2 27.2`,`M20.4 27.6L19.6 32.4`,`M29.8 27.4L30.4 32.2`],
    extra:part(`M24.3 16.5Q25.2 16.9 26.1 16.5L26.2 22.6H24.2Z`,pal(mix(col,"#000",.25)),{ow:.3})+`<path d="M25.2 16.4V23.2" stroke="#1a1c21" stroke-width=".5"/><path d="M25.2 16.6V23.2" stroke="#d4d7dc" stroke-width=".26" stroke-dasharray=".2 .2"/><path d="M24.8 22.4H25.6V23.8H24.8Z" fill="#d4d7dc" stroke="#14161b" stroke-width=".15"/>`+part(`M17.6 33.6Q24 34.4 30.6 33.6V35.1Q24 35.8 17.6 35.1Z`,pal("#17191e"),{ow:0})});
  if(fa.stripes)body+=`<path d="M17.8 25H31M18 29.6H30.6" stroke="${c2}" stroke-width="1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  let hd=head(sk,{noMouth:1,noNose:1,eye:"#3a4a32",brow:hr,bw:.55,angry:1});
  hd+=part(`M23.2 9.6H30.4L30.6 10.6Q30.6 13.2 28 14.1Q24.8 14.6 23.1 12.8Z`,pal("#1d1f24",{h:.2}),{sh:[`M22 9H25.4V15H22Z`],hi:[`M28 10.2Q30 10.4 30.2 11.4Q29 11 28 10.2Z`],ln:[`M23.6 10.9H30.3`,`M23.6 12H30`,`M24 13.1H29.2`,`M29.4 9.9Q30.4 10.4 30.2 11.4`],lc:"#34373f",lw:.22,ow:.45});
  const HP=pal(col,{s:.45});
  const hood=`M19.4 9.4Q19 2.3 25.2 2.1Q30.9 2.3 31.1 8.6L30.7 12.9Q28.4 15.9 24.4 15.4Q20.3 14.8 19.4 9.4ZM24.4 5.3Q29.2 4.7 30 8.2L30.4 10.4L30.1 12.5Q27.2 13.7 24.2 12.7Q23.2 8.8 24.4 5.3Z`;
  const hid="k"+(++UID);
  hd+=`<path d="${hood}" fill-rule="evenodd" fill="${HP.b}"/><clipPath id="${hid}"><path d="${hood}" clip-rule="evenodd"/></clipPath><g clip-path="url(#${hid})"><path d="M18 1H23.6Q22.4 8 23.4 16H18Z" fill="${HP.s}"/><path d="M27.6 2.4Q30.6 3.4 30.9 7.6Q29.6 4.4 27.6 2.4Z" fill="${HP.h}"/><path d="M24.4 5.3Q29.2 4.7 30 8.2L30.4 10.4L30.1 12.5Q27.2 13.7 24.2 12.7Q23.2 8.8 24.4 5.3Z" fill="none" stroke="${HP.d}" stroke-width="1.1"/><path d="M19.6 9.2Q19.6 4 23 2.8" stroke="${HP.r}" stroke-width=".45" fill="none" opacity=".75"/><path d="M21.6 4.8Q20.8 9.6 22.8 14" stroke="${HP.d}" stroke-width=".3" fill="none"/></g><path d="${hood}" fill="none" stroke="${HP.o}" stroke-width=".55"/>`;
  hd+=`<path d="M23 13.6L22.6 16.6M23.7 13.9L23.5 17.1" stroke="${c2}" stroke-width=".32"/><rect x="22.25" y="16.4" width=".7" height=".9" rx=".25" fill="#2a2d33"/><rect x="23.15" y="16.9" width=".7" height=".9" rx=".25" fill="#2a2d33"/>`;
  if(fa.shades)hd+=shades();
  const A=[35.4,30],B=[44.8,32.8],C=[40.6,39.8];let wp="";
  for(let i=0;i<=17;i++){const t=i/17,x=(1-t)*(1-t)*A[0]+2*(1-t)*t*B[0]+t*t*C[0],y=(1-t)*(1-t)*A[1]+2*(1-t)*t*B[1]+t*t*C[1],dx=2*(1-t)*(B[0]-A[0])+2*t*(C[0]-B[0]),dy=2*(1-t)*(B[1]-A[1])+2*t*(C[1]-B[1]),an=r2(Math.atan2(dy,dx)*180/Math.PI),X=r2(x),Y=r2(y);
    wp+=i%2?`<g transform="rotate(${an} ${X} ${Y})"><rect x="${r2(X-.6)}" y="${r2(Y-.2)}" width="1.2" height=".4" rx=".2" fill="#8a9099" stroke="#25282d" stroke-width=".16"/></g>`:`<g transform="rotate(${an} ${X} ${Y})"><rect x="${r2(X-.68)}" y="${r2(Y-.44)}" width="1.36" height=".88" rx=".42" fill="none" stroke="#25282d" stroke-width=".52"/><rect x="${r2(X-.68)}" y="${r2(Y-.44)}" width="1.36" height=".88" rx=".42" fill="none" stroke="#c9ced5" stroke-width=".22"/><circle cx="${X}" cy="${Y}" r=".14" fill="#5a5f66"/></g>`}
  const arm=sleeve(AF,col,{extra:`<path d="${edge(AF,-.55)}" stroke="${c2}" stroke-width=".45" fill="none"/>`})+cuffAt(AF,"#17191e",.84,.97,1)+`<g class="wp">${wp}</g>`+fist(35.4,30,sk)+`<path d="M34 29.2Q35.4 31.4 37 29.8M33.9 30.4Q35.2 32 36.8 31" stroke="#25282d" stroke-width=".6" fill="none"/><path d="M34 29.2Q35.4 31.4 37 29.8M33.9 30.4Q35.2 32 36.8 31" stroke="#b9bec5" stroke-width=".28" fill="none" stroke-dasharray=".5 .3"/>`;
  return{legs:["track","#1c1f25","runner"],body,head:hd,arm,acc:"#c6f432"};
};
/* BOJÓWKARZ: czarny blok – kominiarka z dzianiny, ciemna bluza z kapturem (podszewka i sznurki w barwach),
   opaska klubowa na ramieniu, mapa dzielnic w kieszeni (sprzęt), taktyczne rękawice, kij bejsbolowy, bojówki, glany */
CL["Bojówkarz"]=c=>{const{col,c2,sk,fa}=c,DK=mix(col,"#16171b",.82),P=pal(DK,{h:.16});
  const AB=ARMB.map(p=>[p[0]-.4,p[1]+.2,p[2]*1.08]),AF=ARMF.map(p=>[p[0]+.3,p[1]+.2,p[2]*1.08]);
  const tor=`M17.6 16.4Q24 14.6 30.6 16.1Q32.1 16.6 32.4 18.8L32.6 22.4Q32.2 28 32 31L32.4 35.8Q24 36.6 16 35.8L16.5 31Q15.8 25 15.8 19.8Q16.1 17 17.6 16.4Z`;
  let body=`<g>${sleeve(AB,DK,{back:1,m:{h:.16}})}${cuffAt(AB,mix(DK,"#000",.2),.84,.97,1)}${fist(17.2,32.6,sk,{glove:1,rot:8})}</g>`;
  body+=part(`M19.2 13Q19 17.6 23.6 17.8L28.8 17.6Q30 15.6 28.8 13.4Q24 16.4 19.2 13Z`,P,{sh:[`M18 12H23V19H18Z`],extra:`<path d="M20.4 14.2Q24 16.6 28.4 14.4" stroke="${col}" stroke-width=".8" fill="none"/>`,ow:.45});
  body+=part(tor,P,{sh:[`M13 14H21.6Q20.6 19 20.8 24Q20.4 30 21.2 37H13Z`,`M21 31Q26 32.6 33 30.8V37H21Z`],hi:[`M27.8 16.6Q30.8 16.9 31.6 19.4Q30 18.2 27.8 16.6Z`,`M28.8 22.6Q30.8 24.4 30.8 27.6Q29.8 24.8 28.8 22.6Z`],rim:[`M15.9 20Q16 25 16.5 31`],ln:[`M18.4 19.8Q20.6 21.8 22.6 21.6`,`M31.4 20Q29.8 22 28.6 21.8`,`M19.4 33.2Q21 34.2 22.8 34`],
    extra:part(`M19 26.8H30.4L31.6 32.4H17.8Z`,pal(mix(DK,"#000",.15)),{ln:[`M19.4 27.3H30`,`M18.3 31.9H31.1`],lc:mix(DK,"#fff",.18),lw:.18,ow:.35})+part(`M16 34.4Q24 35.2 32.4 34.4V35.9Q24 36.6 16 35.9Z`,pal(mix(DK,"#000",.2)),{ow:0})});
  body+=part(`M20 27L22.1 23.7L24.9 25.2L23.1 27.4Z`,pal("#efe6cf",{s:.22}),{sh:[`M20 27L22.1 23.7L22.6 24L20.8 27.2Z`],ln:[`M21 25.4L23.8 26.4`,`M22.1 23.7L22.6 26.6`],lc:"#b3a582",lw:.18,extra:`<path d="M20.9 26.4Q22.1 24.8 23.1 25.6T24.3 25.4" stroke="#c4252c" stroke-width=".32" fill="none" stroke-dasharray=".4 .2"/><circle cx="24.2" cy="25.4" r=".28" fill="#c4252c"/>`,ow:.35});
  body+=`<path d="M23 17.6L22.7 23.4M26.2 17.6L26.5 23.6" stroke="${col}" stroke-width=".42"/><rect x="22.35" y="23.2" width=".7" height="1.1" rx=".2" fill="#c9ced6"/><rect x="26.15" y="23.4" width=".7" height="1.1" rx=".2" fill="#c9ced6"/>`;
  if(fa.stripes)body+=`<path d="M16.2 22.8H32.4" stroke="${c2}" stroke-width="1.1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  const HD=`M20.8 8.2C20.6 4.4 22.9 3 25.1 3C28 3 29.4 4.8 29.4 7L29.6 8L30.6 9.6L29.7 10.2L29.9 11.8C29.6 13 28.4 13.8 26.8 13.8C24.6 13.8 22.8 12.9 21.9 11.6C21.1 10.5 20.8 9.4 20.8 8.2Z`;
  let hd=part(HD,pal("#1b1c21",{h:.16}),{sh:[`M19 2H25.4Q26 6 25.6 8Q26.4 10 26.2 15H19Z`],hi:[`M26.6 3.8Q28.8 4.4 29.2 6.6Q28 5 26.6 3.8Z`,`M29.6 8.4L30.4 9.5L29.8 9.4Z`],rim:[`M20.9 8.4C20.9 5.4 22.4 3.6 24.4 3.2`],ln:Array.from({length:9},(_,i)=>`M${r2(21.6+i*.9)} ${r2(4.6+Math.abs(i-4)*.12)}Q${r2(21.4+i*.95)} 9 ${r2(21.9+i*.9)} 13.2`),lc:"#2a2c33",lw:.2});
  hd+=part(`M25.3 6.9H29.7L29.85 8.9H25.2Z`,pal(sk,{s:.4}),{sh:[`M25.2 6.9H29.8V7.6H25.2Z`],ow:.35});
  hd+=`<path d="M25.9 8.1Q26.7 7.5 27.6 7.95Q26.8 8.55 25.9 8.1Z" fill="#efe9e0"/><circle cx="26.9" cy="8.05" r=".38" fill="#3a2a1c"/><circle cx="26.95" cy="8.05" r=".18" fill="#050505"/><circle cx="26.8" cy="7.92" r=".09" fill="#fff"/><path d="M25.8 7.7Q26.9 7.3 28 7.7" stroke="#1b120c" stroke-width=".5" fill="none"/><path d="M28.5 8.05Q28.9 7.65 29.3 7.9Q29 8.3 28.5 8.05Z" fill="#e6dfd5"/><circle cx="28.95" cy="7.98" r=".22" fill="#3a2a1c"/>`;
  hd+=`<path d="M25.1 6.85H29.8M25.05 8.95H29.9" stroke="#2a2c33" stroke-width=".5"/>`;
  if(fa.shades)hd+=`<path d="M25.5 7.15H29.6V8.7Q28.8 9.1 27.6 8.9Q26.3 8.9 25.5 8.5Z" fill="#0b0b0e"/><path d="M26 7.4Q27 7.3 27.8 7.5" stroke="#8fb8ff" stroke-opacity=".6" stroke-width=".3" fill="none"/>`;
  const P0=[33.4,34.2],P1=[47,11.6],ax=[P1[0]-P0[0],P1[1]-P0[1]],L=Math.hypot(...ax),n=[-ax[1]/L,ax[0]/L],u=[ax[0]/L,ax[1]/L];
  const W=t=>t<.4?.5:t<.62?.5+(t-.4)/.22*.78:1.28;const q=(t,o)=>[r2(P0[0]+ax[0]*t+n[0]*o),r2(P0[1]+ax[1]*t+n[1]*o)];
  let lp=[],rp=[];for(let i=0;i<=20;i++){const t=i/20;lp.push(q(t,W(t)).join(" "));rp.unshift(q(t,-W(t)).join(" "))}
  const bat=`M${lp.join("L")}Q${r2(P1[0]+u[0]*1.5)} ${r2(P1[1]+u[1]*1.5)} ${rp[0]}L${rp.join("L")}Z`;
  const WP={b:"#c08d55",s:"#8a5c32",d:"#5e3c1e",h:"#f0cf9c",r:"#ffe2b8",o:"#3a2410"};
  let wp=part(bat,WP,{sh:[`M${Array.from({length:21},(_,i)=>q(i/20,W(i/20)*.05).join(" ")).join("L")}L${q(1,W(1)*1.4).join(" ")}L${q(0,1).join(" ")}Z`],hi:[`M${q(.5,-.15).join(" ")}L${q(.98,-.5).join(" ")}L${q(.98,-.85).join(" ")}L${q(.62,-.6).join(" ")}Z`],
    ln:[[.6,.3],[.68,-.2],[.76,.5],[.84,-.4],[.92,.2]].map(([t,o])=>`M${q(t,o).join(" ")}L${q(t+.08,o*.9).join(" ")}`),lc:"#7a4f2a",lw:.16,
    extra:[[.72,.7],[.8,-.6],[.9,.4],[.95,-.2]].map(([t,o])=>{const p=q(t,o);return `<ellipse cx="${p[0]}" cy="${p[1]}" rx=".38" ry=".24" fill="#4a2c14" opacity=".65"/>`}).join("")});
  const k0=q(-.025,0),ang=r2(Math.atan2(u[1],u[0])*180/Math.PI);
  wp+=`<ellipse cx="${k0[0]}" cy="${k0[1]}" rx="1" ry=".75" transform="rotate(${ang} ${k0[0]} ${k0[1]})" fill="#5a3a1e" stroke="#3a2410" stroke-width=".35"/>`;
  wp+=part(`M${q(.02,.62).join(" ")}L${q(.34,.62).join(" ")}L${q(.34,-.62).join(" ")}L${q(.02,-.62).join(" ")}Z`,pal("#18181b"),{extra:Array.from({length:8},(_,i)=>`<path d="M${q(.03+i*.04,-.7).join(" ")}L${q(.06+i*.04,.7).join(" ")}" stroke="#3c3c44" stroke-width=".2"/>`).join(""),ow:.3});
  const ab=part(band(AF,.14,.3,1.04),pal(col),{sh:[tube(shift([at(AF,.14),at(AF,.3)],.7,.75),false)],extra:(()=>{const a=at(AF,.21);return `<path d="M${r2(a[0]-2.6)} ${r2(a[1]+1)}L${r2(a[0]+2.6)} ${r2(a[1]-1)}" stroke="${c2}" stroke-width=".6"/>`})(),ow:.35});
  const arm=sleeve(AF,DK,{m:{h:.16}})+ab+cuffAt(AF,mix(DK,"#000",.2),.84,.97,1)+`<g class="wp">${wp}</g>`+fist(35.6,30.6,sk,{glove:1});
  return{legs:["cargo","#2e3228","boot"],body,head:hd,arm,wide:.3};
};

function hips(col,type,w){const P=pal(col,{s:.42});
  const d=`M${r2(18.4-w)} 33.2H${r2(30.2+w)}L${r2(30+w*.8)} 37.6Q${r2(27.2+w*.4)} 38.6 24.9 37.4Q${r2(22.4-w*.4)} 38.8 ${r2(18.7-w*.6)} 37.8Z`;
  return part(d,P,{sh:[`M${r2(17-w)} 33H22.4L22 39H${r2(17-w)}Z`,`M24.2 36Q24.9 37.6 25.6 36L25.6 39H24.2Z`],ln:[`M24.9 34.6Q24.8 36.2 24.9 37.4`,`M23.4 36.6Q24.2 37.3 24.9 37.2`],lc:P.d,lw:.26,ow:.45})}
/* ---------- składanie ---------- */
function fig2(cls,col,flip,k,fa,c2){
  fa=fa||{};col=mix(col,col,0);c2=mix(c2||"#ffffff",c2||"#ffffff",0);k=k||0;
  const SKN=["#e3b18d","#c58d67","#f0caa6","#9b6c4c","#d8a47f"],HRN=["#2a1d14","#16120f","#5a3b22","#121212","#3a2a1c"];
  const fn=CL[cls]||CL["Prowodyr"],sk=SKN[k%5],hr=HRN[k%5];
  const p=fn({col,c2,sk,hr,fa,k}),[ptype,pcol,stype]=p.legs,w=p.wide||0;
  const LB=LEGB.map(q=>[q[0]-w*.6,q[1],q[2]*(1+w*.12)]),LF=LEGF.map(q=>[q[0]+w*.4,q[1],q[2]*(1+w*.12)]);
  const scol=fa.shoes?col:null,acc=stype==="runner"?"#c6f432":fa.shoes?"#f0efea":(p.acc||"#9aa1ab");
  const inner=`<ellipse cx="25.4" cy="57.8" rx="11.8" ry="2.1" fill="#000" opacity=".3"/><ellipse cx="25.4" cy="57.75" rx="7.4" ry="1.2" fill="#000" opacity=".3"/>
<g class="lg2">${pants(LB,pcol,ptype,c2,1)}${shoe(stype,-7.4,scol,acc)}</g>
<g class="lg1">${pants(LF,pcol,ptype,c2)}${shoe(stype,0,scol,acc)}</g>
<g class="bd">${hips(pcol,ptype,w)}${p.body}${p.head}<g class="arf">${p.arm}</g></g>`;
  return `<svg viewBox="0 0 48 60" width="48" height="60" style="overflow:visible" aria-hidden="true"><defs><radialGradient id="f3r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a2a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff3a1a" stop-opacity=".18"/><stop offset="1" stop-color="#ff3a1a" stop-opacity="0"/></radialGradient></defs>${flip?`<g transform="translate(48 0) scale(-1 1)">${inner}</g>`:inner}</svg>`;
}
G.fig2=fig2;G.FIG2_CLASSES=Object.keys(CL);
})(typeof window!=="undefined"?window:globalThis);
