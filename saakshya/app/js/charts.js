// SVG chart builders (return HTML strings).
export function breakpointChart(kaal){
  const {years,ndvi,conversion_year:conv}=kaal;
  const W=560,H=220,x0=40,x1=545,y0=20,y1=200;
  const xmin=years[0],xmax=years[years.length-1];
  const X=y=>x0+(y-xmin)/(xmax-xmin)*(x1-x0);
  const Y=v=>y1-(v-0.0)/(1.0)*(y1-y0);
  const pts=years.map((y,i)=>`${X(y).toFixed(1)},${Y(ndvi[i]).toFixed(1)}`).join(' ');
  const preMean=ndvi.filter((_,i)=>years[i]<conv).reduce((a,b)=>a+b,0)/ndvi.filter((_,i)=>years[i]<conv).length;
  const postArr=ndvi.filter((_,i)=>years[i]>=conv);const postMean=postArr.reduce((a,b)=>a+b,0)/postArr.length;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:200px">
    <g stroke="#7dffb0" stroke-width="0.5" opacity="0.08"><line x1="${x0}" y1="${Y(0.8)}" x2="${x1}" y2="${Y(0.8)}"/><line x1="${x0}" y1="${Y(0.4)}" x2="${x1}" y2="${Y(0.4)}"/></g>
    <text x="6" y="${Y(0.8)+4}" fill="#5f7a6c" font-size="9" font-family="JetBrains Mono">0.8</text>
    <text x="6" y="${Y(0.4)+4}" fill="#5f7a6c" font-size="9" font-family="JetBrains Mono">0.4</text>
    <polyline points="${pts}" fill="none" stroke="#3f6b52" stroke-width="1"/>
    <line x1="${x0}" y1="${Y(preMean)}" x2="${X(conv)}" y2="${Y(preMean)}" stroke="#7dffb0" stroke-width="3" style="filter:drop-shadow(0 0 5px #7dffb0)"/>
    <line x1="${X(conv)}" y1="${Y(postMean)}" x2="${x1}" y2="${Y(postMean)}" stroke="#f0a839" stroke-width="3" style="filter:drop-shadow(0 0 5px #f0a839)"/>
    <line x1="${X(conv)}" y1="${y0}" x2="${X(conv)}" y2="${y1}" stroke="#ff6a4d" stroke-width="1.6" stroke-dasharray="4 3"/>
    <text x="${X(conv)+6}" y="34" fill="#ff6a4d" font-size="11" font-family="JetBrains Mono">breakpoint ${conv}</text>
    <line x1="${X(2005)}" y1="${y0}" x2="${X(2005)}" y2="${y1}" stroke="#f0a839" stroke-width="1" stroke-dasharray="2 3" opacity="0.8"/>
    <text x="${X(2005)+5}" y="196" fill="#f0a839" font-size="9" font-family="JetBrains Mono">2005</text>
    <g fill="#5f7a6c" font-size="9" font-family="JetBrains Mono"><text x="${x0-4}" y="214">${xmin}</text><text x="${x1-20}" y="214">now</text></g>
  </svg>`;
}
export function confidenceDial(conf){
  const ang=Math.PI*(1-conf); const r=80,cx=100,cy=110;
  const ex=cx+r*Math.cos(ang), ey=cy-r*Math.sin(ang);
  return `<svg viewBox="0 0 200 130" style="width:190px">
    <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="#122019" stroke-width="18"/>
    <path d="M20 110 A80 80 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="#7dffb0" stroke-width="18" style="filter:drop-shadow(0 0 8px rgba(125,255,176,.6))"/>
    <text x="100" y="88" text-anchor="middle" fill="#7dffb0" font-size="34" font-family="JetBrains Mono">${conf.toFixed(2)}</text>
  </svg>`;
}
const CHIP={forest:['#1f5a30','#2a6a3a'],cultivated:['#7a6a40','#8a7648'],corona:['#3a3a3a','#585858']};
export function decadeStrip(kaal){
  return `<div class="strip">`+kaal.evidence_strip.map(s=>{
    const c=s.kind==='corona'?CHIP.corona:CHIP[s.label];
    const cut=s.year===2005?' cut':'';
    return `<div class="chip${cut}"><div class="sq" style="background:linear-gradient(135deg,${c[0]},${c[1]})"></div>
      <div class="cap" style="${s.year===2005?'color:#f0a839':''}">${s.year}<br><span style="color:#5f7a6c">${s.kind}</span></div></div>`;
  }).join('')+`</div>`;
}
