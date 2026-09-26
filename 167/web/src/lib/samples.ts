/**
 * Real photographs to try, without hunting for a file.
 *
 * Eight VRSBench validation photos (Google Earth imagery M1 was never trained
 * on; train/val image overlap counted at zero), served unmodified from
 * `public/samples/`. M1's answers for exactly these files are pre-computed, so
 * they still answer with the GPU off. Each question is one M1 answers correctly
 * above the gate; `demo/real_vrsbench/guide.md` lists the rest, including the
 * ones it gets wrong.
 *
 * VRSBench — Li, Ding and Elhoseiny, NeurIPS 2024 Datasets and Benchmarks, CC-BY-4.0.
 */

export interface Sample { file: string; title: string; question: string }

export const SAMPLES: Sample[] = [
  { file: '09224_0000.png', title: 'Station', question: 'What is the main structure visible in the image?' },
  { file: '10097_0000.png', title: 'Ships', question: 'How many ships are visible in the image?' },
  { file: 'P1390_0083.png', title: 'Airfield', question: 'Is the terrain around the runway paved or unpaved?' },
  { file: '08281_0000.png', title: 'Bridges', question: 'How many bridges are visible in the image?' },
  { file: 'P5789_2244.png', title: 'Harbours', question: 'Is the image in color or grayscale?' },
  { file: '09054_0000.png', title: 'Baseball', question: 'What is the main feature of the image?' },
  { file: 'P2701_0041.png', title: 'Tanks', question: 'Is there a storage tank in the bottom-left part of the image?' },
  { file: 'P2645_0002.png', title: 'Parking', question: "Are there skylights on the building's roof?" },
]

export const sampleUrl = (s: Sample) => `${import.meta.env.BASE_URL}samples/${s.file}`
/** A 160 px JPEG for the gallery: the full photo is fetched only when one is chosen. */
export const thumbUrl = (s: Sample) => `${import.meta.env.BASE_URL}samples/thumbs/${s.file.replace('.png', '.jpg')}`
