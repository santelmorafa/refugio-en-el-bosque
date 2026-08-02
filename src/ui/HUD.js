// =============================================================================
// HUD.js — Interfaz en pantalla: barras, inventario completo (con comidas
// clicables), brújula, prompt, menú de construcción (con nivel), refugio,
// clima/hora, ayuda, MISIONES (retos) y COFRE. Se alimenta del EventBus.
// =============================================================================

import { bus, EVENTS } from '../utils/EventBus.js';
import { CONFIG } from '../config.js';
import { PIECES } from '../systems/BuildingSystem.js';

// Icono + si es comida (clic para comer) por recurso.
const RES = {
  wood: { icon: '🪵', name: 'Madera' },
  stone: { icon: '🪨', name: 'Piedra' },
  leaves: { icon: '🍃', name: 'Hojas' },
  fiber: { icon: '🧵', name: 'Fibra' },
  apples: { icon: '🍎', name: 'Manzanas', food: true },
  berries: { icon: '🫐', name: 'Bayas', food: true },
  mushrooms: { icon: '🍄', name: 'Hongos', food: true },
  fish: { icon: '🐟', name: 'Pescado', food: true },
};
const PIECE_LABELS = {
  floor: 'Piso', wall: 'Pared', roof: 'Techo', door: 'Puerta', window: 'Ventana',
  stairs: 'Escalera', fence: 'Cerca', campfire: 'Fogata', torch: 'Antorcha',
  chest: 'Cofre', bed: 'Cama',
};
const costStr = (cost) => Object.entries(cost)
  .map(([k, v]) => `${(RES[k] || {}).icon || ''}${v}`).join(' ');

export class HUD {
  constructor(root) {
    this.root = root;
    this.helpOpen = false;
    this.missionsOpen = false;
    this.chestOpen = false;
    this._chest = null;
    this._build();
    this._wireEvents();
  }

