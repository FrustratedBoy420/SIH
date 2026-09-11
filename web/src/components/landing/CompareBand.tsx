/** Two sensors, one scene — drag between them. R4 before a word of explanation. */

import type { LandingData } from './useLanding'
import { ImageComparison, ImageComparisonImage, ImageComparisonSlider } from '@/components/ui/ImageComparison'
import { Spotlight } from '@/components/ui/Spotlight'

export default function CompareBand({ data }: { data?: LandingData }) {
  return (
    <section className="border-t border-ink" aria-labelledby="compare-h">
      <div className="grid gap-6 px-5 pb-8 pt-20 sm:px-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
        <h2 id="compare-h" className="t-section">Two sensors.<br />One scene.</h2>
        <p className="max-w-[520px] text-[16px] leading-[1.55] text-ink-2">
          Optical records reflected sunlight — colour and material — and is blind under cloud. SAR sends its own pulse and records backscatter — structure and roughness — through cloud and at night. Drag the divider. The town under the cloud on the left is bright on the right, because walls and ground form corner reflectors.
        </p>
      </div>
      {data && (
        <ImageComparison className="relative h-[78vh] min-h-[420px] w-full cursor-ew-resize" testId="landing-compare" label="Divider between the optical and SAR plates" initial={38}>
          <ImageComparisonImage src={data.optical.layers.base} alt="Optical plate" position="right" />
          <ImageComparisonImage src={data.sar.layers.base} alt="SAR plate, VV backscatter in dB" position="left" />
          <Spotlight size={320} />
          <ImageComparisonSlider className="bg-paper">
            <div className="absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-ink bg-paper text-[15px]">⇆</div>
          </ImageComparisonSlider>
          <span className="mono absolute left-5 top-5 z-10 bg-paper px-2 py-1 text-[12px]" style={{ borderLeft: '3px solid var(--color-optical)' }}>OPTICAL · 4 bands · R,G,B,NIR</span>
          <span className="mono absolute right-5 top-5 z-10 bg-paper px-2 py-1 text-[12px]" style={{ borderRight: '3px solid var(--color-sar)' }}>SAR · VV · 4-look · dB stretch</span>
        </ImageComparison>
      )}
    </section>
  )
}
