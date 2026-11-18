/* Ekipy – szczegółowe modele postaci (SVG, układ 48x60 zgodny z animacjami gry:
   .lg2 noga tylna, .lg1 noga przednia, .bd tułów, .arf ramię przednie, .wp broń) */
(function(G){
const O='stroke="#14161b" stroke-width=".42" stroke-linejoin="round" stroke-linecap="round"';
const SK=["#e3b18d","#c58d67","#f0caa6","#9b6c4c","#d8a47f"];
const HR=["#2a1d14","#16120f","#5a3b22","#121212","#3a2a1c"];
const r1=v=>Math.round(v*100)/100;
const pt=(a,b,t)=>[r1(a[0]+(b[0]-a[0])*t),r1(a[1]+(b[1]-a[1])*t)];

const DEFS=`<defs>
<linearGradient id="f2s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".24"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".46"/></linearGradient>
<linearGradient id="f2v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".55" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></linearGradient>
<radialGradient id="f2h" cx=".66" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".3"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".34"/></radialGradient>
<linearGradient id="f2g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#e3b341"/><stop offset=".7" stop-color="#a87a1c"/><stop offset="1" stop-color="#f2d27a"/></linearGradient>
<linearGradient id="f2m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3f454d"/><stop offset=".3" stop-color="#c9ced6"/><stop offset=".45" stop-color="#8b929c"/><stop offset="1" stop-color="#434951"/></linearGradient>
<linearGradient id="f2w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#7a4f2a"/><stop offset=".35" stop-color="#e0b47c"/><stop offset=".6" stop-color="#b98652"/><stop offset="1" stop-color="#6e4624"/></linearGradient>
<radialGradient id="f2f" cx=".5" cy=".6" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#ffe680"/><stop offset=".6" stop-color="#ff7a1a"/><stop offset="1" stop-color="#e0241b" stop-opacity="0"/></radialGradient>
<radialGradient id="f2r" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff5a2a" stop-opacity=".55"/><stop offset=".5" stop-color="#ff3a1a" stop-opacity=".18"/><stop offset="1" stop-color="#ff3a1a" stop-opacity="0"/></radialGradient>
<linearGradient id="f2l" x1="0" y1="0" x2="1" y2=".3"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".2" stop-color="#fff" stop-opacity=".28"/><stop offset=".32" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
</defs>`;

/* ---------- części wspólne ---------- */
function fist(x,y,sk,glove){
  const c=glove?"#1c1d21":sk;
  let s=`<path d="M${x-1.9} ${y-1.3}Q${x-.2} ${y-2.5} ${x+1.7} ${y-1.4}L${x+2} ${y+1.2}Q${x+.4} ${y+2.4} ${x-1.6} ${y+1.6}Z" fill="${c}" ${O}/>`;
  s+=`<path d="M${x-1.7} ${y-1.25}Q${x-.2} ${y-2.4} ${x+1.65} ${y-1.35}L${x+1.9} ${y+1.15}Q${x+.4} ${y+2.3} ${x-1.5} ${y+1.5}Z" fill="url(#f2h)"/>`;
  s+=`<path d="M${x+1.75} ${y-.6}H${x+.6}M${x+1.85} ${y+.35}H${x+.7}" stroke="#000" stroke-opacity=".38" stroke-width=".28"/>`;
  s+=`<path d="M${x-1.2} ${y+.2}Q${x+.2} ${y-.4} ${x+.9} ${y+.9}" stroke="#000" stroke-opacity=".3" stroke-width=".32" fill="none"/>`;
  if(glove)s+=`<path d="M${x+.4} ${y-2}Q${x+1.6} ${y-1.8} ${x+2.1} ${y-.2}" stroke="#3a3c43" stroke-width=".9" fill="none"/><path d="M${x+.8} ${y-1.7}V${y-.9}M${x+1.5} ${y-1.4}V${y-.6}" stroke="#55575f" stroke-width=".25"/>`;
  return s;
}
function sleeve(P,w,col,shade){ // P: [shoulder,elbow,hand]
  const d=`M${P[0][0]} ${P[0][1]}L${P[1][0]} ${P[1][1]}L${P[2][0]} ${P[2][1]}`;
  const u=`M${P[0][0]} ${P[0][1]}L${P[1][0]} ${P[1][1]}`,f=`M${P[1][0]} ${P[1][1]}L${P[2][0]} ${P[2][1]}`,fw=r1(w*.84);
  const two=(c,st,add)=>`<path d="${u}" ${c} stroke-width="${r1(w+add)}" stroke-linecap="round" fill="none"${st}/><path d="${f}" ${c} stroke-width="${r1(fw+add)}" stroke-linecap="round" fill="none"${st}/>`;
  return two('stroke="#14161b"',"",.8)+two(`style="stroke:${col}"`,"",0)+`<path d="${u}" style="stroke:${col}" stroke-width="${fw}" stroke-linecap="round"/>`+
   (shade?two('stroke="#000"',` stroke-opacity="${shade}"`,0):`<path d="M${P[0][0]-.6} ${P[0][1]+.4}L${P[1][0]-.8} ${P[1][1]}L${P[2][0]-.9} ${P[2][1]-.5}" stroke="#fff" stroke-opacity=".2" stroke-width="${w*.3}" stroke-linecap="round" fill="none"/>`)+
   `<path d="M${pt(P[0],P[1],.55).join(" ")}Q${P[1][0]+.9} ${P[1][1]+.2} ${pt(P[1],P[2],.3).join(" ")}" stroke="#000" stroke-opacity=".3" stroke-width=".38" fill="none"/>`;
}
function cuff(P,col,w){const a=pt(P[1],P[2],.74),b=pt(P[1],P[2],.92);return `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#14161b" stroke-width="${w+.8}" stroke-linecap="butt"/><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" style="stroke:${col}" stroke-width="${w}" stroke-linecap="butt"/><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}" stroke="#000" stroke-opacity=".2" stroke-width="${w}" stroke-dasharray=".25 .35"/>`}
function face(sk,hair,o){o=o||{};
  const hd=`M20.8 8.2C20.6 4.6 23 3.4 25.2 3.4C28 3.4 29.2 5.4 29.2 8L29.5 9.2L30.2 10.6L29.3 11C29.3 12.6 28.4 13.6 26.6 13.8C24.4 14 22.4 13.2 21.6 11.6C21 10.6 20.8 9.4 20.8 8.2Z`;
  let s=`<path d="${hd}" fill="${sk}" ${O}/><path d="${hd}" fill="url(#f2h)"/>`;
  s+=`<path d="M22 11.6Q24.2 13.4 26.8 13.2Q28.6 12.9 29.2 11.4Q28.6 13.6 26.6 13.8Q23.8 14 22 11.6Z" fill="#000" opacity=".22"/>`;
  if(o.cauli)s+=`<path d="M22.1 8Q23.4 7.4 23.9 8.6Q24.3 9.4 23.6 10.2Q23.9 11 23 11Q21.8 10.8 22 9.6Q21.6 8.8 22.1 8Z" fill="${sk}" ${O}/><path d="M22.6 8.6Q23.3 8.9 23 9.6M22.6 10Q23.1 10.1 23.2 10.5" stroke="#000" stroke-opacity=".35" stroke-width=".3" fill="none"/>`;
  else s+=`<ellipse cx="22.9" cy="9.2" rx=".95" ry="1.35" fill="${sk}" ${O}/><path d="M22.7 8.5Q23.3 9.1 22.8 9.9" stroke="#000" stroke-opacity=".32" stroke-width=".32" fill="none"/>`;
  if(!o.noEyes){
    s+=`<path d="M26.15 8.45Q26.9 7.75 27.85 8.3Q27.05 8.9 26.15 8.45Z" fill="#f4efe8"/><circle cx="27.2" cy="8.36" r=".39" fill="${o.eye||"#3a2a1c"}"/><circle cx="27.25" cy="8.36" r=".18" fill="#050505"/><circle cx="27.1" cy="8.22" r=".09" fill="#fff"/>`;
    s+=`<path d="M26.1 8.4Q26.9 7.6 27.9 8.25" stroke="#2a1a12" stroke-width=".26" fill="none"/>`;
    s+=`<path d="M25.8 7.25Q27 ${o.angry?7.05:6.7} 28.35 ${o.angry?7.6:7.15}" stroke="${o.brow||hair}" stroke-width="${o.bw||.6}" fill="none" stroke-linecap="round"/>`;
  }
  if(!o.noNose)s+=`<path d="M28.9 8.4${o.broken?"Q29.6 8.9 29.3 9.4":""}L29.95 10.45Q29.5 10.85 28.85 10.65" stroke="#7a4a2e" stroke-opacity=".7" stroke-width=".38" fill="none"/><circle cx="29.1" cy="10.4" r=".16" fill="#3a1d12" opacity=".6"/>`;
  if(o.shout)s+=`<path d="M26.5 11.35Q27.8 10.9 29.05 11.25Q28.8 13.1 27.7 13.2Q26.8 12.9 26.5 11.35Z" fill="#3a1410" ${O}/><path d="M26.8 11.45Q27.8 11.15 28.85 11.4" stroke="#f3efe6" stroke-width=".5" fill="none"/><path d="M27.3 12.7Q27.8 12.9 28.3 12.65" stroke="#c0525a" stroke-width=".35" fill="none"/>`;
  else if(!o.noMouth)s+=`<path d="M26.9 11.95Q27.75 12.2 28.55 11.85" stroke="#6e3328" stroke-width=".48" fill="none"/><path d="M27.2 12.55Q27.8 12.7 28.2 12.5" stroke="#000" stroke-opacity=".18" stroke-width=".3" fill="none"/>`;
  if(o.stub)s+=`<path d="M22.4 10.4Q23.6 13.4 26.4 13.1Q28.4 12.6 28.6 10.9L27.4 11.2Q27.6 12.1 26.3 12.4Q24 12.5 23.3 10.3Z" fill="${hair}" opacity="${o.stub}"/><path d="M26.7 11.3Q27.8 11.05 28.7 11.3" stroke="${hair}" stroke-opacity="${o.stub*1.3}" stroke-width=".45" fill="none"/>`;
  return s;
}
function neck(sk){return `<path d="M22.6 12.4H26V16.4H22.6Z" fill="${sk}" ${O}/><path d="M22.6 12.6H26V15.2Q24.3 14.2 22.6 15.2Z" fill="#000" opacity=".26"/>`}
/* buty: t=sneaker|boot|runner, dx przesunięcie tylnej nogi */
function shoe(t,dx,col,c2,accent){
  const X=v=>r1(v+dx);let s="";
  if(t==="boot"){
    s+=`<path d="M${X(25)} 51.8H${X(29.4)}L${X(29.7)} 53.5Q${X(33.6)} 53.9 ${X(34.5)} 55.6V56.5H${X(24.6)}Z" fill="#1d1b19" ${O}/><path d="M${X(25.4)} 52.4Q${X(26.5)} 54.4 ${X(29)} 54.6" stroke="#fff" stroke-opacity=".16" stroke-width=".5" fill="none"/>`;
    s+=`<path d="M${X(29.3)} 52.6L${X(30.6)} 53.6M${X(29.8)} 53.7L${X(31.2)} 53.9M${X(29)} 53.6L${X(30.4)} 52.9" stroke="#8a7e62" stroke-width=".3"/>`;
    s+=`<path d="M${X(24.4)} 56.3H${X(34.7)}V57.7H${X(24.4)}Z" fill="#0c0c0d" ${O}/><path d="M${X(25)} 57.1H${X(34.2)}" stroke="#3a3a3c" stroke-width=".3" stroke-dasharray=".7 .5"/><path d="M${X(24.9)} 51.6H${X(26.2)}V52.4" stroke="#3a3632" stroke-width=".5" fill="none"/>`;
  }else if(t==="runner"){
    const up=col||"#2b2e35";
    s+=`<path d="M${X(25.2)} 53.5H${X(28.8)}Q${X(32.6)} 53.7 ${X(34.6)} 55.4V56.2H${X(24.8)}Z" style="fill:${up}" ${O}/><path d="M${X(25.2)} 53.5H${X(28.8)}Q${X(32.6)} 53.7 ${X(34.6)} 55.4V56.2H${X(24.8)}Z" fill="url(#f2v)"/>`;
    s+=`<path d="M${X(26.2)} 55.8Q${X(28.8)} 53.9 ${X(32.4)} 54.6" stroke="${accent||"#c6f432"}" stroke-width=".7" fill="none"/><path d="M${X(29.3)} 53.7L${X(30.3)} 54.1M${X(29.9)} 53.55L${X(30.9)} 54.0" stroke="#e6e6e6" stroke-width=".25"/>`;
    s+=`<path d="M${X(24.5)} 56.1H${X(34.8)}Q${X(35)} 57.6 ${X(34)} 57.6H${X(24.7)}Q${X(24.2)} 57 ${X(24.5)} 56.1Z" fill="${accent||"#c6f432"}" ${O}/><path d="M${X(24.7)} 56.6H${X(34.6)}" stroke="#fff" stroke-opacity=".7" stroke-width=".35"/><path d="M${X(25.4)} 57.3L${X(26)} 56.9L${X(26.6)} 57.3L${X(27.2)} 56.9L${X(27.8)} 57.3" stroke="#000" stroke-opacity=".35" stroke-width=".25" fill="none"/>`;
    s+=`<path d="M${X(24.9)} 53.4L${X(24.4)} 52.4L${X(25.6)} 52.9" style="fill:${accent||"#c6f432"}" ${O}/>`;
  }else{
    const up=col||"#f2f2ef";
    s+=`<path d="M${X(25)} 53.4H${X(29.2)}Q${X(32.6)} 53.8 ${X(34.3)} 55.6V56.4H${X(24.6)}Z" style="fill:${up}" ${O}/><path d="M${X(25)} 53.4H${X(29.2)}Q${X(32.6)} 53.8 ${X(34.3)} 55.6V56.4H${X(24.6)}Z" fill="url(#f2v)"/>`;
    s+=`<path d="M${X(31.4)} 54.1Q${X(33.8)} 54.6 ${X(34.3)} 56H${X(31.2)}Z" fill="#000" opacity=".1"/><path d="M${X(26.2)} 55.7Q${X(28.6)} 54.3 ${X(31)} 54.9" style="stroke:${accent||"#9aa1ab"}" stroke-width=".65" fill="none"/>`;
    s+=`<path d="M${X(29.2)} 53.6L${X(30)} 54M${X(29.7)} 53.5L${X(30.5)} 53.95M${X(30.2)} 53.6L${X(31)} 54.05" stroke="#8e939b" stroke-width=".25"/>`;
    s+=`<path d="M${X(24.4)} 56.2H${X(34.6)}Q${X(34.8)} 57.6 ${X(33.8)} 57.6H${X(24.6)}Z" fill="#dcdfe4" ${O}/><path d="M${X(24.6)} 56.9H${X(34.4)}" stroke="#9aa0a8" stroke-width=".3"/>`;
  }
  return s;
}
/* spodnie: t=jeans|track|cargo */
function leg(front,t,c2,wide){
  const w=wide||0;
  const d=front?`M${24.2-w*.2} 34.6H${29.6+w}L${29.2+w*.6} 45L${28.8+w*.4} 54.2H${25.2-w*.2}L25 45Z`:`M${18.6-w} 34.6H23.8L23.1 45L22.7 54.2H${19-w*.4}L${18.8-w*.6} 45Z`;
  const base=t==="track"?"#20232a":t==="cargo"?"#2f3329":"#2d3f5e";
  let s=`<path d="${d}" fill="${base}" ${O}/><path d="${d}" fill="url(#f2v)"/>`;
  if(!front)s+=`<path d="${d}" fill="#000" opacity=".3"/>`;
  if(t==="jeans"){
    s+=front?`<path d="M27.3 35.3L27.1 53.6" stroke="#c9a46a" stroke-opacity=".45" stroke-width=".25" stroke-dasharray=".4 .3"/><path d="M25.3 44.3Q27 45.3 29 44.5M25.4 45.4Q26.8 46 28.4 45.6" stroke="#000" stroke-opacity=".3" stroke-width=".38" fill="none"/><path d="M25.5 52.4Q27 53.2 28.7 52.5M25.4 53.3Q27 53.9 28.8 53.4" stroke="#000" stroke-opacity=".32" stroke-width=".35" fill="none"/><path d="M26 37Q26.4 41 26.2 43.6" stroke="#fff" stroke-opacity=".14" stroke-width=".9" fill="none"/>`
      :`<path d="M19.6 44.4Q21.2 45.2 22.9 44.6M19.3 52.6Q20.8 53.3 22.6 52.7" stroke="#000" stroke-opacity=".3" stroke-width=".35" fill="none"/>`;
  }else if(t==="track"){
    s+=front?`<path d="M29.3 35.2L28.9 45L28.55 52.6" style="stroke:${c2}" stroke-width=".55" fill="none"/><path d="M28.75 35.2L28.35 45L28.05 52.6" style="stroke:${c2}" stroke-width=".35" fill="none" opacity=".8"/><path d="M25.2 52.4H28.8V54.2H25.2Z" fill="#14161b" opacity=".7"/><path d="M25.4 41Q27 42.4 28.8 41.2" stroke="#000" stroke-opacity=".3" stroke-width=".35" fill="none"/>`
      :`<path d="M18.9 35.2L19.1 45L19.3 52.6" style="stroke:${c2}" stroke-width=".5" fill="none" opacity=".7"/><path d="M19 52.4H22.7V54.2H19Z" fill="#14161b" opacity=".7"/>`;
  }else{
    s+=front?`<path d="M25.5 40.2H29V44.6H25.6Z" fill="#000" opacity=".22" ${O}/><path d="M25.4 40.1H29.1L29 41.4H25.5Z" fill="#454a3d" ${O}/><circle cx="27.25" cy="40.75" r=".25" fill="#14161b"/><path d="M25.6 47Q27 47.8 28.9 47.2M25.4 52.3Q27 53.2 28.8 52.5" stroke="#000" stroke-opacity=".32" stroke-width=".35" fill="none"/>`
      :`<path d="M19.6 46.6Q21.2 47.4 22.8 46.8" stroke="#000" stroke-opacity=".3" stroke-width=".35" fill="none"/>`;
  }
  return s;
}
function clubScarf(col,c2,long){
  let s=`<path d="M21.1 13.6Q24 15.3 27.5 13.6L28.3 16.4Q24 18.7 20.5 16.4Z" style="fill:${col}" ${O}/><path d="M21 14.9Q24 16.6 27.9 14.9M20.8 15.8Q24 17.6 28.1 15.8" style="stroke:${c2}" stroke-width=".55" fill="none"/>`;
  const L=long?30:26.8;
  s+=`<path d="M25.6 16.9L${long?28.6:28} ${L}L${long?25.8:25.5} ${L-.2}L24.6 17.4Z" style="fill:${col}" ${O}/>`;
  for(let y=19.2;y<L-.6;y+=2.4)s+=`<path d="M${r1(25+((y-17)/(L-17))*.7)} ${r1(y)}L${r1(27.2+((y-17)/(L-17))*1.2)} ${r1(y+.2)}" style="stroke:${c2}" stroke-width=".7"/>`;
  s+=`<path d="M${long?25.9:25.6} ${L-.1}V${L+1}M${long?26.7:26.3} ${L}V${L+1.1}M${long?27.5:27} ${L}V${L+1}M${long?28.3:27.7} ${L}V${L+.9}" style="stroke:${col}" stroke-width=".35"/>`;
  return s;
}
function shades(){return `<path d="M25.4 7.7H29.1V8.7Q28.7 9.7 27.5 9.5Q26.2 9.5 25.4 8.9Z" fill="#0b0b0c"/><path d="M25.4 7.9L22.9 8.5" stroke="#0b0b0c" stroke-width=".5"/><path d="M26 8.15H27.3" stroke="#fff" stroke-opacity=".45" stroke-width=".3"/>`}

function torso(l,r,b,belly){ // l/r: x ramion, b: dół
  const m=(l+r)/2;
  return `M${r1(l+.9)} 17.1Q${m} 14.5 ${r1(r-.9)} 17.1Q${r1(r+.9)} 17.6 ${r1(r+1.1)} 20.4L${r1(r+(belly||0)+.5)} ${belly?27.6:27}Q${r1(r+(belly||0)+.4)} ${r1(b-3)} ${r1(r+.2)} ${b}H${r1(l-.2)}L${r1(l-.4)} 27.4L${r1(l-1)} 20.4Q${r1(l-.9)} 17.6 ${r1(l+.9)} 17.1Z`;
}
/* ---------- klasy ---------- */
const CL={};
/* PROWODYR – lider: kaszkiet z tweedu, kurtka bomber, złoty łańcuch z medalikiem, mosiężny kastet, sygnet (sprzęt) */
CL["Prowodyr"]=(c)=>{const {col,c2,sk,hr,fa}=c;
  const back=[[18.4,18.2],[16.4,25.4],[17.4,31.8]],front=[[29.6,18.2],[31.9,24.6],[35.3,29.7]];
  const tor=torso(16.4,31.6,33.6);
  let body=`<g>${sleeve(back,4.4,col,.3)}${cuff(back,"#1f2126",4.3)}<path d="M15.2 22.1L17.6 21.6L17.9 23.4L15.6 23.9Z" fill="#000" opacity=".25" ${O}/><path d="M15.4 22.5L17.6 22" stroke="#c9a64a" stroke-width=".25"/>${fist(17.6,32.6,sk)}<circle cx="16.3" cy="32" r=".55" fill="url(#f2g)" stroke="#6b4e12" stroke-width=".2"/><rect x="15.95" y="31.7" width=".7" height=".55" rx=".15" fill="#b01822"/></g>`;
  body+=neck(sk)+`<path d="${tor}" style="fill:${col}" ${O}/><path d="${tor}" fill="url(#f2s)"/>`;
  body+=`<path d="M17.8 21.4Q19.6 23.8 18.6 27.4M30.4 21.2Q29 24 30 27.6M20.2 28.4Q22 29.6 21.4 32.6M27.8 28.4Q26.2 29.8 26.8 32.6" stroke="#000" stroke-opacity=".24" stroke-width=".45" fill="none"/><path d="M17.4 18.8Q19.4 17.4 21.6 17.6" stroke="#fff" stroke-opacity=".3" stroke-width=".6" fill="none"/>`;
  body+=`<path d="M22.4 17.4L24 21.4L25.6 17.4Z" fill="#e8742a" ${O}/><path d="M22.9 17.6L24 20.4" stroke="#000" stroke-opacity=".2" stroke-width=".4"/>`;
  body+=`<path d="M21.6 16.9Q24 22.4 26.4 16.9" stroke="url(#f2g)" stroke-width=".7" stroke-dasharray=".55 .28" fill="none"/><circle cx="24" cy="21.5" r="1.05" fill="url(#f2g)" stroke="#6b4e12" stroke-width=".25"/><path d="M23.5 21.1L24.5 21.9M24.5 21.1L23.5 21.9" stroke="#7a5a16" stroke-width=".2"/>`;
  body+=`<path d="M24 21.4V33.4" stroke="#1a1c21" stroke-width=".55"/><path d="M24 21.6V33.4" stroke="#c9a64a" stroke-width=".3" stroke-dasharray=".22 .22"/>`;
  body+=`<path d="M20.2 15.3Q24 17.4 27.8 15.3L28.4 16.9Q24 19.2 19.6 16.9Z" fill="#1f2126" ${O}/><path d="M20 16.1Q24 18.3 28.1 16.1" style="stroke:${c2}" stroke-width=".35" fill="none"/>`;
  body+=`<path d="M15.9 33.4H32.1V35.9H15.9Z" fill="#1f2126" ${O}/><path d="M16 34.2H32M16 35.05H32" style="stroke:${c2}" stroke-width=".38"/><path d="M16 33.4H32V35.9H16Z" fill="#000" opacity=".15" stroke="none" stroke-dasharray=".3 .3"/>`;
  if(fa.stripes)body+=`<path d="M15.6 24.4H32.4M15.9 28.8H32.1" style="stroke:${c2}" stroke-width="1.2" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  let head=face(sk,hr,{stub:.32,brow:hr});
  head+=`<path d="M21 7.6Q20.7 10.4 21.8 11.6L22.4 10.6L22 8.4Z" fill="${hr}" opacity=".9"/><path d="M24.4 7.7L24.6 10.2" stroke="${hr}" stroke-width=".7" opacity=".85"/>`;
  head+=`<path d="M20.3 7.5Q19.9 3 24.8 2.8Q29.1 2.8 29.9 5.6L32.2 6.6Q31.2 7.7 29 7.3Q25 6.6 20.3 7.5Z" fill="#5a5048" ${O}/><path d="M20.3 7.5Q19.9 3 24.8 2.8Q29.1 2.8 29.9 5.6L32.2 6.6Q31.2 7.7 29 7.3Q25 6.6 20.3 7.5Z" fill="url(#f2h)"/>`;
  head+=`<path d="M21.2 6.4Q25 5 29.4 6M21 5.2Q24.6 3.9 28.6 4.8M21.6 4.1Q24.4 3.1 27.4 3.6" stroke="#3b342e" stroke-width=".28" stroke-dasharray=".5 .3" fill="none"/><path d="M29.4 6Q30.6 6.4 32 6.7" stroke="#2c2622" stroke-width=".4" fill="none"/><circle cx="25" cy="3.2" r=".35" fill="#3b342e"/>`;
  if(fa.shades)head+=shades();
  const wp=`<path d="M33.5 28.2H37.9V31.1H33.5Z" fill="url(#f2g)" stroke="#6b4e12" stroke-width=".3" rx=".6"/>`+[34.2,35.3,36.4,37.4].map(x=>`<circle cx="${x}" cy="28.6" r=".55" fill="none" stroke="#fff6c8" stroke-width=".28"/>`).join("")+`<path d="M33.7 30.6H37.7" stroke="#7a5a16" stroke-width=".3"/><path d="M33.9 28.4L33.4 31.6" stroke="#fff" stroke-opacity=".6" stroke-width=".25"/>`;
  const arm=sleeve(front,4.4,col)+cuff(front,"#1f2126",4.3)+`<path d="M${front[0][0]+1} ${front[0][1]+.3}L${front[1][0]+1} ${front[1][1]}L${front[2][0]+.6} ${front[2][1]-.6}" style="stroke:${c2}" stroke-width=".3" fill="none" opacity=".7"/>`+fist(35.6,30.2,sk)+`<g class="wp">${wp}</g>`;
  return {legs:["jeans","sneaker",0],body,head,arm};
};
/* STARY WYGA – weteran: łysina i siwe boki, broda, blizna, ucho kalafior, złamany nos; skórzana kurtka (sprzęt), stalowa rura z taśmą i rdzą, glany */
CL["Stary Wyga"]=(c)=>{const {col,c2,sk,fa}=c,hr="#8f8b85",bk=1.6;
  const back=[[18.6-bk,18.4],[16.4-bk,25.6],[17.4-bk,31.9]],front=[[29.4+bk,18.4],[31.8+bk,24.8],[35+bk,30]];
  const L="#3b2a20";
  const tor=torso(16.8-bk,31.2+bk,34.4,1.2);
  let body=`<g>${sleeve(back,5,L,.3)}<path d="M${back[1][0]-.4} ${back[1][1]+1}L${back[2][0]-.3} ${back[2][1]-1.2}" stroke="#fff" stroke-opacity=".14" stroke-width=".6"/>${fist(back[2][0]+.1,32.7,sk)}<path d="M${back[2][0]-.9} ${32.3}l.6 .5l.5-.6M${back[2][0]-.2} 33.3l.5-.4" stroke="#2c4a7a" stroke-width=".25" fill="none" opacity=".8"/></g>`;
  body+=neck(sk)+`<path d="${tor}" fill="${L}" ${O}/><path d="${tor}" fill="url(#f2l)"/>`;
  body+=`<path d="M21.2 16.2Q24 17.2 26.8 16.2L${27+bk*.3} 34.3H${21-bk*.3}Z" style="fill:${col}" ${O}/><path d="M21.2 16.2Q24 17.2 26.8 16.2L${27+bk*.3} 34.3H${21-bk*.3}Z" fill="url(#f2s)"/><path d="M22.6 17.2Q24 18.3 25.4 17.2" style="stroke:${c2}" stroke-width=".45" fill="none"/><path d="M22.6 23.6Q24 22.4 25.6 23.6Q25.4 25.4 24 26Q22.6 25.4 22.6 23.6Z" style="fill:${c2}" opacity=".75"/>`;
  body+=`<path d="M19.6 15.6L21.8 16.2L22.4 23.6L${19.4-bk*.4} 20.2Z" fill="#4a3528" ${O}/><path d="M28.4 15.6L26.2 16.2L25.6 23.6L${28.6+bk*.4} 20.2Z" fill="#4a3528" ${O}/><path d="M20.2 16.4L21.9 22.2M27.8 16.4L26.1 22.2" stroke="#c7b08a" stroke-opacity=".5" stroke-width=".22" stroke-dasharray=".35 .3"/>`;
  body+=`<path d="M${16.6-bk} 19.4Q${17.6-bk} 24 ${17-bk} 30.6M${31.6+bk} 21Q${32.4+bk} 25 ${31.8+bk} 28.6" stroke="#fff" stroke-opacity=".22" stroke-width=".7" fill="none" stroke-linecap="round"/><path d="M${17.4-bk} 26.6L${20.2-bk*.5} 25.6M${30.8+bk} 26.6L${28-bk*.1} 25.6" stroke="#1b120c" stroke-width=".45"/><path d="M${17.5-bk} 26.9L${20.2-bk*.5} 25.9" stroke="#b9bcc2" stroke-width=".2"/>`;
  body+=`<path d="M${21-bk*.3} 33.2H${27+bk*.3}V34.9H${21-bk*.3}Z" fill="#24170f" ${O}/><path d="M23.2 33.3H25V34.8H23.2Z" fill="none" stroke="#c9ced6" stroke-width=".4"/>`;
  if(fa.stripes)body+=`<path d="M21.4 25.4H26.6M21.3 28.8H26.8" style="stroke:${c2}" stroke-width="1.1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2,1);
  let head=face(sk,hr,{cauli:1,broken:1,brow:"#9a958e",bw:.75,angry:1,noMouth:1,eye:"#4a5a6a"});
  head+=`<path d="M21 9.8Q20.6 6.6 21.6 5.4Q22.2 7.6 23.6 8.2L23.4 10.6Z" fill="${hr}" ${O}/><path d="M21.2 6.6L22.4 8.6M21.1 7.8L22.2 9.6" stroke="#6e6a64" stroke-width=".2"/>`;
  head+=`<path d="M25.8 5.1Q27.2 4.6 28.4 5.2M25.6 5.9Q27 5.4 28.6 6" stroke="#000" stroke-opacity=".2" stroke-width=".25" fill="none"/><path d="M22.6 4.4Q24.4 3.6 26.6 4" stroke="#fff" stroke-opacity=".45" stroke-width=".7" fill="none" stroke-linecap="round"/>`;
  head+=`<path d="M26.5 6.1L27.6 8.1" stroke="#c88070" stroke-width=".35"/>`;
  head+=`<path d="M22.2 10.1Q22 14 25.6 14.8Q29.1 14.8 29.5 11.4L28.7 11.2Q28.2 12.5 26.8 12.5Q25.4 12.3 25.2 11.6Q24 11.2 23.4 9.6Z" fill="${hr}" ${O}/><path d="M23 11.6L23.6 13.4M24.2 12.2L24.6 14.2M25.6 12.8L25.8 14.4M27 13L27.2 14.2M28.2 12.6L28.4 13.6" stroke="#6e6a64" stroke-width=".22"/>`;
  head+=`<path d="M26.4 11.2Q27.8 10.6 29.3 11.2Q28.6 11.9 27.8 11.7Q27 11.9 26.4 11.2Z" fill="#a39f98" ${O}/>`;
  if(fa.shades)head+=shades();
  const P0=[33.6+bk,32.8],P1=[43.4+bk,17.4];
  let wp=`<path d="M${P0[0]} ${P0[1]}L${P1[0]} ${P1[1]}" stroke="#14161b" stroke-width="3"/><path d="M${P0[0]} ${P0[1]}L${P1[0]} ${P1[1]}" stroke="#7b828c" stroke-width="2.2"/><path d="M${P0[0]-.5} ${P0[1]-.3}L${P1[0]-.5} ${P1[1]-.3}" stroke="#d8dde4" stroke-opacity=".7" stroke-width=".45"/><path d="M${P0[0]+.6} ${P0[1]+.4}L${P1[0]+.6} ${P1[1]+.4}" stroke="#3a3f46" stroke-width=".5"/>`;
  [[.42,.5],[.56,.35],[.7,.6],[.83,.4]].forEach(([t,r])=>{const p=pt(P0,P1,t);wp+=`<ellipse cx="${p[0]}" cy="${p[1]}" rx="${r}" ry="${r*.7}" fill="#8a4a1f" opacity=".75"/>`});
  const q0=pt(P0,P1,.02),q1=pt(P0,P1,.24);wp+=`<path d="M${q0[0]} ${q0[1]}L${q1[0]} ${q1[1]}" stroke="#2b2b2e" stroke-width="2.6"/>`;
  for(let t=.04;t<.24;t+=.05){const p=pt(P0,P1,t);wp+=`<path d="M${r1(p[0]-1.2)} ${r1(p[1]-.4)}L${r1(p[0]+1.2)} ${r1(p[1]+.6)}" stroke="#505056" stroke-width=".3"/>`}
  const e0=pt(P0,P1,.9);wp+=`<path d="M${e0[0]} ${e0[1]}L${P1[0]+.3} ${P1[1]-.4}" stroke="#14161b" stroke-width="3.8"/><path d="M${e0[0]} ${e0[1]}L${P1[0]+.3} ${P1[1]-.4}" stroke="#6a717b" stroke-width="3"/><path d="M${e0[0]-.9} ${e0[1]-.5}L${P1[0]-.6} ${P1[1]-.9}" stroke="#cfd4da" stroke-opacity=".55" stroke-width=".4"/>`;
  const arm=sleeve(front,5,L)+`<path d="M${front[0][0]-.4} ${front[0][1]+.6}L${front[1][0]-.6} ${front[1][1]}" stroke="#fff" stroke-opacity=".22" stroke-width=".6"/><path d="M${pt(front[1],front[2],.7).join(" ")}L${pt(front[1],front[2],.88).join(" ")}" stroke="#1b120c" stroke-width="5"/><path d="M${pt(front[1],front[2],.74).join(" ")}L${pt(front[1],front[2],.84).join(" ")}" stroke="#c9ced6" stroke-width=".3" stroke-dasharray=".25 .25"/>`+`<g class="wp">${wp}</g>`+fist(35.4+bk,30.3,sk);
  return {legs:["jeans","boot",1],body,head,arm,bk};
};
/* GNIAZDOWY – prowadzi doping: czapka w barwach, krzyczy, szalik klubowy z frędzlami, megafon na pasku (sprzęt), raca w uniesionej ręce */
CL["Gniazdowy"]=(c)=>{const {col,c2,sk,hr,fa}=c;
  const back=[[18.6,18.2],[16.6,25.4],[17.6,31.8]],front=[[29.4,18.2],[33,14.2],[34.6,9.8]];
  const tor=torso(16.8,31.2,35.4);
  let body=`<g><path d="M16.2 31.6L13 29.8V35.2L16.2 33.6Z" fill="#ecebe7" ${O}/><path d="M16.2 31.6L13 29.8V35.2L16.2 33.6Z" fill="url(#f2v)"/><path d="M14.6 30.7V34.3" style="stroke:${col}" stroke-width=".6"/><ellipse cx="13" cy="32.5" rx=".7" ry="2.75" fill="#c4c7cc" ${O}/><ellipse cx="13.05" cy="32.5" rx=".38" ry="2" fill="#30343a"/><path d="M16.1 31.3H17.4V33.9H16.1Z" fill="#2a2c31" ${O}/><path d="M16.4 33.8L16.1 35.6H17.1L17.2 33.8" fill="#2a2c31" ${O}/><circle cx="16.75" cy="32.6" r=".3" fill="#c0262c"/></g>`;
  body+=`<g>${sleeve(back,4.1,col,.3)}${cuff(back,c2,4)}${fist(17.7,32.6,sk)}</g>`;
  body+=neck(sk)+`<path d="${tor}" style="fill:${col}" ${O}/><path d="${tor}" fill="url(#f2s)"/>`;
  body+=`<path d="M26.2 20.6H28.6V22.6Q27.4 24 26.2 22.6Z" style="fill:${c2}" stroke="#14161b" stroke-width=".25"/><path d="M27.4 21V23.2" style="stroke:${col}" stroke-width=".5"/>`;
  body+=`<path d="M18.4 24.6Q19.6 27 18.8 30.4M29.4 25.4Q28.6 28 29.2 31" stroke="#000" stroke-opacity=".22" stroke-width=".45" fill="none"/>`;
  body+=`<path d="M30.4 17.2L17 31.4" stroke="#202228" stroke-width="1"/><path d="M30.2 17.6L17.1 31.3" stroke="#4a4d55" stroke-width=".25" stroke-dasharray=".4 .3"/>`;
  body+=`<path d="M16.6 34H31.4V35.6H16.6Z" fill="#000" opacity=".28"/>`;
  if(fa.stripes)body+=`<path d="M16.2 26H31.8M16.3 29.6H31.7" style="stroke:${c2}" stroke-width="1.2" opacity=".85"/>`;
  body+=clubScarf(col,c2,1);
  let head=face(sk,hr,{shout:1,angry:1,stub:.18});
  head+=`<path d="M21 7.4Q20.8 10 21.6 11.2L22.4 10.2L22.2 8Z" fill="${hr}"/>`;
  head+=`<path d="M20.5 6.9Q20.7 2.7 25 2.5Q29.1 2.5 29.5 6.2L32.6 7.1Q32.1 8.1 29.7 7.9Q25 7.3 20.5 6.9Z" style="fill:${col}" ${O}/><path d="M20.5 6.9Q20.7 2.7 25 2.5Q29.1 2.5 29.5 6.2L32.6 7.1Q32.1 8.1 29.7 7.9Q25 7.3 20.5 6.9Z" fill="url(#f2h)"/>`;
  head+=`<path d="M20.7 6.1Q25 5.1 29.4 6.1" style="stroke:${c2}" stroke-width=".8" fill="none"/><path d="M24.8 2.6Q24.2 4.6 24.6 6.3M27.6 3Q28 4.6 28.2 6" stroke="#000" stroke-opacity=".25" stroke-width=".25" fill="none"/><circle cx="25" cy="2.55" r=".42" style="fill:${c2}" stroke="#14161b" stroke-width=".2"/><path d="M29.6 7.4Q31.2 7.6 32.4 7.3" stroke="#000" stroke-opacity=".35" stroke-width=".35" fill="none"/>`;
  if(fa.shades)head+=shades();
  const H=[34.4,10.6];
  let wp=`<circle cx="36.2" cy="3.4" r="8.5" fill="url(#f2r)"/>`;
  wp+=`<path d="M33.6 12.2L35.6 4.6" stroke="#14161b" stroke-width="2.3" stroke-linecap="round"/><path d="M33.6 12.2L35.6 4.6" stroke="#c0262c" stroke-width="1.7" stroke-linecap="round"/><path d="M33.4 12L35.3 4.8" stroke="#fff" stroke-opacity=".3" stroke-width=".4"/><path d="M34.1 9.4L34.8 6.8" stroke="#f1e9d8" stroke-width="1.75"/><path d="M34.2 8.6L34.55 7.4" stroke="#c0262c" stroke-width=".4"/><path d="M33.4 12.6L33.8 11.2" stroke="#1d1d20" stroke-width="2"/>`;
  wp+=`<g class="flm"><path d="M35.6 4.8Q33.4 2.6 35.6 -.8Q35.8 1.4 37.4 1.6Q38.4 3.6 35.6 4.8Z" fill="#ff7a1a"/><path d="M35.7 4.4Q34.6 2.8 35.9 1Q36.2 2.4 37 2.6Q37.3 3.8 35.7 4.4Z" fill="#ffd45a"/><circle cx="35.7" cy="4.2" r=".9" fill="#fff8d8"/></g>`;
  wp+=`<circle cx="38.4" cy="1.2" r=".22" fill="#ffd45a"/><circle cx="33.4" cy="1.8" r=".18" fill="#ffb14a"/><circle cx="37.6" cy="-1.4" r=".16" fill="#fff0a0"/><circle cx="34.6" cy="-2.4" r=".14" fill="#ff9a3a"/>`;
  wp+=`<circle cx="33.8" cy="-3.6" r="2.4" fill="#c9c3c0" opacity=".42"/><circle cx="31.2" cy="-5.8" r="3.2" fill="#c9c3c0" opacity=".3"/><circle cx="28" cy="-7.4" r="3.8" fill="#c9c3c0" opacity=".2"/>`;
  const arm=`<g class="wp">${wp}</g>`+sleeve(front,4.1,col)+cuff(front,c2,4)+fist(H[0],H[1],sk);
  return {legs:["jeans","sneaker",0],body,head,arm,accent:c2};
};
/* CZUJKA – zwiadowca: kaptur dresu, komin na twarz, czujne oczy; dres z lampasami, łańcuch rowerowy, buty biegowe (sprzęt) */
CL["Czujka"]=(c)=>{const {col,c2,sk,hr,fa}=c;
  const back=[[19.2,18.4],[17.4,25.4],[18.4,31.6]],front=[[28.8,18.4],[31.4,24.4],[35,29.4]];
  const tor=torso(17.6,30.4,34.8);
  let body=`<g>${sleeve(back,3.7,col,.3)}<path d="M${back[0][0]-1.3} ${back[0][1]+.4}L${back[1][0]-1.3} ${back[1][1]}L${back[2][0]-1.1} ${back[2][1]-.6}" style="stroke:${c2}" stroke-width=".4" fill="none" opacity=".7"/>${cuff(back,"#16181d",3.6)}${fist(18.5,32.4,sk)}</g>`;
  body+=neck(sk)+`<path d="${tor}" style="fill:${col}" ${O}/><path d="${tor}" fill="url(#f2s)"/>`;
  body+=`<path d="M17.2 20.4L17.9 34.6M17.8 20.2L18.4 34.6" style="stroke:${c2}" stroke-width=".4" fill="none"/>`;
  body+=`<path d="M24 16.6V34.6" stroke="#1a1c21" stroke-width=".5"/><path d="M24 16.8V34.6" stroke="#d4d7dc" stroke-width=".28" stroke-dasharray=".22 .22"/><path d="M23.6 18.4H24.4V19.8H23.6Z" fill="#d4d7dc" stroke="#14161b" stroke-width=".15"/>`;
  body+=`<path d="M19 27.6H22.2M25.8 27.6H29" stroke="#000" stroke-opacity=".45" stroke-width=".4"/><path d="M19 24.8Q20.4 26 19.6 29.4M29 24.8Q27.8 26 28.4 29.4" stroke="#000" stroke-opacity=".2" stroke-width=".4" fill="none"/>`;
  body+=`<path d="M17.4 33.6H30.6V35H17.4Z" fill="#16181d" opacity=".8"/>`;
  if(fa.stripes)body+=`<path d="M17 24.4H31M17.2 28.6H30.8" style="stroke:${c2}" stroke-width="1.1" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  let head=face(sk,hr,{noMouth:1,noNose:1,eye:"#2e3b2a",bw:.5});
  head+=`<path d="M23.2 10.1H30L30.2 11Q30.3 13.4 27.8 14.3Q24.6 14.7 23.1 13Z" fill="#1c1e23" ${O}/><path d="M23.2 10.1H30L30.2 11Q30.3 13.4 27.8 14.3Q24.6 14.7 23.1 13Z" fill="url(#f2h)"/><path d="M23.6 11.2H29.8M23.6 12.3H29.5M24 13.4H28.6" stroke="#33363d" stroke-width=".25"/><path d="M28.8 10.4Q29.8 10.9 29.6 11.8" stroke="#000" stroke-opacity=".5" stroke-width=".3" fill="none"/>`;
  head+=`<path fill-rule="evenodd" d="M19.3 9.6Q18.9 2.5 25 2.3Q30.5 2.5 30.8 8.6L30.4 12.9Q28.2 15.8 24.4 15.3Q20.3 14.7 19.3 9.6ZM24.3 5.5Q28.9 4.9 29.7 8.4L30 10.6L29.7 12.6Q27 13.8 24.1 12.8Q23.1 9 24.3 5.5Z" style="fill:${col}" ${O}/><path fill-rule="evenodd" d="M19.3 9.6Q18.9 2.5 25 2.3Q30.5 2.5 30.8 8.6L30.4 12.9Q28.2 15.8 24.4 15.3Q20.3 14.7 19.3 9.6ZM24.3 5.5Q28.9 4.9 29.7 8.4L30 10.6L29.7 12.6Q27 13.8 24.1 12.8Q23.1 9 24.3 5.5Z" fill="url(#f2h)"/><path d="M24.3 5.5Q28.9 4.9 29.7 8.4L30 10.6L29.7 12.6Q27 13.8 24.1 12.8Q23.1 9 24.3 5.5Z" fill="none" stroke="#000" stroke-opacity=".45" stroke-width=".6"/>`;
  head+=`<path d="M21.2 5.2Q20.6 9.6 22.6 13.8" stroke="#000" stroke-opacity=".3" stroke-width=".4" fill="none"/><path d="M22.4 13.6L22 16.4M23 14L22.8 17" style="stroke:${c2}" stroke-width=".3"/><circle cx="22" cy="16.5" r=".2" fill="#d4d7dc"/><circle cx="22.8" cy="17.1" r=".2" fill="#d4d7dc"/>`;
  if(fa.shades)head+=shades();
  const A=[35.4,30],B=[44.6,32.6],C=[40.4,39.6];let wp="";
  for(let i=0;i<=15;i++){const t=i/15,x=(1-t)*(1-t)*A[0]+2*(1-t)*t*B[0]+t*t*C[0],y=(1-t)*(1-t)*A[1]+2*(1-t)*t*B[1]+t*t*C[1],dx=2*(1-t)*(B[0]-A[0])+2*t*(C[0]-B[0]),dy=2*(1-t)*(B[1]-A[1])+2*t*(C[1]-B[1]),an=Math.atan2(dy,dx)*180/Math.PI;
    wp+=i%2?`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx=".62" ry=".2" transform="rotate(${r1(an)} ${r1(x)} ${r1(y)})" fill="#9aa0a8" stroke="#2a2d33" stroke-width=".2"/>`:`<ellipse cx="${r1(x)}" cy="${r1(y)}" rx=".66" ry=".42" transform="rotate(${r1(an)} ${r1(x)} ${r1(y)})" fill="none" stroke="#2a2d33" stroke-width=".55"/><ellipse cx="${r1(x)}" cy="${r1(y)}" rx=".66" ry=".42" transform="rotate(${r1(an)} ${r1(x)} ${r1(y)})" fill="none" stroke="#c4c9d0" stroke-width=".25"/>`}
  const arm=sleeve(front,3.7,col)+`<path d="M${front[0][0]+.9} ${front[0][1]+.2}L${front[1][0]+1} ${front[1][1]}L${front[2][0]+.7} ${front[2][1]-.6}" style="stroke:${c2}" stroke-width=".42" fill="none"/>`+cuff(front,"#16181d",3.6)+`<g class="wp">${wp}</g>`+fist(35.4,30,sk)+`<path d="M34.2 29.4Q35.4 31.2 36.8 29.8" stroke="#9aa0a8" stroke-width=".5" fill="none"/>`;
  return {legs:["track","runner",0],body,head,arm,slim:1};
};
/* BOJÓWKARZ – najmocniejszy cios: kominiarka, bluza z kapturem i kieszenią, mapa dzielnic w kieszeni (sprzęt), taktyczne rękawice, kij bejsbolowy z taśmą, bojówki */
CL["Bojówkarz"]=(c)=>{const {col,c2,sk,fa}=c;
  const back=[[18.4,18.4],[16.2,25.6],[17.2,32]],front=[[29.6,18.4],[32,24.8],[35.4,30]];
  const tor=torso(16.6,31.4,35.6,.4);
  let body=`<g>${sleeve(back,4.6,col,.3)}${cuff(back,col,4.4)}${fist(17.4,32.8,sk,1)}</g>`;
  body+=`<path d="M19.4 13.2Q19.4 17.4 23.4 17.6L28.6 17.4Q29.6 15.6 28.6 13.6Q24 16.4 19.4 13.2Z" style="fill:${col}" ${O}/><path d="M19.4 13.2Q19.4 17.4 23.4 17.6L28.6 17.4Q29.6 15.6 28.6 13.6Q24 16.4 19.4 13.2Z" fill="#000" opacity=".3"/>`;
  body+=`<path d="${tor}" style="fill:${col}" ${O}/><path d="${tor}" fill="url(#f2s)"/>`;
  body+=`<path d="M18.4 26.6H29.6L30.8 32.2H17.2Z" fill="#000" opacity=".16" ${O}/><path d="M18.8 27.1H29.2M17.7 31.7H30.3" stroke="#fff" stroke-opacity=".18" stroke-width=".22" stroke-dasharray=".3 .3"/><path d="M18.5 26.8L17.5 31.9M29.5 26.8L30.5 31.9" stroke="#000" stroke-opacity=".35" stroke-width=".35"/>`;
  body+=`<path d="M19.6 26.8L21.6 23.6L24.4 25L22.8 27.2Z" fill="#efe6cf" ${O}/><path d="M20.6 25.2L23.4 26.2M21.6 23.6L22.2 26.4" stroke="#b9ab88" stroke-width=".2"/><path d="M20.4 26.2Q21.6 24.6 22.6 25.4T23.8 25.2" stroke="#c0262c" stroke-width=".3" fill="none" stroke-dasharray=".4 .2"/><circle cx="23.7" cy="25.2" r=".25" fill="#c0262c"/>`;
  body+=`<path d="M22.6 17.4L22.2 23.4M25.4 17.4L25.8 23.6" style="stroke:${c2}" stroke-width=".38"/><path d="M22.2 23.3V24.2M25.8 23.5V24.4" stroke="#c9ced6" stroke-width=".5"/>`;
  body+=`<path d="M18 21.4Q19.6 23.6 18.8 26.2M30 21.2Q28.8 23.6 29.4 26.2" stroke="#000" stroke-opacity=".22" stroke-width=".45" fill="none"/><path d="M15.8 34.2H32.2V35.7H15.8Z" fill="#000" opacity=".28"/><path d="M15.9 34.4H32.1" stroke="#000" stroke-opacity=".3" stroke-width=".25" stroke-dasharray=".25 .25"/>`;
  if(fa.stripes)body+=`<path d="M15.8 22.6H32.3" style="stroke:${c2}" stroke-width="1.2" opacity=".85"/>`;
  if(fa.scarf)body+=clubScarf(col,c2);
  const hd=`M20.4 8.4C20.2 4.4 22.8 3.1 25.2 3.1C28.2 3.1 29.4 5.2 29.4 8L29.7 9.2L30.4 10.6L29.5 11.1C29.5 12.8 28.5 13.9 26.6 14.1C24.2 14.3 22.2 13.4 21.3 11.8C20.7 10.8 20.4 9.6 20.4 8.4Z`;
  let head=`<path d="${hd}" fill="#1b1c20" ${O}/><path d="${hd}" fill="url(#f2h)"/>`;
  head+=`<path d="M25.4 7.4H29.5L29.7 9.7H25.3Z" fill="${sk}" ${O}/><path d="M25.4 7.4H29.5L29.6 8.1H25.4Z" fill="#000" opacity=".3"/>`;
  head+=`<path d="M26.15 8.75Q26.9 8.05 27.85 8.6Q27.05 9.2 26.15 8.75Z" fill="#f4efe8"/><circle cx="27.25" cy="8.66" r=".38" fill="#3a2a1c"/><circle cx="27.3" cy="8.66" r=".18" fill="#050505"/><circle cx="27.15" cy="8.52" r=".09" fill="#fff"/><path d="M25.9 7.95Q27 7.7 28.4 8.2" stroke="#1b120c" stroke-width=".55" fill="none"/>`;
  head+=`<path d="M22.4 4.6Q22 9 22.6 12.8M23.8 3.6Q23.4 5.6 23.6 7.2M24 10.2Q24.2 12.4 25 13.8M26.6 10.2V13.8M28.2 10.2Q28.4 12 27.8 13.6" stroke="#2c2e34" stroke-width=".28" fill="none"/><path d="M25.2 7.2H29.6M25.1 9.9H29.7" stroke="#2c2e34" stroke-width=".5"/>`;
  if(fa.shades)head+=`<path d="M25.6 7.7H29.4V9.4Q28.6 9.8 27.4 9.6Q26.2 9.6 25.6 9.2Z" fill="#0b0b0c"/><path d="M26.2 8.1H27.4" stroke="#fff" stroke-opacity=".45" stroke-width=".3"/>`;
  const P0=[33.4,33.6],P1=[46.6,11.4],ax=[P1[0]-P0[0],P1[1]-P0[1]],L=Math.hypot(ax[0],ax[1]),nx=-ax[1]/L,ny=ax[0]/L;
  const W=t=>t<.42?.5:t<.62?.5+(t-.42)/.2*.75:1.25;let lp=[],rp=[];
  for(let i=0;i<=14;i++){const t=i/14,p=pt(P0,P1,t),w=W(t);lp.push(`${r1(p[0]+nx*w)} ${r1(p[1]+ny*w)}`);rp.unshift(`${r1(p[0]-nx*w)} ${r1(p[1]-ny*w)}`)}
  const e=pt(P0,P1,1);
  let wp=`<path d="M${lp.join("L")}Q${r1(e[0]+ax[0]/L*1.3)} ${r1(e[1]+ax[1]/L*1.3)} ${rp[0]}L${rp.join("L")}Z" fill="url(#f2w)" ${O}/>`;
  [.66,.76,.88].forEach(t=>{const a=pt(P0,P1,t-.05),b=pt(P0,P1,t+.04);wp+=`<path d="M${r1(a[0]+nx*.4)} ${r1(a[1]+ny*.4)}L${r1(b[0]+nx*.3)} ${r1(b[1]+ny*.3)}" stroke="#6e4624" stroke-opacity=".55" stroke-width=".18"/>`});
  [[.72,.6],[.82,-.5],[.9,.3]].forEach(([t,o])=>{const p=pt(P0,P1,t);wp+=`<ellipse cx="${r1(p[0]+nx*o)}" cy="${r1(p[1]+ny*o)}" rx=".35" ry=".22" fill="#3a2414" opacity=".6"/>`});
  const k0=pt(P0,P1,-.02);wp+=`<ellipse cx="${k0[0]}" cy="${k0[1]}" rx=".95" ry=".7" transform="rotate(${r1(Math.atan2(ax[1],ax[0])*180/Math.PI)} ${k0[0]} ${k0[1]})" fill="#5a3a1e" ${O}/>`;
  const g0=pt(P0,P1,.03),g1=pt(P0,P1,.3);wp+=`<path d="M${g0[0]} ${g0[1]}L${g1[0]} ${g1[1]}" stroke="#141416" stroke-width="1.25"/>`;
  for(let t=.05;t<.3;t+=.045){const p=pt(P0,P1,t);wp+=`<path d="M${r1(p[0]-nx*.6)} ${r1(p[1]-ny*.6)}L${r1(p[0]+nx*.6+ax[0]/L*.4)} ${r1(p[1]+ny*.6+ax[1]/L*.4)}" stroke="#3a3a40" stroke-width=".22"/>`}
  const arm=sleeve(front,4.6,col)+cuff(front,col,4.4)+`<g class="wp">${wp}</g>`+fist(35.5,30.3,sk,1);
  return {legs:["cargo","boot",.4],body,head,arm};
};

/* ---------- składanie ---------- */
function fig2(cls,col,flip,k,fa,c2){
  fa=fa||{};c2=c2||"#fff";k=k||0;
  const f=CL[cls]||CL["Prowodyr"],sk=SK[k%5],hr=HR[k%5];
  const p=f({col,c2,sk,hr,fa,k}),[pants,shoeT,wide]=p.legs;
  const shC=fa.shoes?col:null,acc=p.accent||(fa.shoes?"#f2f2ef":shoeT==="runner"?"#c6f432":null);
  const inner=`<ellipse cx="24.6" cy="57.7" rx="11.6" ry="2.2" fill="#000" opacity=".32"/><ellipse cx="24.6" cy="57.7" rx="7" ry="1.3" fill="#000" opacity=".25"/>
<g class="lg2">${leg(0,pants,c2,wide)}${shoe(shoeT,-6.2,shC,c2,acc)}</g>
<g class="lg1">${leg(1,pants,c2,wide)}${shoe(shoeT,0,shC,c2,acc)}</g>
<g class="bd">${p.body}${p.head}<g class="arf">${p.arm}</g></g>`;
  return `<svg viewBox="0 0 48 60" width="48" height="60" style="overflow:visible" aria-hidden="true">${DEFS}${flip?`<g transform="translate(48 0) scale(-1 1)">${inner}</g>`:inner}</svg>`;
}
G.fig2=fig2;G.FIG2_CLASSES=Object.keys(CL);
})(typeof window!=="undefined"?window:globalThis);
