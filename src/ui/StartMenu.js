// =============================================================================
// StartMenu.js — Menú de inicio: título del juego, "Nueva partida" /
// "Continuar" (si hay guardado), y RÉCORDS históricos (días sobrevividos,
// mayor construcción). Devuelve la acción elegida.
// =============================================================================

import { SaveSystem } from '../systems/SaveSystem.js';

export class StartMenu {
  show() {
    return new Promise((resolve) => {
      const hasSave = SaveSystem.hasSave();
      const meta = SaveSystem.meta();
      const rec = SaveSystem.getRecords();
      // Versión = timestamp del build (en Vercel, ~ el del push). __BUILD_TIME__
      // lo inyecta Vite (ver vite.config.js).
      const iso = (typeof __BUILD_TIME__ !== 'undefined') ? __BUILD_TIME__ : new Date().toISOString();
      const bd = new Date(iso);
      const pad = (n) => String(n).padStart(2, '0');
      const version = `v${bd.getUTCFullYear()}.${pad(bd.getUTCMonth() + 1)}.${pad(bd.getUTCDate())}·${pad(bd.getUTCHours())}${pad(bd.getUTCMinutes())}`;
      const stamp = bd.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

      const screen = document.createElement('div');
      screen.className = 'screen start-menu';
      screen.innerHTML = `
        <div class="title-art">
          <h1>Refugio en el <span class="accent">Bosque</span></h1>
          <p class="subtitle">Sobrevive. Construye. Resiste al oso.</p>
        </div>

        <div class="records">
          <div class="rec"><span class="rec-n">${rec.bestDays}</span><span class="rec-l">🌅 Récord de días</span></div>
          <div class="rec"><span class="rec-n">${rec.bestPieces}</span><span class="rec-l">🏠 Mayor construcción</span></div>
        </div>

        <div class="menu-btns">
          ${hasSave ? `<button class="btn btn-continue">▶ Continuar${meta ? ` (día ${meta.day})` : ''}</button>` : ''}
          <button class="btn btn-new">${hasSave ? 'Nueva partida' : '▶ Jugar'}</button>
          <button class="btn btn-ghost btn-demo">🎬 Ver Demo</button>
          ${hasSave ? `<button class="btn btn-ghost btn-erase">🗑 Borrar guardado</button>` : ''}
        </div>
        <p class="menu-hint">Se guarda solo en tu navegador. Auriculares recomendados 🎧</p>
        <div class="version" title="${stamp}">${version}</div>
      `;
      document.getElementById('ui-root').appendChild(screen);

      const finish = (action) => { screen.remove(); resolve(action); };

      const cont = screen.querySelector('.btn-continue');
      if (cont) cont.addEventListener('click', () => finish('continue'));
      screen.querySelector('.btn-demo').addEventListener('click', () => finish('demo'));
      screen.querySelector('.btn-new').addEventListener('click', () => {
        if (hasSave && !confirm('Empezar una partida nueva borrará la guardada. ¿Seguro?')) return;
        SaveSystem.clear();
        finish('new');
      });
      const erase = screen.querySelector('.btn-erase');
      if (erase) erase.addEventListener('click', () => {
        if (!confirm('¿Borrar la partida guardada?')) return;
        SaveSystem.clear();
        screen.querySelector('.btn-continue')?.remove();
        erase.remove();
      });
    });
  }
}
