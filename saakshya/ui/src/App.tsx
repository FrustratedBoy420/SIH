import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "motion/react";
import Landing from "./screens/Landing";
import Evidence from "./screens/Evidence";
import Decision from "./screens/Decision";
import District from "./screens/District";
import Village from "./screens/Village";
import GramSabha from "./screens/GramSabha";
import Dossier from "./screens/Dossier";
import Method from "./screens/Method";

// The atlas carries MapLibre. Keeping it out of the first load means the
// landing paints immediately.
const Atlas = lazy(() => import("./screens/Atlas"));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function Booting() {
  return (
    <div className="flex h-dvh items-center justify-center bg-void">
      <div className="console flex items-center gap-3 text-[8.5px] text-dim2">
        <span className="h-1.5 w-1.5 animate-[blink_0.9s_steps(1,end)_infinite] rounded-full bg-carmine" />
        Loading the district
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <MotionConfig reducedMotion="user">
        <ScrollTop />
        <Suspense fallback={<Booting />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/atlas" element={<Atlas />} />
            <Route path="/claim/:id" element={<Evidence />} />
            <Route path="/decision/:id" element={<Decision />} />
            <Route path="/district" element={<District />} />
            <Route path="/village/:code" element={<Village />} />
            <Route path="/sabha/:id" element={<GramSabha />} />
            <Route path="/dossier/:id" element={<Dossier />} />
            <Route path="/method" element={<Method />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </MotionConfig>
    </BrowserRouter>
  );
}
