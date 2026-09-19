/**
 * Routing shell. `/` argues the thesis; `/workstation` is the instrument;
 * `/data` and `/results` hold what the system is built on and what it
 * measured; `/report/:runId` is the print-styled record of one run.
 *
 * Pages are code-split (NFR-13). Route changes are hard cuts — no crossfade.
 */

import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import Masthead from '@/components/Masthead'
import Disclosure from '@/components/Disclosure'

const Landing = lazy(() => import('@/pages/Landing'))
const Workstation = lazy(() => import('@/pages/Workstation'))
const DataModels = lazy(() => import('@/pages/DataModels'))
const Results = lazy(() => import('@/pages/Results'))
const Report = lazy(() => import('@/pages/Report'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

/** One quiet spinner while a page chunk loads. */
function Loading() {
  return (
    <div className="grid h-[60vh] place-items-center" role="status" aria-label="Loading">
      <span className="animate-spin size-6 border-2 border-rule-2 border-t-ink" />
    </div>
  )
}

function Layout() {
  return (
    <div className="min-h-dvh pb-8">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[100] focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Masthead />
      <main id="main">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      <Disclosure />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/workstation" element={<Workstation />} />
          <Route path="/data" element={<DataModels />} />
          <Route path="/results" element={<Results />} />
          <Route path="/evaluation" element={<Navigate to="/results" replace />} />
          <Route path="/report/:runId" element={<Report />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
