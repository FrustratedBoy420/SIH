import {mockKaal} from './kaal.js';
import {matchEvidence,VERDICT_STYLE} from './nyaya.js';
import {breakpointChart,confidenceDial,decadeStrip} from './charts.js';

const app=document.getElementById('app');
let DB=null, MAP=null;

const q=s=>document.querySelector(s);
const villageName=lgd=>(DB.villages.find(v=>v.lgd_code===lgd)||{}).name||lgd;
const village=lgd=>DB.villages.find(v=>v.lgd_code===lgd)||{};
const getClaim=id=>DB.claims.find(c=>c.claim_id===id);
const STATUSCOL={granted:'#7dffb0',pending:'#f0a839',rejected:'#ff6a4d'};

function toast(msg){const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600);}

// ---------- ICONS ----------
const ICN={globe:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f0c552" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3q5 5 0 18M12 3q-5 5 0 18"/></svg>',
  map:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="m9 3-6 3v15l6-3 6 3 6-3V3l-6 3-6-3zM9 3v15M15 6v15"/></svg>',
  grid:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
  user:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
  help:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 1 1 4.5 2.6c-.9.5-1.6 1.2-1.6 2.4"/><circle cx="12" cy="17.5" r="0.6" fill="currentColor"/></svg>'};
// inline glossary tooltip: a small ⓘ with a native title
const tip=t=>`<span class="tipi" title="${t.replace(/"/g,'&quot;')}">ⓘ</span>`;

// ---------- SHELL ----------
function shell(active,inner){
  return `<div class="shell">
    <div class="topbar">
      <div class="brand">${ICN.globe}<span class="mono" style="color:#e8f3ec">SAAKSHYA</span></div>
      <span class="lbl" style="border-left:1px solid var(--line);padding-left:14px">${active.label}</span>
      <div style="flex-grow:1"></div>
      <span class="chip">MADHYA PRADESH</span><span class="chip">DINDORI</span><span class="chip active">BAJAG</span>
      <span class="chip" style="border-color:rgba(240,168,57,.3);color:#f0a839" title="Prototype — synthetic demo data, not real claim records.">DEMO</span>
    </div>
    <div class="body">
      <div class="side">
        <a data-link href="#/atlas" class="${active.k==='atlas'?'active':''}">${ICN.map} Atlas</a>
        <a data-link href="#/dashboard" class="${active.k==='dash'?'active':''}">${ICN.grid} Officer</a>
        <a data-link href="#/gramsabha/FRA-DND-0007" class="${active.k==='gs'?'active':''}">${ICN.user} Gram Sabha</a>
        <a data-link href="#/about" class="${active.k==='about'?'active':''}">${ICN.help} How it works</a>
        <div style="flex-grow:1"></div>
        <a data-link href="#/" class="lbl" style="color:var(--muted)">‹ sign out</a>
      </div>
      <div class="main">${inner}</div>
    </div></div>`;
}

// ---------- LANDING ----------
function landing(){
  return {html:`<div class="landing">
    <img src="assets/nighthero.jpg" alt="">
    <div class="veil"></div>
    <div class="nav">
      <div class="brand">${ICN.globe}<span>SAAKSHYA</span></div>
      <div style="flex-grow:1"></div>
      <div class="links mono"><a data-link href="#/about" style="color:#cdd6d0">ABOUT</a><a data-link href="#/about" style="color:#cdd6d0">PROBLEM</a><a data-link href="#/atlas" style="color:#cdd6d0">ATLAS</a></div>
      <button data-link href="#/atlas" class="mono" style="border:1px solid rgba(240,197,82,.5);color:#f0c552;background:transparent;font-size:12px;letter-spacing:1px;padding:8px 16px;border-radius:3px">SIGN IN</button>
    </div>
    <div class="wordmark"><h1>Saakshya</h1><div class="sub mono">Evidence for the claims that were rejected</div></div>
    <div class="signband">
      <button data-link href="#/atlas" class="btn-amber" style="background:#f0c552;color:#20180a;font-weight:700;padding:14px 34px;box-shadow:0 0 34px rgba(240,197,82,.45)">Sign in</button>
      <button data-link href="#/atlas" class="mono" style="border:1px solid rgba(230,237,232,.4);background:rgba(2,4,12,.4);color:#e6ede8;font-size:13px;padding:14px 30px;border-radius:5px;letter-spacing:1px">LOGIN</button>
    </div></div>`};
}

// ---------- ATLAS ----------
function atlas(){
  const inner=`<div class="atlas">
    <div class="layers">
      <div class="hint">Each dot is one forest-rights claim. <b style="color:#ff6a4d">Coral = rejected</b> — click one to see its satellite evidence. <a data-link href="#/about" style="color:var(--lime)">How it works →</a></div>
      <div class="lbl" style="margin-bottom:10px">Layers</div>
      <label class="layer"><input type="checkbox" checked data-layer="granted"><span class="dot" style="background:#7dffb0;box-shadow:0 0 8px #7dffb0"></span>Granted</label>
      <label class="layer"><input type="checkbox" checked data-layer="pending"><span class="dot" style="background:#f0a839;box-shadow:0 0 8px #f0a839"></span>Pending</label>
      <label class="layer" style="background:rgba(255,106,77,.08);border:1px solid rgba(255,106,77,.3);border-radius:4px"><input type="checkbox" checked data-layer="rejected"><span class="dot" style="background:#ff6a4d;box-shadow:0 0 10px #ff6a4d"></span><b>Rejected</b></label>
      <div class="lbl" style="margin:12px 0 4px">Overlays</div>
      <label class="layer"><input type="checkbox" data-overlay="conflict"><span style="width:11px;height:11px;background:repeating-linear-gradient(45deg,#ff6a4d,#ff6a4d 2px,transparent 2px,transparent 5px)"></span>Conflict / overlap</label>
      <label class="layer"><input type="checkbox" data-overlay="evidence"><span style="width:11px;height:11px;background:linear-gradient(90deg,#0e1a15,#7dffb0);border-radius:2px"></span>Evidence-strength</label>
      <div style="flex-grow:1"></div>
      <div class="lbl">Block · Bajag</div>
      <div style="display:flex;gap:14px;margin-top:10px">
        <div><div class="mono glow-coral" style="font-size:24px">${DB.claims.filter(c=>c.status==='rejected').length}</div><div class="lbl">rejected</div></div>
        <div><div class="mono glow-lime" style="font-size:24px">${DB.claims.filter(c=>c.status==='granted').length}</div><div class="lbl">granted</div></div>
        <div><div class="mono glow-amber" style="font-size:24px">${recoverable()}</div><div class="lbl">recover</div></div>
      </div>
    </div>
    <div id="map"></div>
    <div class="claimcard" id="claimcard">${claimCardEmpty()}</div>
  </div>`;
  return {html:shell({k:'atlas',label:'ATLAS · WEBGIS'},inner),mount:mountMap};
}
function claimCardEmpty(){return `<div class="lbl" style="margin-top:40px;text-align:center;line-height:2">◦ select a claim<br>on the map</div>`;}
function claimCard(c){
  const k=mockKaal(c),m=c.rejection_order?matchEvidence(c,k):null;
  return `<div style="display:flex;align-items:center;justify-content:space-between">
      <span class="mono" style="font-size:15px;color:#e8f3ec">${c.claim_id}</span>
      <span class="pill ${c.status==='rejected'?'rej':c.status==='granted'?'grant':'pend'}">${c.status.toUpperCase()}</span></div>
    <div class="lbl" style="line-height:1.8">${villageName(c.village_lgd)}, Dindori · ${c.claim_type} · ${c.claimant_category}</div>
    <div style="height:1px;background:var(--line)"></div>
    <div class="lbl">Evidence strength · KAAL ${tip('How confident the satellite engine is that it correctly dated when this land changed from forest to farm/home. 0 to 1 — higher is stronger evidence.')}</div>
    <div style="display:flex;align-items:center;gap:12px"><div class="bar"><i style="width:${Math.round(k.confidence*100)}%"></i></div><span class="mono glow-lime" style="font-size:18px">${k.confidence.toFixed(2)}</span></div>
    <div style="font-size:12.5px;background:rgba(125,255,176,.06);border:1px solid rgba(125,255,176,.2);border-radius:5px;padding:11px 12px;line-height:1.5">Satellite shows this land became farm/settlement in <b class="glow-lime">~${k.conversion_year}</b> — ${k.conversion_year<2005?'<b class="glow-lime">before</b>':'after'} the <b class="glow-amber">2005</b> legal cutoff${tip('FRA requires occupation before 13-Dec-2005. If the land was already farmed before then, the rejection was likely wrong.')}.</div>
    ${decadeStrip(k)}
    <div style="flex-grow:1"></div>
    <button data-link href="#/claim/${c.claim_id}" class="btn-amber" style="text-align:center">Open evidence →</button>`;
}
function recoverable(){return DB.claims.filter(c=>{if(c.status!=='rejected')return false;const m=matchEvidence(c,mockKaal(c));return m.verdict==='ANSWERED'||m.verdict==='STRENGTHENED_NOT_PROVEN';}).length;}

const lerpHex=(a,b,t)=>{const p=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));const A=p(a),B=p(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('');};
function mountMap(){
  const c=DB.district.center;
  MAP=L.map('map',{zoomControl:true,attributionControl:false}).setView(c,10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(MAP);
  window._markers={}; window._evidenceOn=false;
  DB.claims.forEach(c=>{
    const [lat,lon]=c.geometry_centroid;
    const conf=mockKaal(c).confidence;
    const mk=L.circleMarker([lat,lon],{radius:9,color:STATUSCOL[c.status],weight:2,fillColor:STATUSCOL[c.status],fillOpacity:.55});
    mk.bindTooltip(`${c.claim_id} · ${c.status}`,{direction:'top'});
    mk.on('click',()=>{q('#claimcard').innerHTML=claimCard(c);highlight(c.claim_id);});
    mk.addTo(MAP); window._markers[c.claim_id]={mk,status:c.status,conf,claim:c};
  });
  // conflict layer: dashed links between overlapping claims
  window._conflictLayer=L.layerGroup(); const drawn=new Set();
  DB.claims.filter(c=>c.conflict_with).forEach(c=>{
    const key=[c.claim_id,c.conflict_with].sort().join('|'); if(drawn.has(key))return; drawn.add(key);
    const o=getClaim(c.conflict_with); if(!o)return;
    L.polyline([c.geometry_centroid,o.geometry_centroid],{color:'#ff6a4d',weight:2,dashArray:'5 4',opacity:.85}).addTo(window._conflictLayer);
    [c,o].forEach(p=>L.circleMarker(p.geometry_centroid,{radius:16,color:'#ff6a4d',weight:1.5,dashArray:'4 3',fill:false,opacity:.7}).addTo(window._conflictLayer));
  });
  // status layer filters
  document.querySelectorAll('[data-layer]').forEach(cb=>cb.addEventListener('change',()=>{
    const on={};document.querySelectorAll('[data-layer]').forEach(x=>on[x.dataset.layer]=x.checked);
    Object.values(window._markers).forEach(({mk,status})=>{ if(on[status])mk.addTo(MAP); else MAP.removeLayer(mk); });
  }));
  // overlays
  document.querySelector('[data-overlay="conflict"]').addEventListener('change',e=>{
    if(e.target.checked)window._conflictLayer.addTo(MAP); else MAP.removeLayer(window._conflictLayer);
  });
  document.querySelector('[data-overlay="evidence"]').addEventListener('change',e=>{
    window._evidenceOn=e.target.checked;
    Object.values(window._markers).forEach(({mk,status,conf})=>{
      if(e.target.checked){const col=lerpHex('#0e1a15','#7dffb0',conf);mk.setStyle({fillColor:col,color:col,fillOpacity:.85,radius:6+conf*8});}
      else mk.setStyle({fillColor:STATUSCOL[status],color:STATUSCOL[status],fillOpacity:.55,radius:9});
    });
  });
  const flag=getClaim('FRA-DND-0007'); q('#claimcard').innerHTML=claimCard(flag);
  const ov=new URLSearchParams(location.search).get('ov');
  if(ov)ov.split(',').forEach(o=>{const cb=document.querySelector(`[data-overlay="${o}"]`);if(cb){cb.checked=true;cb.dispatchEvent(new Event('change'));}});
}
function highlight(id){Object.entries(window._markers).forEach(([k,{mk,status,conf}])=>{const base=window._evidenceOn?(6+conf*8):9;mk.setStyle({radius:k===id?base+4:base,weight:k===id?3:2});});}

// ---------- CLAIM (KAAL) ----------
function claimView(id){
  const c=getClaim(id); if(!c)return {html:shell({k:'atlas',label:'CLAIM'},'<div class="page">Not found</div>')};
  const k=mockKaal(c),m=c.rejection_order?matchEvidence(c,k):null;
  const vs=m?VERDICT_STYLE[m.verdict]:['ok','GRANTED'];
  const d=k.confidence_drivers;
  const inner=`<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div><div class="lbl">KAAL · Historic evidence engine</div><div class="mono" style="font-size:22px;color:#e8f3ec;margin-top:4px">${c.claim_id}</div>
        <div class="lbl" style="margin-top:2px">${villageName(c.village_lgd)}, Dindori · ${c.claim_type} · ${c.claimant_category}</div></div>
      <span class="pill ${c.status==='rejected'?'rej':'grant'}">${c.status.toUpperCase()}${c.rejection_order?' · '+c.rejection_order.rejecting_body+' '+c.rejection_order.order_date.slice(0,4):''}</span></div>
    ${m?`<div class="banner ${vs[0]}"><b style="color:${vs[0]==='ok'?'#7dffb0':vs[0]==='warn'?'#f0a839':'#ff6a4d'}">${vs[1]}</b></div>`:''}
    <div style="display:flex;align-items:center;justify-content:space-between;margin:18px 0 10px"><span class="lbl">Decade evidence strip ${tip('One satellite snapshot per era. Green = forest, tan = cultivated/settled. Watch it flip from green to tan — that flip is the proof the land was used.')}</span><span class="mono glow-amber" style="font-size:10px">◉ 2005 CUTOFF</span></div>
    ${decadeStrip(k)}
    <div style="display:flex;gap:16px;margin-top:18px">
      <div class="card" style="flex-grow:1;padding:14px"><div class="lbl" style="margin-bottom:6px">Land-cover trajectory ${tip('Each dot = greenness (NDVI) of the land in one year, from satellite. High = forest, low = farmland. The red line marks the year it changed — the “breakpoint”. If that year is left of the 2005 line, the family was farming before the cutoff.')}</div>${breakpointChart(k)}</div>
      <div class="card" style="width:230px;padding:14px;display:flex;flex-direction:column;align-items:center;justify-content:center">
        ${confidenceDial(k.confidence)}<div class="lbl">confidence</div>
        <div class="mono" style="font-size:9.5px;color:#5f7a6c;text-align:center;margin-top:10px;line-height:1.6">${d.valid_observation_years} cloud-free yrs<br>ΔNDVI ${d.break_magnitude_ndvi} · georef ±${d.corona_registration_rmse_m}m</div></div>
    </div>
    ${m?`<div class="card" style="padding:16px;margin-top:16px"><div class="lbl" style="margin-bottom:8px">Finding</div><div style="font-size:14px;color:#e8f3ec;line-height:1.55">${m.finding}</div></div>`:''}
    <div style="display:flex;gap:12px;margin-top:18px">
      <button data-link href="#/dossier/${c.claim_id}" class="btn-amber">Generate dossier (PDF)</button>
      ${m?`<button data-link href="#/nyaya/${c.claim_id}" class="btn-ghost">OPEN NYAYA APPEAL →</button>`:''}
    </div></div>`;
  return {html:shell({k:'atlas',label:'KAAL · EVIDENCE'},inner)};
}

// ---------- NYAYA ----------
function nyayaView(id){
  const c=getClaim(id);const k=mockKaal(c);const m=matchEvidence(c,k);const v=village(c.village_lgd);
  const vs=VERDICT_STYLE[m.verdict];
  const schemes=[['Jal Jeevan Mission',v.water_index<0.35],['MGNREGA land dev',true],['DAJGUA',!!v.dajgua_target],['PM-KISAN — pending title',false]];
  const inner=`<div class="page">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div class="lbl">NYAYA · Appeal support</div><div class="mono" style="font-size:20px;color:#e8f3ec;margin-top:4px">${c.claim_id} · ${villageName(c.village_lgd)}</div></div>
      <span class="pill rej">REJECTED · ${c.rejection_order.rejecting_body} ${c.rejection_order.order_date.slice(0,4)}</span></div>
    <div class="banner ${vs[0]}" style="margin-top:14px"><b style="color:${vs[0]==='ok'?'#7dffb0':vs[0]==='warn'?'#f0a839':'#ff6a4d'}">${vs[1]}</b><span class="lbl" style="text-transform:none;color:#8ea79a">· ${m.finding}</span></div>
    <div class="card" style="margin-top:16px;overflow:hidden"><div class="lbl" style="padding:12px 16px;border-bottom:1px solid var(--line)">Rejection-reason match</div>
      <div class="kv"><div class="k">Stated reason</div><div>${m.label}</div><div class="k">Answered by</div><div>${m.answered}</div>
        <div class="k">Producing module</div><div><span class="tag">${m.band}</span></div><div class="k">Verdict</div><div style="color:${vs[0]==='ok'?'#7dffb0':'#f0a839'};font-weight:600">${m.verdict.replace(/_/g,' ')}</div></div></div>
    <div class="grid2" style="margin-top:16px">
      <div class="card" style="padding:15px;border-color:rgba(255,106,77,.25)"><div class="lbl">Appeal window</div>
        <div style="display:flex;align-items:baseline;gap:10px;margin-top:10px"><span class="mono" style="font-size:15px;color:#e8f3ec">Forum: ${m.forum}</span><span class="lbl" style="text-transform:none">${m.statute}</span></div>
        <div style="margin-top:12px;background:rgba(255,106,77,.08);border:1px solid rgba(255,106,77,.3);border-radius:6px;padding:10px 12px">
          <div class="lbl" style="text-transform:none">Deadline (order + 60 days)</div>
          <div class="mono glow-coral" style="font-size:18px">${m.deadline||'—'} · ${m.window}</div>
          ${m.window==='LAPSED'?'<div style="font-size:11px;color:#ffb8a8;margin-top:3px">Advise: fresh claim / condonation with new evidence</div>':''}</div></div>
      <div class="card" style="padding:15px;border-style:dashed"><div class="lbl">To attach · Rule 13 (any two)</div>
        <div style="display:flex;flex-direction:column;gap:11px;margin-top:12px;font-size:13px">
          <label style="display:flex;align-items:center;gap:10px"><span style="width:15px;height:15px;border-radius:3px;background:#7dffb0;box-shadow:0 0 8px #7dffb0"></span>KAAL satellite dossier</label>
          <label style="display:flex;align-items:center;gap:10px;color:#8ea79a"><span style="width:15px;height:15px;border:1.5px solid #3f6b52;border-radius:3px"></span>Oral testimony (IndicWhisper)</label>
          <label style="display:flex;align-items:center;gap:10px;color:#8ea79a"><span style="width:15px;height:15px;border:1.5px solid #3f6b52;border-radius:3px"></span>Gram Sabha resolution</label></div>
        <div class="mono" style="font-size:9.5px;color:#5f7a6c;margin-top:12px;line-height:1.5">Satellite imagery is supplementary under Rule 13 — never sole/decisive.</div></div></div>
    <div class="card" style="padding:15px;margin-top:16px"><div class="lbl">SETU · scheme convergence (on recognition)</div>
      <div style="display:flex;gap:9px;margin-top:12px;flex-wrap:wrap">${schemes.map(([n,ok])=>`<span class="tag${ok?'':' off'}">${n}${ok?' ✓':''}</span>`).join('')}</div></div>
    <div style="display:flex;gap:12px;margin-top:18px">
      <button data-link href="#/dossier/${c.claim_id}" class="btn-amber">Download appeal bundle</button>
      <button data-link href="#/gramsabha/${c.claim_id}" class="btn-ghost">ASSIGN TO GRAM SABHA</button></div></div>`;
  return {html:shell({k:'atlas',label:'NYAYA · APPEAL'},inner)};
}

// ---------- OFFICER DASHBOARD ----------
function dashboard(){
  const rej=DB.claims.filter(c=>c.status==='rejected');
  const rows=rej.map(c=>{const k=mockKaal(c),m=matchEvidence(c,k);return {c,k,m};});
  const openq=rows.filter(r=>r.m.window==='OPEN' || r.m.window==='LAPSED');
  const inner=`<div class="page">
    <h2 class="disp">Officer dashboard</h2><div class="lbl" style="margin:4px 0 18px">District Tribal-Welfare / DAJGUA · Dindori</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">
      <div class="card kpi" style="border-color:rgba(255,106,77,.2)"><div class="n glow-coral">${rej.length}</div><div class="lbl">rejected</div></div>
      <div class="card kpi" style="border-color:rgba(125,255,176,.2)"><div class="n glow-lime">${recoverable()}</div><div class="lbl">recoverable (KAAL)</div></div>
      <div class="card kpi" style="border-color:rgba(240,168,57,.2)"><div class="n glow-amber">${rows.filter(r=>r.m.window==='OPEN').length}</div><div class="lbl">appeal window open</div></div></div>
    <div class="card" style="margin-top:18px"><div class="lbl" style="padding:12px 16px 8px">Rejected claims · evidence-recovery queue</div>
      ${rows.map(({c,k,m})=>{const vs=VERDICT_STYLE[m.verdict];return `<div class="queue" data-link href="#/claim/${c.claim_id}" style="cursor:pointer">
        <span class="mono" style="color:#e8f3ec">${c.claim_id}</span>
        <span class="lbl" style="text-transform:none;width:150px">${villageName(c.village_lgd)} · ${c.claimant_category}</span>
        <span class="lbl" style="text-transform:none;flex-grow:1;color:${vs[0]==='ok'?'#7dffb0':'#f0a839'}">${m.verdict.replace(/_/g,' ')}</span>
        <span class="mono" style="color:#7dffb0">KAAL ${k.confidence.toFixed(2)}</span>
        <span class="mono" style="width:80px;text-align:right;color:${m.window==='LAPSED'?'#5f7a6c':'#ff6a4d'}">${m.window==='LAPSED'?'lapsed':m.deadline?m.deadline.slice(5):'—'}</span></div>`;}).join('')}
    </div></div>`;
  return {html:shell({k:'dash',label:'OFFICER'},inner)};
}

// ---------- GRAM SABHA ----------
function gramSabha(id){
  const c=getClaim(id);const k=mockKaal(c);
  const pre=k.conversion_year<2005;
  const inner=`<div class="page" style="max-width:720px">
    <h2 class="disp">Gram Sabha view</h2><div class="lbl dev" style="letter-spacing:0;margin:4px 0 18px;color:#8ea79a">ग्राम सभा · claimant</div>
    <div class="card" style="padding:16px;display:flex;gap:14px;align-items:center;border-color:rgba(125,255,176,.15)">
      <div style="width:66px;height:66px;border-radius:10px;background:linear-gradient(135deg,#1f5a30,#8a7648);box-shadow:0 0 20px rgba(125,255,176,.15)"></div>
      <div style="flex-grow:1"><div style="font-size:17px;color:#e8f3ec;font-weight:600">Your land · ${villageName(c.village_lgd)}</div>
        <div class="lbl" style="text-transform:none">Claim ${c.claim_id} · ${c.area_ha} ha</div>
        <div class="tag" style="display:inline-block;margin-top:7px">EVIDENCE FOUND · SINCE ~${k.conversion_year} ✓</div></div></div>
    <div style="background:rgba(125,255,176,.06);border:1px solid rgba(125,255,176,.25);border-radius:12px;padding:16px;margin-top:16px">
      <div style="font-size:16px;color:#e8f3ec;line-height:1.45;font-weight:600">Satellite shows your family farmed here <span class="glow-lime">${pre?'before 2005':'—'}</span>. This supports your claim.</div>
      <div class="dev" style="font-size:13px;color:#8ea79a;margin-top:8px">उपग्रह चित्र ${pre?'2005 से पहले':''} खेती दिखाते हैं।</div></div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-top:16px">
      <button data-link href="#/dossier/${c.claim_id}" class="btn-amber" style="text-align:left;background:#f0c552;color:#20180a">📄 Get my evidence paper (PDF)</button>
      <button class="btn-ghost" style="text-align:left" onclick="alert('Voice recorder — IndicWhisper (demo)')">🎙 Record elder testimony (voice)</button>
      <button class="btn-ghost" style="text-align:left" onclick="alert('Boundary walk trace — GPS (demo)')">▲ Walk &amp; trace my boundary</button></div>
    <div class="mono" style="font-size:9.5px;color:#5f7a6c;margin-top:16px;line-height:1.5">Evidence owned by the Gram Sabha · consent-gated. Decision support, not legal proof of right.</div></div>`;
  return {html:shell({k:'gs',label:'GRAM SABHA'},inner)};
}

// ---------- DOSSIER (printable) ----------
function dossier(id){
  const c=getClaim(id);const k=mockKaal(c);const m=c.rejection_order?matchEvidence(c,k):null;
  const vs=m?VERDICT_STYLE[m.verdict]:['ok','GRANTED'];
  const html=`<div style="min-height:100vh;background:#020309;padding:24px;display:flex;flex-direction:column;align-items:center">
    <div style="width:820px;background:#0a1310;border:1px solid var(--line);border-radius:10px;overflow:hidden">
      <div style="background:#1f5136;padding:18px 24px;display:flex;justify-content:space-between;align-items:center">
        <div><div class="mono" style="color:#e8f3ec;font-size:20px;letter-spacing:2px">SAAKSHYA</div><div class="lbl" style="color:#cfe6d6">Evidence Dossier · Forest Rights Act, 2006</div></div>
        <div style="text-align:right"><div class="mono glow-amber" style="font-size:16px">${c.claim_id}</div><div class="lbl" style="color:#cfe6d6">${villageName(c.village_lgd)} · ${c.claim_type} · ${c.claimant_category}</div></div></div>
      <div style="padding:22px 24px">
        ${m?`<div class="banner ${vs[0]}"><b style="color:${vs[0]==='ok'?'#7dffb0':vs[0]==='warn'?'#f0a839':'#ff6a4d'}">${vs[1]}</b></div>`:''}
        <div class="lbl" style="margin:16px 0 8px">Decade evidence strip</div>${decadeStrip(k)}
        <div style="display:flex;gap:16px;margin-top:16px"><div class="card" style="flex-grow:1;padding:12px">${breakpointChart(k)}</div>
          <div class="card" style="width:210px;padding:12px;display:flex;flex-direction:column;align-items:center;justify-content:center">${confidenceDial(k.confidence)}<div class="lbl">confidence</div></div></div>
        ${m?`<div class="card" style="padding:14px;margin-top:14px"><div class="lbl">Finding</div><div style="font-size:13px;color:#e8f3ec;margin-top:6px;line-height:1.5">${m.finding}</div></div>`:''}
        ${m?`<div class="card" style="padding:14px;margin-top:12px"><div class="lbl">Appeal</div><div class="mono" style="margin-top:6px">Forum ${m.forum} · deadline ${m.deadline||'—'} · <span class="${m.window==='LAPSED'?'glow-coral':''}">${m.window}</span></div></div>`:''}
        <div class="lbl" style="margin-top:14px;line-height:1.6">Legal basis: Rule 13 (amended 2012) — satellite imagery is supplementary, may not replace other evidence; any two evidences. Decision support, not legal proof of right. Demo uses synthetic data.</div>
      </div></div>
    <div style="display:flex;gap:12px;margin-top:18px">
      <button class="btn-amber" onclick="window.print()">Print / Save as PDF</button>
      <button data-link href="#/claim/${c.claim_id}" class="btn-ghost">‹ BACK</button></div></div>`;
  return {html};
}

// ---------- ABOUT / HOW IT WORKS ----------
function about(){
  const card=(t,b)=>`<div class="card" style="padding:18px"><div style="color:#e8f3ec;font-weight:600;font-size:15px;margin-bottom:6px">${t}</div><div style="font-size:13.5px;line-height:1.6;color:var(--text)">${b}</div></div>`;
  const inner=`<div class="page" style="max-width:920px">
    <div class="lbl">How it works</div>
    <h2 class="disp" style="font-size:30px;margin:6px 0 4px">Saakshya, in plain words</h2>
    <div style="font-size:15px;color:#9fdcb8;margin-bottom:22px">“Existing tools map the forest-rights claims that were <b>granted</b>. Saakshya rebuilds the proof for the claims that were <b>rejected</b>.”</div>

    <div class="banner ok" style="margin-bottom:22px"><div style="font-size:13.5px;line-height:1.6">
      <b>The 30-second version:</b> Tribal families have lived on forest land for generations. A 2006 law (the Forest Rights Act) lets them legally own it — <b>if</b> they can prove they were there before <b>13 Dec 2005</b>. Thousands can’t prove it on paper, so their claims get <b>rejected</b>. Saakshya digs up <b>50 years of satellite photos</b> to show when their farms/homes appeared — often long before 2005 — and turns that into evidence to fight the rejection.
    </div></div>

    <div class="lbl" style="margin:6px 0 10px">The problem</div>
    <div class="grid2" style="margin-bottom:22px">
      ${card('Forest Rights Act, 2006','Recognises the right of Scheduled Tribes (ST) &amp; other forest dwellers (OTFD) to land they occupied <b>before 13-Dec-2005</b>. Approved claim → a <b>patta</b> (title deed).')}
      ${card('Why claims fail','~48,000 community claims rejected nationally. Main reason: families have <b>no documents</b> proving pre-2005 occupation. The land is theirs, but they can’t prove it — so the state says no.')}
    </div>

    <div class="lbl" style="margin:6px 0 10px">How Saakshya answers it — 3 engines</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:22px">
      ${card('🛰️ KAAL — the time machine <span class="tag" style="margin-left:6px">evidence</span>','Reads <b>satellite archives back to 1972</b> (Landsat) and 1967 (declassified Corona spy photos). Detects the <b>year</b> a patch of forest became farmland or a settlement. If that year is before 2005 → strong evidence the rejection was wrong. Every finding carries a <b>confidence score</b>, and honestly flags what it can’t prove.')}
      ${card('🗺️ SEEMA — the boundary check <span class="tag" style="margin-left:6px">conflict</span>','Maps today’s farms/forest/water from current satellite imagery and finds <b>overlapping or disputed claim boundaries</b> — another common rejection reason.')}
      ${card('⚖️ VAANI · NYAYA · SETU — the paperwork &amp; appeal <span class="tag" style="margin-left:6px">delivery</span>','VAANI reads the rejection order and figures out <b>why</b> it was rejected. NYAYA matches that reason to the evidence that answers it, and shows the correct <b>appeal forum + 60-day deadline</b>. SETU lists which government schemes the family qualifies for once recognised.')}
    </div>

    <div class="lbl" style="margin:6px 0 10px">The screens</div>
    <div class="card" style="overflow:hidden;margin-bottom:22px">
      <div class="kv" style="grid-template-columns:170px 1fr">
        <div class="k">Atlas</div><div>Map of every claim in a district. Coral = rejected. Click one → its satellite evidence.</div>
        <div class="k">KAAL evidence</div><div>The proof for one claim: the year-of-change chart, the decade photo strip, the confidence dial, the verdict.</div>
        <div class="k">NYAYA appeal</div><div>What was the rejection reason, does our evidence answer it, and the appeal deadline.</div>
        <div class="k">Officer</div><div>District overview: how many rejected, how many are recoverable, and the appeal queue.</div>
        <div class="k">Gram Sabha</div><div>The same, in plain language + local language, for the villager/claimant.</div>
      </div>
    </div>

    <div class="lbl" style="margin:6px 0 10px">What Saakshya is honest about</div>
    <div class="banner warn" style="margin-bottom:22px"><div style="font-size:13px;line-height:1.6">
      Satellite imagery is <b>supporting evidence</b> under the law (Rule 13) — never the sole/decisive proof. For <b>ST</b> families the bar is “before 2005”, which satellites can cover. For <b>OTFD</b> families the bar is ~75 years (back to ~1930) — <b>beyond any satellite</b>, so Saakshya only <i>strengthens</i> those cases, never “proves” them. This is a <b>prototype using synthetic demo data</b>.
    </div></div>

    <div class="lbl" style="margin:6px 0 10px">Glossary</div>
    <div class="card" style="overflow:hidden">
      <div class="kv" style="grid-template-columns:150px 1fr">
        <div class="k">FRA</div><div>Forest Rights Act, 2006.</div>
        <div class="k">IFR / CR / CFR</div><div>Individual / Community / Community-Forest-Resource right — the 3 claim types.</div>
        <div class="k">Patta</div><div>The land-title deed you get if a claim is approved.</div>
        <div class="k">Gram Sabha</div><div>Village assembly — verifies claims first.</div>
        <div class="k">SDLC / DLC</div><div>Sub-District / District committees — the approval &amp; appeal levels.</div>
        <div class="k">2005 cutoff</div><div>13 Dec 2005 — you must have occupied the land before this date.</div>
        <div class="k">KAAL confidence</div><div>0–1 score of how sure the satellite engine is about the year-of-change.</div>
      </div>
    </div>
    <div style="margin-top:22px"><button data-link href="#/atlas" class="btn-amber">Go to the Atlas →</button></div>
  </div>`;
  return {html:shell({k:'about',label:'HOW IT WORKS'},inner)};
}

// ---------- ROUTER ----------
function route(){
  const h=location.hash.replace(/^#/,'')||'/';
  const parts=h.split('/').filter(Boolean); // e.g. ['claim','FRA-..']
  let v;
  if(h==='/'||h==='')v=landing();
  else if(parts[0]==='atlas')v=atlas();
  else if(parts[0]==='claim')v=claimView(parts[1]);
  else if(parts[0]==='nyaya')v=nyayaView(parts[1]);
  else if(parts[0]==='dashboard')v=dashboard();
  else if(parts[0]==='gramsabha')v=gramSabha(parts[1]);
  else if(parts[0]==='about')v=about();
  else if(parts[0]==='dossier')v=dossier(parts[1]);
  else v=landing();
  if(MAP){MAP.remove();MAP=null;}
  app.innerHTML=v.html;
  if(v.mount)v.mount();
  window.scrollTo(0,0);
}

// intercept data-link clicks
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-link]'); if(!a)return;
  e.preventDefault(); location.hash=a.getAttribute('href').replace(/^#/,'');
});
window.addEventListener('hashchange',route);

// boot
fetch('data/demo_district.json').then(r=>r.json()).then(d=>{DB=d;route();})
  .catch(e=>{app.innerHTML='<div class="page">Failed to load data: '+e+'</div>';});
