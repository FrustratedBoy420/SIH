// KAAL — deterministic mock evidence engine (same output schema as the real GEE spike).
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

export function mockKaal(claim){
  const rng=mulberry32(hash(claim.claim_id));
  const ri=(a,b)=>Math.floor(rng()*(b-a))+a;
  const reason=(claim.rejection_order||{}).reason_category;
  let conv;
  if(reason==='no_pre_2005_proof') conv=ri(1988,2003);
  else if(reason==='boundary_dispute') conv=ri(1990,2010);
  else conv=ri(1985,2015);
  const years=[];for(let y=1975;y<=2023;y++)years.push(y);
  const ndvi=years.map(y=>{
    let v=(y<conv?0.80:0.42)+(rng()-0.5)*0.06;
    if(y>=conv)v+=(rng()-0.5)*0.10;
    return Math.min(0.95,Math.max(0.05,v));
  });
  const breakMag=0.38, validObs=ri(22,40), rmse=+(6+rng()*8).toFixed(1);
  const clf=Math.min(0.98,Math.max(0.6,0.86+(rng()-0.5)*0.12));
  const conf=+Math.min(0.95,Math.max(0.4,0.30+0.35*(validObs/40)+0.55*(breakMag/0.5)+0.20*(clf-0.8)-0.02*(rmse-6))).toFixed(2);
  const stripYears=[1967,1975,1985,1995,2005,2015,2023];
  const strip=stripYears.map(y=>({year:y,label:y<conv?'forest':'cultivated',kind:y===1967?'corona':y<2016?'landsat':'sentinel'}));
  return {claim_id:claim.claim_id,conversion_year:conv,break_direction:'loss',trajectory_class:'forest_to_cultivation',
    confidence:conf,confidence_drivers:{valid_observation_years:validObs,break_magnitude_ndvi:breakMag,classifier_probability:+clf.toFixed(2),corona_registration_rmse_m:rmse},
    years,ndvi,evidence_strip:strip,corona_available:true,registration_rmse_m:rmse,_source:'MOCK'};
}
