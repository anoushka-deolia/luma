import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import { CalmHome, CalmTechnique } from './pages/Calm.jsx';
import { Login, Signup } from './pages/Auth.jsx';

// The calm screens load first and alone, so help opens fast on a weak
// connection. Everything else (including the chart library) loads on demand.
const Onboarding = lazy(() => import('./pages/Onboarding.jsx'));
const Journal = lazy(() => import('./pages/Journal.jsx'));
const Progress = lazy(() => import('./pages/Progress.jsx'));
const Community = lazy(() => import('./pages/Community.jsx'));
const You = lazy(() => import('./pages/You.jsx'));
const Moderation = lazy(() => import('./pages/Moderation.jsx'));

const page = (el) => <Suspense fallback={<p className="muted">Loading…</p>}>{el}</Suspense>;

function NotFound() {
  return (
    <div className="page page--narrow">
      <h1 className="page-title">This page doesn&rsquo;t exist</h1>
      <p>
        <Link to="/">Go to the breathing pacer</Link>
      </p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CalmHome />} />
        <Route path="calm/:technique" element={<CalmTechnique />} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="community" element={page(<Community />)} />
        <Route path="onboarding" element={<RequireAuth>{page(<Onboarding />)}</RequireAuth>} />
        <Route path="journal" element={<RequireAuth reason="journal">{page(<Journal />)}</RequireAuth>} />
        <Route path="progress" element={<RequireAuth reason="progress">{page(<Progress />)}</RequireAuth>} />
        <Route path="you" element={page(<You />)} />
        <Route path="account" element={<Navigate to="/you" replace />} />
        <Route path="moderation" element={<RequireAuth>{page(<Moderation />)}</RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
