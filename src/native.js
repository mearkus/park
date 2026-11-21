// Thin wrapper over Capacitor's native plugins. Everything here is a no-op in a
// normal browser, so the web build behaves exactly as before.
//
// Uses window.Capacitor (injected by the native shell) instead of importing
// @capacitor/* packages, so the web bundle carries no native code.

const Cap = window.Capacitor;
export const isNative = !!Cap?.isNativePlatform?.();
export const platform = Cap?.getPlatform?.() || 'web';
const plugin = (name) => (isNative ? Cap.Plugins?.[name] : null);
const quiet = (p) => { if (p?.catch) p.catch(() => {}); };

// iOS may clear WebView storage when the phone is low on space, so the apps keep
// a copy of every saved value in native Preferences and restore it on launch.
export const PREFIX = 'wild-horizons-'; // SAVE_KEY and PREF_KEY in main.js

export async function restoreStorage() {
  const Pref = plugin('Preferences');
  if (!Pref) return;
  try {
    const { keys } = await Pref.keys();
    for (const key of keys) {
      if (!key.startsWith(PREFIX)) continue;
      const { value } = await Pref.get({ key });
      if (value != null) localStorage.setItem(key, value);
    }
  } catch { /* keep whatever the WebView has */ }
}

/** Call wherever the game writes (or removes) a saved value. */
export function persist(key, value) {
  const Pref = plugin('Preferences');
  if (!Pref) return;
  quiet(value == null ? Pref.remove({ key }) : Pref.set({ key, value }));
}

export function haptic(kind = 'light') {
  const H = plugin('Haptics');
  if (!H) return;
  if (kind === 'success') quiet(H.notification({ type: 'SUCCESS' }));
  else if (kind === 'warning') quiet(H.notification({ type: 'WARNING' }));
  else quiet(H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' }));
}

/** Android back button: close the top menu/dialog, else go back a screen, else exit. */
export function onBackButton(fn) {
  quiet(plugin('App')?.addListener('backButton', fn));
}
export const exitApp = () => quiet(plugin('App')?.exitApp());

/** Pause the game when the app goes to the background. */
export function onAppStateChange(fn) {
  quiet(plugin('App')?.addListener('appStateChange', ({ isActive }) => fn(isActive)));
}

export function setupChrome() {
  if (!isNative) return;
  document.documentElement.classList.add('native', 'platform-' + platform);
  quiet(plugin('StatusBar')?.setStyle({ style: 'DARK' }));
  if (platform === 'android') quiet(plugin('StatusBar')?.setBackgroundColor({ color: '#1b2f27' }));
  quiet(plugin('SplashScreen')?.hide());
}
