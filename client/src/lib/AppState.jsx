import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { readJson, writeJson } from './storage.js';
import { clearRatings, flushRatings, queuedRatings } from './outbox.js';
import { lockJournal } from './journalKey.js';
import { timeOfDay, todayLocal } from './time.js';

const AppState = createContext(null);
const USER_KEY = 'luma.user';
const PROFILE_KEY = 'luma.profile';

export function AppStateProvider({ children }) {
  const [token, setTokenState] = useState(getToken);
  const [user, setUser] = useState(() => (getToken() ? readJson(USER_KEY, null) : null));
  // The profile is cached so a returning user's go-to opens instantly, even offline.
  const [profile, setProfileState] = useState(() => (getToken() ? readJson(PROFILE_KEY, null) : null));
  const [authExpired, setAuthExpired] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [pendingRatings, setPendingRatings] = useState(() => queuedRatings().length);
  const [today, setToday] = useState(null);

  const setProfile = useCallback((next) => {
    if (!next) return;
    const slim = {
      ranking: next.ranking,
      goTo: next.goTo,
      onboardingComplete: next.onboardingComplete,
      onboarding: next.onboarding,
      practiceRatings: next.practiceRatings,
      byTime: next.byTime,
    };
    setProfileState(slim);
    writeJson(PROFILE_KEY, slim);
  }, []);

  const applySession = useCallback((nextToken, nextUser) => {
    setToken(nextToken);
    setTokenState(nextToken);
    setUser(nextUser);
    writeJson(USER_KEY, nextUser);
    setAuthExpired(false);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    setProfileState(null);
    setToday(null);
    writeJson(USER_KEY, null);
    writeJson(PROFILE_KEY, null);
    clearRatings();
    setPendingRatings(0);
    lockJournal();
  }, []);

  const refreshProfile = useCallback(async () => {
    const data = await api('/profile');
    setProfile(data);
    return data;
  }, [setProfile]);

  // Today's check-in, gentle nudge and due reminders for the home screen.
  const refreshToday = useCallback(async () => {
    if (!getToken()) return null;
    const data = await api(`/today?date=${todayLocal()}`);
    setToday(data);
    return data;
  }, []);

  const syncRatings = useCallback(async () => {
    if (!getToken()) return;
    const latest = await flushRatings();
    if (latest) {
      setProfile(latest);
      refreshToday().catch(() => {});
    }
    setPendingRatings(queuedRatings().length);
  }, [setProfile, refreshToday]);

  const login = useCallback(
    async (email, password) => {
      const data = await api('/auth/login', { method: 'POST', body: { email, password }, auth: false });
      applySession(data.token, data.user);
      await refreshProfile().catch(() => {});
      syncRatings().catch(() => {});
      return data.user;
    },
    [applySession, refreshProfile, syncRatings],
  );

  const signup = useCallback(
    async (email, password) => {
      const data = await api('/auth/signup', { method: 'POST', body: { email, password }, auth: false });
      applySession(data.token, data.user);
      await refreshProfile().catch(() => {});
      return data.user;
    },
    [applySession, refreshProfile],
  );

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    writeJson(USER_KEY, nextUser);
  }, []);

  // On load: confirm the stored login is still valid, refresh the go-to and
  // send any ratings saved while offline.
  useEffect(() => {
    if (!token) return;
    api('/auth/me')
      .then(({ user: fresh }) => updateUser(fresh))
      .catch(() => {});
    refreshProfile().catch(() => {});
    refreshToday().catch(() => {});
    syncRatings().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      syncRatings().catch(() => {});
    };
    const goOffline = () => setOnline(false);
    const expired = () => setAuthExpired(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    window.addEventListener('luma:auth-expired', expired);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('luma:auth-expired', expired);
    };
  }, [syncRatings]);

  // Go-to for right now: the time-of-day ranking once there is enough data.
  const bucket = timeOfDay();
  const personal = Boolean(token && user && profile?.onboardingComplete);
  const now = personal
    ? {
        goTo: profile.byTime?.[bucket]?.goTo ?? profile.goTo,
        order: (profile.byTime?.[bucket]?.ranking ?? profile.ranking).map((r) => r.technique),
        reason: profile.byTime?.[bucket]?.reason ?? null,
      }
    : { goTo: 'pacer', order: undefined, reason: null };

  const value = useMemo(
    () => ({
      user: token ? user : null,
      isLoggedIn: Boolean(token && user),
      isModerator: Boolean(token && user?.role === 'moderator'),
      now,
      today,
      refreshToday,
      profile,
      setProfile,
      refreshProfile,
      login,
      signup,
      logout,
      updateUser,
      authExpired,
      dismissAuthExpired: () => setAuthExpired(false),
      online,
      pendingRatings,
      syncRatings,
      noteQueued: () => setPendingRatings(queuedRatings().length),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, user, profile, setProfile, refreshProfile, login, signup, logout, updateUser, authExpired, online, pendingRatings, syncRatings, today, refreshToday, now.goTo, now.reason],
  );

  return <AppState.Provider value={value}>{children}</AppState.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppState);
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider');
  return ctx;
}
