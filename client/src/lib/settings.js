import { useEffect, useSyncExternalStore } from 'react';
import { readJson, writeJson } from './storage.js';

// Appearance and accessibility settings belong to this device (a phone and a
// laptop can differ), so they live in localStorage and are applied as data
// attributes on <html>, which the CSS reads.

const KEY = 'luma.settings';

export const THEMES = [
  { id: 'gold', name: 'Moonlight', swatch: ['#c9bfae', '#fffaf0', '#e8cf9a'] },
  { id: 'silver', name: 'Silver', swatch: ['#aab6cf', '#f7faff', '#c9d6f2'] },
  { id: 'rose', name: 'Rose', swatch: ['#cfb3b2', '#fff6f4', '#f2bcc6'] },
  { id: 'aurora', name: 'Aurora', swatch: ['#a9c6bd', '#f6fffb', '#9fe6cf'] },
];

export const TEXT_SIZES = [
  { id: 's', name: 'Small', scale: 0.94 },
  { id: 'm', name: 'Default', scale: 1 },
  { id: 'l', name: 'Large', scale: 1.12 },
  { id: 'xl', name: 'Extra large', scale: 1.25 },
];

export const DEFAULTS = {
  theme: 'gold',
  mode: 'dark', // system | dark (night) | light (dawn)
  lowStim: false,
  contrast: false,
  textSize: 'm',
  motion: 'system', // system | reduce
  haptics: true,
};

let settings = { ...DEFAULTS, ...readJson(KEY, {}) };
const listeners = new Set();

const prefersDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function resolvedMode(s = settings) {
  if (s.mode === 'system') return prefersDark() ? 'dark' : 'light';
  return s.mode;
}

export function motionReduced(s = settings) {
  return s.lowStim || s.motion === 'reduce' || (s.motion === 'system' && prefersReducedMotion());
}

export function applySettings(s = settings) {
  const root = document.documentElement;
  root.dataset.theme = THEMES.some((t) => t.id === s.theme) ? s.theme : 'gold';
  root.dataset.mode = resolvedMode(s);
  root.dataset.lowstim = String(Boolean(s.lowStim));
  root.dataset.contrast = String(Boolean(s.contrast));
  root.dataset.motion = motionReduced(s) ? 'reduce' : 'full';
  const size = TEXT_SIZES.find((t) => t.id === s.textSize) ?? TEXT_SIZES[1];
  root.style.fontSize = `${size.scale * 100}%`;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0b0b24';
}

export function getSettings() {
  return settings;
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  writeJson(KEY, settings);
  applySettings();
  listeners.forEach((fn) => fn());
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  const value = useSyncExternalStore(subscribe, getSettings);
  // Follow the system when it switches between light and dark.
  useEffect(() => {
    const queries = ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)']
      .map((q) => window.matchMedia?.(q))
      .filter(Boolean);
    const onChange = () => {
      applySettings();
      listeners.forEach((fn) => fn());
    };
    queries.forEach((q) => q.addEventListener('change', onChange));
    return () => queries.forEach((q) => q.removeEventListener('change', onChange));
  }, []);
  return [value, updateSettings];
}

export function useMotionReduced() {
  const [s] = useSettings();
  return motionReduced(s);
}

/** A short vibration on phones that support it, if the person wants haptics. */
export function haptic(pattern = 18) {
  if (!settings.haptics || settings.lowStim) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported: nothing to do.
  }
}
