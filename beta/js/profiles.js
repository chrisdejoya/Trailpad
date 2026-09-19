// Profile slots and default-layout reset for Trailpad.
//
// A profile is a named layout snapshot stored in appState.profiles under
// 'profile1'..'profileN'. Saving snapshots the current layout via
// exportLayout(); loading re-applies a snapshot via importLayout(). Both are
// injected so this module stays free of appState/DOM knowledge.

export function createProfiles({ appState, profileCount, exportLayout, importLayout, saveStateData, showToast }) {
  function saveProfile(n) {
    if (n < 1 || n > profileCount) return; const snap = exportLayout(); const key = 'profile' + n; const existing = appState.profiles[key]; snap.name = existing?.name || 'Profile ' + n; appState.profiles[key] = snap; appState.lastProfile = n; saveStateData();
  }

  function loadProfile(n) {
    const key = 'profile' + n;
    const snap = appState.profiles[key]; if (!snap) { showToast('Profile ' + n + ' empty', 1000); return; }
    const profileName = snap.name || 'Profile ' + n;
    importLayout(snap); appState.lastProfile = n; showToast(profileName + ' loaded', 1000); saveStateData();
  }

  async function resetToDefault() {
    try { const res = await fetch('layouts/default.json'); if (!res.ok) throw new Error('default.json not found'); const parsed = await res.json(); importLayout(parsed); showToast('Reset to default layout', 1000); }
    catch { showToast('Could not load default.json', 1000); }
  }

  return { saveProfile, loadProfile, resetToDefault };
}