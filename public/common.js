// Fonctions partagées entre l'espace bénévoles et l'espace administrateur.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** "19:00" -> "19h", "18:45" -> "18h45" */
export function fmtTime(t) {
  const [h, m] = t.split(':');
  return `${Number(h)}h${m === '00' ? '' : m}`;
}

export function fmtDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtDateTime(date) {
  return (date ?? new Date()).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function localDate(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date de la veille : une soirée qui finit après minuit reste « à venir » jusqu'à sa fin. */
export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDate(d);
}

// --- Horaires --------------------------------------------------------------

/** Un horaire avant midi appartient à la nuit, donc au lendemain de la date de la soirée. */
function slotDate(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d + (hh < 12 ? 1 : 0), hh, mm);
}

export function slotEnd(date, slot) {
  const start = slotDate(date, slot.start);
  const end = slotDate(date, slot.end);
  return end > start ? end : new Date(start.getTime() + 30 * 60_000);
}

/** Trie les créneaux dans l'ordre de la soirée (les heures après minuit en dernier). */
export function sortSlots(slots) {
  const key = (s) => `${s.start < '12:00' ? 1 : 0}${s.start}${String(s.position ?? 0).padStart(4, '0')}`;
  return [...slots].sort((a, b) => key(a).localeCompare(key(b)));
}

export function isPastEvent(ev, slots) {
  const ends = slots.map((s) => slotEnd(ev.date, s).getTime());
  const end = ends.length ? Math.max(...ends) : slotDate(ev.date, '23:59').getTime();
  return end < Date.now();
}

// --- Interface -------------------------------------------------------------

let toastTimer;
export function toast(message, { error = false } = {}) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (error ? ' error' : '');
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

/** Traduit les erreurs Firebase les plus courantes. */
export function errorMessage(err) {
  if (err?.code === 'permission-denied') return 'Action refusée (droits insuffisants ou créneau complet).';
  if (err?.code === 'unavailable') return 'Connexion impossible. Vérifie ta connexion internet.';
  return err?.message || 'Une erreur est survenue.';
}

export const storage = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* navigation privée */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* navigation privée */ }
  },
};

/** Regroupe plusieurs mises à jour temps réel en un seul rendu. */
export function scheduler(fn) {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; fn(); });
  };
}