  _build() {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hint">WASD mover · Shift correr · Espacio saltar/trepar · E recoger · Q comer · B construir · F usar · G reparar · M misiones · H ayuda</div>

      <div class="compass"><span class="arrow">⬆</span><span>Casa</span><span class="dist"></span></div>

      <div class="env-status">
        <span class="daynum">Día <b>1</b></span>
        <span class="clock">☀️ Día</span>
        <span class="weather">🌤️ Despejado</span>
      </div>

      <div class="top-btns">
        <button class="help-btn clickable" data-pause title="Pausa (Esc/P)">⏸ Pausa</button>
        <button class="help-btn clickable" data-missions title="Misiones (M)">🎯 Misiones (M)</button>
        <button class="help-btn clickable" data-help title="Ayuda (H)">❔ Ayuda (H)</button>
      </div>

      <div class="save-flash">💾 Guardado</div>

      <div class="danger-banner">⚠️ <b>¡PELIGRO!</b> El oso viene — corre a un refugio válido</div>

      <div class="bars">
        <div class="bar hunger"><div class="fill"></div><span class="lbl">Hambre</span></div>
        <div class="bar health"><div class="fill"></div><span class="lbl">Vida</span></div>
      </div>

      <div class="inventory"></div>

      <div class="shelter">
        <span class="safe-tag exposed">EXPUESTO</span><br>
        Refugio <span class="lvl">0</span>/4
      </div>

      <div class="crosshair"></div>
      <div class="prompt"></div>
      <div class="toast-wrap"></div>

      <div class="build-banner">🔨 CONSTRUCCIÓN — [1-9] pieza · R rotar · [ ] nivel <b class="blevel">0</b> · clic colocar · B salir</div>
      <div class="build-menu clickable"></div>

      <div class="death"><h2>Has muerto…</h2><p>Reapareces con la mitad de tus materiales.</p></div>

      <div class="help-panel clickable">
        <div class="help-card">
          <h2>🎮 Controles</h2>
          <div class="help-cols">
            <div>
              <h3>Movimiento</h3>
              <ul>
                <li><b>W A S D</b> — Moverse</li>
                <li><b>Ratón</b> — Mirar / cámara</li>
                <li><b>Shift</b> — Correr</li>
                <li><b>Espacio</b> — Saltar · cerca de un árbol: <b>trepar</b> (W/S sube/baja)</li>
              </ul>
              <h3>Recolección y comida</h3>
              <ul>
                <li><b>E</b> / clic — Talar, picar rocas, recoger, pescar (junto al río)</li>
                <li><b>Q</b> — Comer · clic en una comida del inventario</li>
                <li>🍄 Hongos: <b>algunos venenosos</b> (bajan vida)</li>
              </ul>
            </div>
            <div>
              <h3>Construcción</h3>
              <ul>
                <li><b>B</b> — Modo construcción · <b>1–9</b> pieza · <b>R</b> rotar</li>
                <li><b>[</b> / <b>]</b> — Bajar/subir nivel (2º piso)</li>
                <li><b>F</b> — Usar puerta / cofre / cama</li>
                <li><b>G</b> — Reparar pieza dañada</li>
              </ul>
              <h3>General</h3>
              <ul>
                <li><b>M</b> — Misiones · <b>H</b> — Ayuda · <b>Esc</b> — Cerrar</li>
                <li>🛏️ Duerme en una cama para reaparecer ahí</li>
                <li>📦 El cofre guarda materiales</li>
              </ul>
            </div>
          </div>
          <p class="help-tip">🐻 Refugio válido = piso + 4 paredes + techo + puerta cerrada. 🌙 De noche los animales atacan más. ⛈️ Las tormentas dañan las construcciones: repáralas con G.</p>
          <button class="btn help-close">Cerrar (H)</button>
        </div>
      </div>

      <div class="missions-panel clickable">
        <div class="missions-card">
          <h2>🎯 Retos</h2>
          <div class="missions-list"></div>
          <button class="btn missions-close">Cerrar (M)</button>
        </div>
      </div>

      <div class="pause-panel clickable">
        <div class="pause-card">
          <h2>⏸ Pausa</h2>
          <div class="records">
            <div class="rec"><span class="rec-n" data-rec-days>0</span><span class="rec-l">🌅 Día actual / récord</span></div>
            <div class="rec"><span class="rec-n" data-rec-pieces>0</span><span class="rec-l">🏠 Mayor construcción</span></div>
          </div>
          <p class="pause-hint">💾 Tu progreso se guarda solo. Puedes cerrar y volver luego.</p>
          <div class="pause-btns">
            <button class="btn pause-resume">▶ Reanudar</button>
            <button class="btn btn-ghost pause-menu">Guardar y salir al menú</button>
          </div>
        </div>
      </div>

      <div class="chest-panel clickable">
        <div class="chest-card">
          <h2>📦 Cofre</h2>
          <div class="chest-cols">
            <div><h3>Tu inventario</h3><div class="chest-you"></div></div>
            <div><h3>Cofre</h3><div class="chest-store"></div></div>
          </div>
          <div class="chest-actions">
            <button class="btn chest-deposit">Guardar todo →</button>
            <button class="btn chest-withdraw">← Sacar todo</button>
            <button class="btn chest-close">Cerrar (F/Esc)</button>
          </div>
        </div>
      </div>
    `;
    this.root.appendChild(this.el);

    // Refs.
    this.hungerFill = this.el.querySelector('.bar.hunger .fill');
    this.healthFill = this.el.querySelector('.bar.health .fill');
    this.inventoryEl = this.el.querySelector('.inventory');
    this.compassArrow = this.el.querySelector('.compass .arrow');
    this.compassDist = this.el.querySelector('.compass .dist');
    this.shelterLvl = this.el.querySelector('.shelter .lvl');
    this.safeTag = this.el.querySelector('.safe-tag');
    this.dangerBanner = this.el.querySelector('.danger-banner');
    this.promptEl = this.el.querySelector('.prompt');
    this.toastWrap = this.el.querySelector('.toast-wrap');
    this.buildBanner = this.el.querySelector('.build-banner');
    this.buildLevelEl = this.el.querySelector('.build-banner .blevel');
    this.buildMenu = this.el.querySelector('.build-menu');
    this.deathEl = this.el.querySelector('.death');
    this.clockEl = this.el.querySelector('.env-status .clock');
    this.weatherEl = this.el.querySelector('.env-status .weather');
    this.helpPanel = this.el.querySelector('.help-panel');
    this.missionsPanel = this.el.querySelector('.missions-panel');
    this.missionsList = this.el.querySelector('.missions-list');
    this.chestPanel = this.el.querySelector('.chest-panel');

    this.dayEl = this.el.querySelector('.env-status .daynum b');
    this.saveFlash = this.el.querySelector('.save-flash');
    this.pausePanel = this.el.querySelector('.pause-panel');

    this.el.querySelector('[data-help]').addEventListener('click', () => this.toggleHelp());
    this.el.querySelector('.help-close').addEventListener('click', () => this.toggleHelp());
    this.el.querySelector('[data-missions]').addEventListener('click', () => bus.emit('ui:missions'));
    this.el.querySelector('.missions-close').addEventListener('click', () => this.toggleMissions());
    this.el.querySelector('[data-pause]').addEventListener('click', () => bus.emit('ui:togglePause'));
    this.el.querySelector('.pause-resume').addEventListener('click', () => bus.emit('ui:togglePause'));
    this.el.querySelector('.pause-menu').addEventListener('click', () => bus.emit('ui:quitToMenu'));
    this.el.querySelector('.chest-close').addEventListener('click', () => this.closeChest());

    // Inventario (todos los recursos; comidas clicables para comer).
    this._invEls = {};
    for (const key of CONFIG.resources) {
      const meta = RES[key] || { icon: '❓', name: key };
      const div = document.createElement('div');
      div.className = 'inv-item' + (meta.food ? ' food clickable' : '');
      div.innerHTML = `${meta.icon} <b data-inv="${key}">0</b>`;
      if (meta.food) {
        div.title = `Comer ${meta.name} (clic)`;
        div.style.cursor = 'pointer';
        div.addEventListener('click', () => bus.emit(EVENTS.EAT, { type: key }));
      }
      this.inventoryEl.appendChild(div);
      this._invEls[key] = div.querySelector('b');
    }

    // Menú de construcción (piezas; costos con iconos por recurso).
    for (let i = 0; i < PIECES.length; i++) {
      const type = PIECES[i];
      const div = document.createElement('div');
      div.className = 'build-piece';
      div.dataset.piece = type;
      div.innerHTML = `<span class="k">${i < 9 ? '[' + (i + 1) + ']' : ''}</span>${PIECE_LABELS[type]}
        <span class="cost">${costStr(CONFIG.building.costs[type])}</span>`;
      div.addEventListener('click', () => bus.emit('ui:selectPiece', type));
      this.buildMenu.appendChild(div);
    }
  }

  _wireEvents() {
    bus.on(EVENTS.HUNGER_CHANGED, (v) => { this.hungerFill.style.width = `${v * 100}%`; });
    bus.on(EVENTS.HEALTH_CHANGED, (v) => { this.healthFill.style.width = `${v * 100}%`; });
    bus.on(EVENTS.INVENTORY_CHANGED, (inv) => {
      for (const k of Object.keys(this._invEls)) this._invEls[k].textContent = inv[k] ?? 0;
      if (this.chestOpen) this._renderChest();
    });
    bus.on(EVENTS.SHELTER_LEVEL_CHANGED, ({ level }) => { this.shelterLvl.textContent = level; });
    bus.on(EVENTS.SHELTER_SAFE_CHANGED, (safe) => {
      this.safeTag.textContent = safe ? 'A SALVO' : 'EXPUESTO';
      this.safeTag.classList.toggle('safe', safe);
      this.safeTag.classList.toggle('exposed', !safe);
    });
    bus.on(EVENTS.DANGER_WARNING, () => { this.dangerBanner.classList.add('show'); this.el.classList.add('danger'); });
    bus.on(EVENTS.DANGER_START, () => { this.dangerBanner.classList.add('show', 'active'); this.el.classList.add('danger'); });
    bus.on(EVENTS.DANGER_END, () => { this.dangerBanner.classList.remove('show', 'active'); this.el.classList.remove('danger'); });
    bus.on('gather:prompt', (text) => {
      if (text) { this.promptEl.textContent = text; this.promptEl.classList.add('show'); }
      else this.promptEl.classList.remove('show');
    });
    bus.on(EVENTS.BUILD_MODE_CHANGED, (active) => {
      this.buildBanner.classList.toggle('show', active);
      this.buildMenu.classList.toggle('show', active);
    });
    bus.on(EVENTS.BUILD_PIECE_CHANGED, ({ type }) => {
      this.buildMenu.querySelectorAll('.build-piece').forEach((el) => {
        el.classList.toggle('active', el.dataset.piece === type);
      });
    });
    bus.on(EVENTS.BUILD_LEVEL_CHANGED, (lvl) => { this.buildLevelEl.textContent = lvl; });
    bus.on(EVENTS.TOAST, (msg) => this._toast(msg));
    bus.on(EVENTS.PLAYER_DIED, () => this.deathEl.classList.add('show'));
    bus.on(EVENTS.PLAYER_RESPAWN, () => this.deathEl.classList.remove('show'));

    const phaseLabels = { dia: '☀️ Día', atardecer: '🌇 Atardecer', noche: '🌙 Noche', amanecer: '🌅 Amanecer' };
    bus.on(EVENTS.PHASE_CHANGED, ({ phase }) => { this.clockEl.textContent = phaseLabels[phase] || phase; });
    bus.on(EVENTS.WEATHER_CHANGED, ({ type }) => {
      this.weatherEl.textContent = type === 'storm' ? '⛈️ Tormenta' : '🌤️ Despejado';
      this.el.classList.toggle('storming', type === 'storm');
    });

    // Retos: actualizar fila si el panel está abierto.
    bus.on(EVENTS.CHALLENGE_PROGRESS, (p) => this._updateMissionRow(p));
    bus.on(EVENTS.CHALLENGE_COMPLETE, (c) => this._challengeToast(c));

    // Día, pausa, guardado, récords.
    bus.on(EVENTS.DAY_PASSED, ({ day }) => { this.dayEl.textContent = day; });
    bus.on(EVENTS.GAME_LOADED, () => {});
    bus.on(EVENTS.PAUSED_CHANGED, (paused) => this.pausePanel.classList.toggle('show', paused));
    bus.on(EVENTS.GAME_SAVED, () => {
      this.saveFlash.classList.add('show');
      clearTimeout(this._saveT); this._saveT = setTimeout(() => this.saveFlash.classList.remove('show'), 1200);
    });
    bus.on(EVENTS.RECORD_UPDATED, (r) => {
      const d = this.el.querySelector('[data-rec-days]');
      const pc = this.el.querySelector('[data-rec-pieces]');
      if (d) d.textContent = `${r.runDays ?? 0} / ${r.bestDays ?? 0}`;
      if (pc) pc.textContent = r.bestPieces ?? 0;
    });
  }

  // ---- Ayuda / misiones / cofre ----
  toggleHelp() { this.helpOpen = !this.helpOpen; this.helpPanel.classList.toggle('show', this.helpOpen); }

  toggleMissions(snapshot) {
    this.missionsOpen = !this.missionsOpen;
    if (this.missionsOpen && snapshot) this._renderMissions(snapshot);
    this.missionsPanel.classList.toggle('show', this.missionsOpen);
  }

  _renderMissions(list) {
    this.missionsList.innerHTML = '';
    for (const c of list) {
      const row = document.createElement('div');
      row.className = 'mission' + (c.done ? ' done' : '');
      row.dataset.id = c.id;
      const rw = Object.entries(c.reward).map(([k, v]) => `${(RES[k] || {}).icon || ''}${v}`).join(' ');
      row.innerHTML = `
        <div class="m-title">${c.done ? '✅' : '🎯'} ${c.title}</div>
        <div class="m-bar"><div class="m-fill" style="width:${Math.min(100, 100 * c.progress / c.target)}%"></div></div>
        <div class="m-meta"><span class="m-prog">${c.progress}/${c.target}</span><span class="m-reward">🎁 ${rw}</span></div>`;
      this.missionsList.appendChild(row);
    }
  }

  _updateMissionRow({ id, progress, target, done }) {
    const row = this.missionsList.querySelector(`[data-id="${id}"]`);
    if (!row) return;
    row.classList.toggle('done', done);
    row.querySelector('.m-fill').style.width = `${Math.min(100, 100 * progress / target)}%`;
    row.querySelector('.m-prog').textContent = `${progress}/${target}`;
    if (done) row.querySelector('.m-title').textContent = row.querySelector('.m-title').textContent.replace('🎯', '✅');
  }

  _challengeToast() {
    // El toast principal ya lo emite ChallengeSystem; aquí un destello dorado.
    this.el.classList.add('challenge-flash');
    setTimeout(() => this.el.classList.remove('challenge-flash'), 900);
  }

  openChest(entry, inventory, building) {
    this._chest = { entry, inventory, building };
    this.chestOpen = true;
    this.chestPanel.classList.add('show');
    // Botones (re-enlazar a este cofre).
    this.el.querySelector('.chest-deposit').onclick = () => { building.chestDepositAll(entry); this._renderChest(); };
    this.el.querySelector('.chest-withdraw').onclick = () => { building.chestWithdrawAll(entry); this._renderChest(); };
    bus.emit(EVENTS.CHEST_OPENED, { open: true });
    this._renderChest();
  }

  closeChest() {
    this.chestOpen = false;
    this._chest = null;
    this.chestPanel.classList.remove('show');
    bus.emit(EVENTS.CHEST_OPENED, { open: false });
  }

  _renderChest() {
    if (!this._chest) return;
    const { entry, inventory, building } = this._chest;
    const you = this.el.querySelector('.chest-you');
    const store = this.el.querySelector('.chest-store');
    const rowsYou = [], rowsStore = [];
    for (const k of CONFIG.resources) {
      const meta = RES[k] || { icon: '❓' };
      const inv = inventory.items[k] || 0;
      const st = entry.storage[k] || 0;
      rowsYou.push(`<div class="c-row"><span>${meta.icon} ${inv}</span><button data-dep="${k}" ${inv ? '' : 'disabled'}>→</button></div>`);
      rowsStore.push(`<div class="c-row"><button data-wd="${k}" ${st ? '' : 'disabled'}>←</button><span>${meta.icon} ${st}</span></div>`);
    }
    you.innerHTML = rowsYou.join('');
    store.innerHTML = rowsStore.join('');
    you.querySelectorAll('[data-dep]').forEach((b) => b.onclick = () => { building.chestDeposit(entry, b.dataset.dep, 5); this._renderChest(); });
    store.querySelectorAll('[data-wd]').forEach((b) => b.onclick = () => { building.chestWithdraw(entry, b.dataset.wd, 5); this._renderChest(); });
  }

  _toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.toastWrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  }

  updateCompass(playerPos, homePos, cameraYaw) {
    const dx = homePos.x - playerPos.x;
    const dz = homePos.z - playerPos.z;
    const dist = Math.hypot(dx, dz);
    const angleToHome = Math.atan2(dx, dz);
    const rel = angleToHome - cameraYaw;
    this.compassArrow.style.transform = `rotate(${-rel}rad)`;
    this.compassDist.textContent = `${dist.toFixed(0)} m`;
  }
}
