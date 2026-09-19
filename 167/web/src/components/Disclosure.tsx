/**
 * Permanent disclosure (UI-10, P8). Constructed scenarios are stated where the
 * judge reads, on every page, not only in the source.
 */
export default function Disclosure() {
  return (
    <div data-testid="disclosure" role="note" className="no-print fixed inset-x-0 bottom-0 z-50 flex h-8 items-center gap-3 overflow-hidden bg-ink px-4 text-paper sm:px-6">
      <span className="shrink-0 text-[12px] font-semibold text-sun">Disclosure</span>
      <p className="truncate text-[12.5px] text-[#d9dfe1]" title="Built-in scenes are real Sentinel-2 L2A and Sentinel-1 RTC crops over west Hyderabad (EPSG:32644, 10 m). No ground truth exists for them: their numbers are measurements, not scores. Accuracy is measured on a synthetic scene with known truth (Results). Contains modified Copernicus Sentinel data 2018–2025. Your uploads are analysed as supplied.">
        Built-in scenes are real Sentinel-2 and Sentinel-1 crops over west Hyderabad<span className="hidden md:inline">, with no ground truth: their numbers are measurements, not scores</span>.
        <span className="hidden lg:inline"> Contains modified Copernicus Sentinel data.</span>
        {' '}Your uploads are analysed as supplied.
      </p>
    </div>
  )
}
