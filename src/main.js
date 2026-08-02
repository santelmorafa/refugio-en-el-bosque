// =============================================================================
// main.js — Punto de entrada.
//   1) Crea el renderer (una sola vez) y el AssetManager (texturas/materiales).
//   2) Muestra la pantalla de selección de personaje (modelos 3D girando).
//   3) Lanza el juego con el personaje elegido.
// =============================================================================

import { Renderer } from './core/Renderer.js';
import { AssetManager } from './core/AssetManager.js';
import { StartMenu } from './ui/StartMenu.js';
import { CharacterSelect } from './ui/CharacterSelect.js';
import { Game } from './core/Game.js';
import { TouchControls } from './ui/TouchControls.js';
import { SaveSystem } from './systems/SaveSystem.js';
import { isTouchDevice, applyMobileProfile } from './config.js';

async function boot() {
  // Detecta teléfono/tablet y aplica el perfil de rendimiento móvil ANTES de
  // crear el render/mundo (menos árboles, sombras reducidas, resolución menor).
  const mobile = isTouchDevice();
  if (mobile) applyMobileProfile();

  // Pantalla de carga simple mientras se preparan materiales.
  const loading = document.createElement('div');
  loading.className = 'screen';
  loading.innerHTML = `<h1>Refugio en el <span class="accent">Bosque</span></h1>
    <p class="subtitle">Cargando el bosque…</p>`;
  document.getElementById('ui-root').appendChild(loading);

  // Renderer compartido (evita crear dos contextos WebGL).
  const renderer = new Renderer(document.getElementById('game-root'));

  // Materiales y texturas (con fallback procedural).
  const assets = new AssetManager(renderer.renderer);
  await assets.init();

  loading.remove();

  // Menú de inicio → (continuar) o selección de personaje.
  let gender = null, saveData = null;
  for (;;) {
    const action = await new StartMenu().show();
    if (action === 'continue') {
      saveData = SaveSystem.load();
      if (saveData) { gender = saveData.gender; break; }
      // Si el guardado estaba corrupto, cae a nueva partida.
    }
    const chosen = await new CharacterSelect(assets).show();
    if (chosen === 'back') continue;      // volver al menú
    gender = chosen; saveData = null; break;
  }

  // Arranca el juego (reanuda si hay guardado).
  const game = new Game(renderer, assets, gender, saveData);
  await game.start();

  // En móvil: monta los controles táctiles (joystick + botones).
  if (mobile) game.touch = new TouchControls(game);

  // Expuesto para depuración desde la consola del navegador.
  window.__GAME__ = game;
}

boot().catch((err) => {
  console.error('Fallo al arrancar el juego:', err);
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `<h1>Ups…</h1><p class="subtitle">${err.message}</p>`;
  document.getElementById('ui-root').appendChild(el);
});
