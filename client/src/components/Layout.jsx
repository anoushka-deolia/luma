import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAppState } from '../lib/AppState.jsx';

export function Icon({ name, size = 24 }) {
  const paths = {
    calm: (
      <>
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="9" strokeOpacity="0.45" />
      </>
    ),
    journal: <path d="M6 4h10a2 2 0 0 1 2 2v14H8a2 2 0 0 1-2-2V4Zm3 4h6M9 12h6" />,
    progress: <path d="M4 18c3-1 4-7 7-7s3 4 5 4 3-6 4-9" />,
    community: <path d="M4 6h16v9H9l-5 4V6Z" />,
    you: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />,
    login: <path d="M10 17l5-5-5-5M15 12H3M14 4h5v16h-5" />,
    shield: <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="nav-icon">
      {paths[name]}
    </svg>
  );
}

// A few brighter stars that twinkle: [left %, top %, delay s, size px]
const SPARKLES = [
  [8, 14, 0, 10], [88, 9, 1.4, 8], [72, 34, 2.6, 12], [16, 52, 3.4, 8],
  [92, 62, 0.8, 10], [40, 6, 4.1, 7], [6, 82, 2.1, 11], [62, 88, 3.8, 8],
];

export default function Layout() {
  const { isLoggedIn, isModerator, online, pendingRatings, authExpired, dismissAuthExpired } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();

  const items = isLoggedIn
    ? [
        { to: '/', label: 'Calm', icon: 'calm', end: true },
        { to: '/journal', label: 'Journal', icon: 'journal' },
        { to: '/progress', label: 'Progress', icon: 'progress' },
        { to: '/community', label: 'Community', icon: 'community' },
        { to: '/you', label: 'You', icon: 'you' },
      ]
    : [
        { to: '/', label: 'Calm', icon: 'calm', end: true },
        { to: '/community', label: 'Community', icon: 'community' },
        { to: '/you', label: 'Settings', icon: 'settings' },
        { to: '/login', label: 'Log in', icon: 'login' },
      ];

  return (
    <div className="app">
      <div className="sky" aria-hidden="true">
        <span className="stars" />
        <span className="stars stars--far" />
        {SPARKLES.map(([x, y, d, size], i) => (
          <span key={i} className="sparkle" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s`, width: size, height: size }} />
        ))}
      </div>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="wordmark" aria-label="Luma home">
          <span className="wordmark__dot" aria-hidden="true" />
          luma
        </NavLink>
        <div className="topbar__end" aria-live="polite">
          {!online && <span className="pill pill--offline">Offline: techniques still work</span>}
          {online && pendingRatings > 0 && isLoggedIn && <span className="pill">Syncing {pendingRatings}</span>}
          {isModerator && (
            <NavLink to="/moderation" className="icon-button" aria-label="Moderation queue" title="Moderation queue">
              <Icon name="shield" size={20} />
            </NavLink>
          )}
        </div>
      </header>

      {authExpired && (
        <div className="notice notice--warn" role="status">
          <p>Your login has expired. Whatever you are doing will keep working; log in again to save.</p>
          <div className="notice__actions">
            <button
              type="button"
              className="button button--small"
              onClick={() => {
                dismissAuthExpired();
                navigate('/login', { state: { from: location.pathname, expired: true } });
              }}
            >
              Log in
            </button>
            <button type="button" className="link-button" onClick={dismissAuthExpired}>
              Not now
            </button>
          </div>
        </div>
      )}

      <main className="main" id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="tabbar" aria-label="Main">
        {items.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="tabbar__item">
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
