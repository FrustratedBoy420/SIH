import { Link, useLocation } from 'react-router-dom'
import Mark from '@/components/Mark'

export default function NotFound() {
  const { pathname } = useLocation()
  return (
    <section className="graticule flex min-h-[calc(100dvh-var(--chrome))] flex-col justify-center px-5 sm:px-8">
      <Mark className="mb-8 size-14" />
      <p className="mono mb-4 text-[13px] text-ink-2">{pathname}</p>
      <h1 className="t-hero max-w-[760px]">No data at this address</h1>
      <p className="mt-6 max-w-md text-[17px] text-ink-2">Nothing was surveyed here.</p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link className="btn btn-sun" to="/workstation">Open the workstation</Link>
        <Link className="btn btn-line" to="/">Home</Link>
      </div>
    </section>
  )
}
