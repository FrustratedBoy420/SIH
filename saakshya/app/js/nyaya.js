// NYAYA — evidence match + appeal routing (ported from the Python engine).
const CUTOFF=2005;
const TAXO={
  no_pre_2005_proof:{label:"No proof of occupation before 13-Dec-2005",answered:"Dated land-use conversion before 2005 + decade image strip",band:"KAAL"},
  boundary_dispute:{label:"Boundary / overlap dispute",answered:"Segmented parcel + PostGIS conflict topology",band:"SEEMA"},
  gram_sabha_procedure:{label:"Gram Sabha procedural defect",answered:"Corrected resolution / re-filing checklist",band:"VAANI/NYAYA workflow"},
  non_st_otfd:{label:"Eligibility (not ST/OTFD)",answered:"Community / caste records (out of imagery scope)",band:"External"},
  incomplete_form:{label:"Incomplete / defective form",answered:"Field-completeness check + re-submission",band:"VAANI"}
};
const ROUTE={GS:{forum:"SDLC",statute:"FRA Sec 6(2)",days:60},SDLC:{forum:"DLC",statute:"FRA Sec 6(4)",days:60},DLC:{forum:"High Court (writ) / State review",statute:"beyond DLC",days:null}};
export const LEGAL="Rule 13, Forest Rights Rules (amended 06-09-2012): satellite imagery is admissible as ONE of the listed evidences, may SUPPLEMENT not REPLACE; any two evidences. Rule 12A(11): SDLC/DLC cannot insist on a particular evidence. (Gujarat HC 2013.)";

export function matchEvidence(claim,kaal){
  const o=claim.rejection_order; if(!o) return {status:"not_rejected"};
  const t=TAXO[o.reason_category]||{}; const cat=claim.claimant_category||"ST";
  const r={claim_id:claim.claim_id,reason:o.reason_category,label:t.label,answered:t.answered,band:t.band,cat};
  const cy=kaal?kaal.conversion_year:null;
  if(o.reason_category==='no_pre_2005_proof'&&kaal){
    if(cat==='OTFD'){r.verdict='STRENGTHENED_NOT_PROVEN';r.finding=`Imagery shows occupation/cultivation since ~${cy}. This STRENGTHENS continuity but does NOT prove the OTFD 75-year (pre-~1930) requirement, beyond any satellite record.`;}
    else if(cy<CUTOFF){r.verdict='ANSWERED';r.finding=`Imagery dates conversion to ~${cy}, i.e. occupation predates the 13-Dec-2005 cutoff. Supplementary Rule-13 evidence available.`;}
    else {r.verdict='CONTRADICTED';r.finding=`Imagery dates conversion to ~${cy}, AFTER the 2005 cutoff — finding withheld from adverse use.`;}
  } else if(o.reason_category==='boundary_dispute'){r.verdict='ROUTE_TO_SEEMA';r.finding='Resolve via SEEMA parcel segmentation + PostGIS conflict topology.';}
  else {r.verdict='OUT_OF_IMAGERY_SCOPE';r.finding='This rejection reason is not answerable by satellite imagery; handled by the VAANI/NYAYA document workflow.';}
  const rt=ROUTE[o.rejecting_body]||{}; r.forum=rt.forum; r.statute=rt.statute;
  if(rt.days){const d=new Date(o.order_date);d.setDate(d.getDate()+rt.days);r.deadline=d.toISOString().slice(0,10);r.window=(new Date()>d)?'LAPSED':'OPEN';}
  else {r.deadline=null;r.window='N/A';}
  r.legal=LEGAL; return r;
}
export const VERDICT_STYLE={ANSWERED:['ok','REJECTION ANSWERED'],STRENGTHENED_NOT_PROVEN:['warn','CONTINUITY STRENGTHENED (OTFD 75-yr beyond satellite)'],CONTRADICTED:['bad','IMAGERY DOES NOT SUPPORT CLAIM'],ROUTE_TO_SEEMA:['warn','BOUNDARY DISPUTE — routed to conflict analysis'],OUT_OF_IMAGERY_SCOPE:['warn','OUTSIDE IMAGERY SCOPE — document workflow']};
