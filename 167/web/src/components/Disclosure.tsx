/**
 * Permanent disclosure (UI-10, P8). Constructed scenarios are stated where the
 * judge reads, on every page, not only in the source.
 */
export default function Disclosure() {
  return (
    <div data-testid="disclosure" role="note" className="no-print fixed inset-x-0 bottom-0 z-50 flex h-8 items-center gap-3 overflow-hidden bg-ink px-4 text-paper sm:px-6">
      <span className="shrink-0 text-[12px] font-semibold text-sun">Disclosure</span>
      <p className="truncate text-[12.5px] text-[#d9dfe1]" title="Built-in scenes are synthetic: generated pixels on real EPSG:4326 geotransforms. The cloud sits over the settlement on purpose, where optical and SAR differ. Your uploads are analysed as supplied.">
        Built-in scenes are synthetic<span className="hidden md:inline">: generated pixels on real EPSG:4326 geotransforms</span>.
        <span className="hidden lg:inline"> Cloud covers the settlement on purpose.</span>
        {' '}Your uploads are analysed as supplied.
      </p>
    </div>
  )
}
