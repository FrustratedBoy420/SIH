/** Two sensors, one scene — drag between them. R4 before a word of explanation. */

import type { LandingData } from './useLanding'
import { ImageComparison, ImageComparisonImage, ImageComparisonSlider } from '@/components/ui/ImageComparison'

export default function CompareBand({ data }: { data?: LandingData }) {
  return (
    <section aria-labelledby="compare-h">
      <div className="grid gap-6 px-5 pb-10 pt-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <div>
          <p className="label mb-4">Optical and radar</p>
          <h2 id="compare-h" className="t-section">Two sensors, one scene</h2>
        </div>
        <p className="max-w-[540px] text-[17px] leading-[1.55] text-ink-2">
          Optical records reflected sunlight — colour and material — and is blind under cloud. SAR sends its own pulse and records backscatter — structure and roughness — through cloud and at night. Drag the divider. The town under the cloud on the left is bright on the right, because walls and ground form corner reflectors.
        </p>
      </div>
      {data && (
        <ImageComparison className="relative h-[80vh] min-h-[420px] w-full cursor-ew-resize border-y border-ink" testId="landing-compare" label="Divider between the optical and SAR plates" initial={38}>
          <ImageComparisonImage src={data.optical.layers.base} alt="Optical plate" position="right" />
          <ImageComparisonImage src={data.sar.layers.base} alt="SAR plate, VV backscatter in dB" position="left" />
          <ImageComparisonSlider className="bg-sun">
            <div className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center border border-ink bg-sun text-[16px]">⇆</div>
          </ImageComparisonSlider>
          <span className="absolute left-5 top-5 z-10 bg-paper px-3 py-1.5 text-[13px] font-medium" style={{ borderLeft: '4px solid var(--color-optical)' }}>Optical <span className="mono font-normal text-ink-2">· R, G, B, NIR</span></span>
          <span className="absolute right-5 top-5 z-10 bg-paper px-3 py-1.5 text-[13px] font-medium" style={{ borderRight: '4px solid var(--color-sar)' }}>SAR <span className="mono font-normal text-ink-2">· VV · 4-look · dB</span></span>
        </ImageComparison>
      )}
    </section>
  )
}
