// =============================================================================
// SaveSystem.js — Guardado automático del progreso en el navegador
// (localStorage). Guarda una partida reanudable y los RÉCORDS históricos
// (días sobrevividos, mayor construcción). Sin servidor; todo local.
// =============================================================================

const KEY_SAVE = 'refugio_save_v1';
const KEY_RECORDS = 'refugio_records_v1';

export class SaveSystem {
  static hasSave() {
    try { return !!localStorage.getItem(KEY_SAVE); } catch { return false; }
  }

  static save(data) {
    try {
      localStorage.setItem(KEY_SAVE, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('[Save] no se pudo guardar:', e);
      return false;
    }
  }

  static load() {
    try {
      const raw = localStorage.getItem(KEY_SAVE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  static clear() {
    try { localStorage.removeItem(KEY_SAVE); } catch {}
  }

  // Metadatos ligeros para mostrar en el menú ("Continuar — día 3, Marco").
  static meta() {
    const d = SaveSystem.load();
    if (!d) return null;
    return { gender: d.gender, day: d.day || 0, ts: d.ts || 0 };
  }

  // --- Récords históricos (persisten entre partidas) ---
  static getRecords() {
    try {
      const raw = localStorage.getItem(KEY_RECORDS);
      return raw ? JSON.parse(raw) : { bestDays: 0, bestPieces: 0 };
    } catch {
      return { bestDays: 0, bestPieces: 0 };
    }
  }

  static updateRecords({ days, pieces }) {
    const r = SaveSystem.getRecords();
    let changed = false;
    if (days != null && days > r.bestDays) { r.bestDays = days; changed = true; }
    if (pieces != null && pieces > r.bestPieces) { r.bestPieces = pieces; changed = true; }
    if (changed) { try { localStorage.setItem(KEY_RECORDS, JSON.stringify(r)); } catch {} }
    return { records: r, changed };
  }
}
