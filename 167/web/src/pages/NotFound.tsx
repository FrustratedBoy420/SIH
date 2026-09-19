import { Link, useLocation } from 'react-router-dom'

export default function NotFound() {
  const { pathname } = useLocation()
  return (
    <section className="graticule flex min-h-[70vh] flex-col justify-end px-4 pb-16 sm:px-6">
      <p className="mono mb-4 text-[13px] text-ink-2">{pathname}</p>
      <h1 className="t-hero">No data<br />at this<br />address.</h1>
      <p className="mt-8 max-w-md text-ink-2">Nothing was surveyed here. The instrument is at <Link className="text-accent underline underline-offset-4" to="/workstation">/workstation</Link>.</p>
    </section>
  )
}
