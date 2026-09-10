/**
 * Routing shell.
 *
 * The product used to be one screen. That was wrong for the first thirty
 * seconds of an evaluation: a judge landed inside a dense instrument panel and
 * had to reverse-engineer what they were looking at before they could judge it.
 *
 * Now it is a site. `/` explains and demonstrates; `/workstation` is the tool;
 * `/data` and `/evaluation` hold the material that was previously crammed into
 * sidebar tabs where it could not be read.
 *
 * Each page owns its own scrolling — the workstation is a fixed-height three
 * pane layout, the rest scroll normally — so the shell only routes and never
 * imposes overflow behaviour on its children.
 */

import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import Landing from '@/pages/Landing'
import Workstation from '@/pages/Workstation'
import DataPage from '@/pages/DataPage'
import EvaluationPage from '@/pages/EvaluationPage'

/**
 * A client-side route change keeps the previous scroll offset, which lands you
 * halfway down a page you have never seen. Browsers do this correctly for real
 * navigations; a router has to do it by hand.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    document.querySelectorAll('[data-scroll-root]')
      .forEach((el) => { el.scrollTop = 0 })
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/workstation" element={<Workstation />} />
        <Route path="/data" element={<DataPage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
        {/* An unknown path is a mistyped URL, not an error state worth a page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
