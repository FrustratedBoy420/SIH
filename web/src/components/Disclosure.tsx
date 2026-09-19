/**
 * Permanent disclosure (UI-10, P8). Constructed scenarios are stated where the
 * judge reads, on every page, not only in the source.
 */
export default function Disclosure() {
  return (
    <div data-testid="disclosure" role="note" className="no-print fixed inset-x-0 bottom-0 z-50 flex h-8 items-center gap-3 overflow-hidden bg-ink px-4 text-paper sm:px-6">
      <span className="mono shrink-0 text-[11px] font-medium tracking-[0.08em] text-[#e0b356]">DISCLOSURE</span>
      <p className="mono truncate text-[11px] text-[#d6ddda]" title="Built-in scenes are synthetic: generated pixels on real EPSG:4326 geotransforms. The cloud sits over the settlement on purpose, where optical and SAR differ. Your uploads are analysed as supplied.">
        Built-in scenes are synthetic<span className="hidden md:inline">: generated pixels on real EPSG:4326 geotransforms</span>.
        <span className="hidden lg:inline"> Cloud covers the settlement on purpose.</span>
        {' '}Your uploads are analysed as supplied.
      </p>
    </div>
  )
}
