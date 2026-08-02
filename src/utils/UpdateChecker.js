// =============================================================================
// UpdateChecker.js — Detecta si se ha desplegado una versión nueva mientras el
// juego está abierto y ofrece recargar (sin borrar caché a mano).
// Cómo: el HTML nunca se cachea (ver vercel.json), así que al pedir "/" de
// nuevo obtenemos el index.html actual; comparamos el nombre (con hash) del
// bundle JS con el que está cargado. Si cambió => hay versión nueva.
// Solo actúa en producción (los assets llevan hash). En dev no hace nada.
// =============================================================================

export function startUpdateChecker(currentModuleUrl) {
  // En producción el módulo vive en /assets/index-XXXX.js; en dev es /src/...
  const cur = /\/assets\/[^/?#]+\.js/.exec(currentModuleUrl || '');
  if (!cur) return; // dev u origen sin hash: no comprobar
  const currentAsset = cur[0];
  let notified = false;

  async function check() {
    if (notified) return;
    try {
      const res = await fetch('/?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const next = /\/assets\/[^"'?#]+\.js/.exec(html);
      if (next && next[0] !== currentAsset) showBanner();
    } catch { /* sin red: ignorar */ }
  }

  function showBanner() {
    if (notified) return;
    notified = true;
    const b = document.createElement('button');
    b.className = 'update-banner';
    b.textContent = '🔄 Nueva versión disponible — toca para actualizar';
    b.addEventListener('click', () => { location.reload(); });
    document.body.appendChild(b);
  }

  // Comprobar al volver a la pestaña y cada pocos minutos.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('focus', check);
  setInterval(check, 4 * 60 * 1000);
  setTimeout(check, 25 * 1000);
}
