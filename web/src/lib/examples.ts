/** Example queries. RQ-1–RQ-5 are the problem statement's own, verbatim (07 §10, US-11). */

export interface Example { id: string; q: string; group: string; needs: string; rq?: string }

export const RQ_GROUP = 'Problem statement · representative queries'

export const EXAMPLES: Example[] = [
  { id: 'rq1', rq: 'RQ-1', group: RQ_GROUP, needs: 'one image', q: 'Describe the land-cover and major objects visible in this image.' },
  { id: 'rq2', rq: 'RQ-2', group: RQ_GROUP, needs: 'one image', q: 'Highlight the water body referred to in the query.' },
  { id: 'rq3', rq: 'RQ-3', group: RQ_GROUP, needs: 'T1 + T2', q: 'What changed between these two dates, and where did the change occur?' },
  { id: 'rq4', rq: 'RQ-4', group: RQ_GROUP, needs: 'optical + SAR', q: 'Use the optical and SAR images together to identify built-up and water-covered regions.' },
  { id: 'rq5', rq: 'RQ-5', group: RQ_GROUP, needs: 'T1 + T2', q: 'Has the built-up area increased, decreased, or remained unchanged?' },
  { id: 'count', group: 'Single image', needs: 'one image', q: 'How many built-up areas are visible?' },
  { id: 'veg', group: 'Single image', needs: 'one image', q: 'How much vegetation is there?' },
  { id: 'bare', group: 'Single image', needs: 'one image · records a conflict', q: 'Where is the bare soil?' },
  { id: 'radar', group: 'Cross-modal', needs: 'optical + SAR', q: 'What does radar reveal that optical cannot?' },
  { id: 'refuse', group: 'Refusal and abstention', needs: 'refuses without T1 + T2', q: 'What changed between these two dates?' },
  { id: 'abstain', group: 'Refusal and abstention', needs: 'abstains · not in the vocabulary', q: 'Highlight the unicorn.' },
]

export const RQ4 = EXAMPLES[3].q
