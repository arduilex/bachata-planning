import { signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  collection, doc, onSnapshot, query, where, orderBy, setDoc, deleteDoc, addDoc, runTransaction,
  arrayUnion, arrayRemove, updateDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from '/firebase.js';
import { watchEvents } from '/store.js';
import {
  esc, fmtTime, fmtDate, fmtDateTime, toast, errorMessage, storage, scheduler, yesterday, slotEnd,
} from '/common.js';

const state = {
  uid: null,
  volunteers: [],
  me: null,
  claimLoaded: false,
  tab: storage.get('bf-tab') || 'upcoming',
  openEvents: new Set(),
  openRemarks: new Set(),
  drafts: new Map(),
  busy: false,
};

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const who = document.getElementById('who');

let store;
// Évite d'effacer la saisie en cours d'une remarque lors d'une mise à jour temps réel.
const scheduleRender = scheduler(() => {
  if (document.activeElement?.tagName === 'TEXTAREA') setTimeout(scheduleRender, 1500);
  else render();
});

// ---------------------------------------------------------------------------
// Connexion anonyme puis écoute des données
// ---------------------------------------------------------------------------

onAuthStateChanged(auth, (user) => {
  if (!user) {
    signInAnonymously(auth).catch(showFatal);
    return;
  }
  if (state.uid === user.uid) return;
  state.uid = user.uid;

  onSnapshot(collection(db, 'volunteers'), (snap) => {
    state.volunteers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    scheduleRender();
  }, showFatal);

  // Le lien entre ce téléphone et un prénom est enregistré côté serveur (claims/{uid}).
  onSnapshot(doc(db, 'claims', user.uid), (snap) => {
    state.me = snap.exists() ? snap.data().volunteerId : null;
    state.claimLoaded = true;
    scheduleRender();
  }, showFatal);

  store = watchEvents(
    query(collection(db, 'events'), where('date', '>=', yesterday()), orderBy('date')),
    scheduleRender,
    showFatal,
  );
});

function showFatal(err) {
  console.error(err);
  main.innerHTML = `<div class="empty"><p>Impossible de charger le planning.<br>${esc(errorMessage(err))}</p></div>`;
}

const nameOf = (id) => state.volunteers.find((v) => v.id === id)?.name ?? '?';
const isMine = (slot) => slot.volunteers?.includes(state.me);
const upcoming = () => (store ? store.list().filter((e) => !e.isPast) : []);
const myEvents = () => upcoming().filter((e) => e.slots.some(isMine));

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

function render() {
  if (!state.claimLoaded) return;
  const active = state.volunteers.filter((v) => v.active);
  if (!state.me || !active.some((v) => v.id === state.me)) return renderPicker(active);

  who.hidden = false;
  who.innerHTML = `<strong>${esc(nameOf(state.me))}</strong><button type="button" data-action="change-me">Changer</button>`;
  tabs.hidden = false;
  for (const b of tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  const mineCount = myEvents().length;
  const counter = document.getElementById('mine-count');
  counter.hidden = !mineCount;
  counter.textContent = mineCount;

  const onlyMine = state.tab === 'mine';
  const list = onlyMine ? myEvents() : upcoming();
  if (!list.length) {
    main.innerHTML = onlyMine
      ? `<div class="empty"><p>Tu n'es inscrit·e sur aucun événement à venir.</p></div>`
      : `<div class="empty"><p>Aucun événement programmé pour le moment.</p></div>`;
    return;
  }
  main.innerHTML = list.map((ev) => renderEvent(ev, onlyMine)).join('');
}

function renderPicker(active) {
  who.hidden = true;
  tabs.hidden = true;
  main.innerHTML = `
    <section class="picker">
      <p>Choisis ton prénom pour accéder au planning.</p>
      <div class="names">
        ${active.map((v) => `<button type="button" data-action="pick" data-id="${esc(v.id)}">${esc(v.name)}</button>`).join('')}
      </div>
    </section>`;
}

function renderEvent(ev, onlyMine) {
  const slots = onlyMine ? ev.slots.filter(isMine) : ev.slots;
  const open = state.openRemarks.has(ev.id);
  const draft = state.drafts.get(ev.id) ?? '';
  return `
    <details class="card event" data-event="${esc(ev.id)}" ${state.openEvents.has(ev.id) ? 'open' : ''}>
      <summary class="card-head">
        <div>
          <div class="date">${esc(fmtDate(ev.date))}</div>
          <h3>${esc(ev.title)}</h3>
          ${ev.title !== ev.typeName ? `<div class="sub">${esc(ev.typeName)}</div>` : ''}
        </div>
        <span class="chevron" aria-hidden="true"></span>
      </summary>
      <ul class="slots">${slots.map((s) => renderSlot(ev, s)).join('')}</ul>
      <details class="remarks" data-event="${esc(ev.id)}" ${open ? 'open' : ''}>
        <summary>Remarques${ev.remarks.length ? ` · ${ev.remarks.length}` : ''}</summary>
        <div class="remarks-body">
          ${ev.remarks.map((m) => `
            <div class="remark">
              <div class="meta"><b>${esc(nameOf(m.volunteerId))}</b><span>${esc(fmtDateTime(m.createdAt))}</span></div>
              <p>${esc(m.text)}</p>
            </div>`).join('')}
          <form class="inline" data-action="remark" data-event="${esc(ev.id)}">
            <textarea name="text" rows="1" maxlength="1000" placeholder="Écrire une remarque…" required>${esc(draft)}</textarea>
            <button class="btn" type="submit">Envoyer</button>
          </form>
        </div>
      </details>
    </details>`;
}

function renderSlot(ev, s) {
  const ids = s.volunteers ?? [];
  const full = ids.length >= s.capacity;
  const mine = isMine(s);
  const past = slotEnd(ev.date, s) < new Date();
  const ref = `data-event="${esc(ev.id)}" data-slot="${esc(s.id)}"`;
  let action;
  if (past) action = `<span class="full-tag">Terminé</span>`;
  else if (mine) action = `<button class="btn ghost small" data-action="unregister" ${ref}>Me retirer</button>`;
  else if (full) action = `<span class="full-tag">Complet</span>`;
  else action = `<button class="btn small" data-action="register" ${ref}>Je viens</button>`;

  const names = ids.map((id) => (id === state.me ? `<b>Moi</b>` : esc(nameOf(id))));
  return `
    <li class="slot${full ? ' full' : ''}${mine ? ' mine' : ''}">
      <div class="slot-main">
        <span class="slot-label">${esc(s.label)}</span>
        <span class="slot-time">${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
        <span class="slot-names">${names.length ? names.join(', ') : '&nbsp;'}</span>
      </div>
      <div class="slot-side">
        <span class="places" aria-label="${ids.length} sur ${s.capacity} places prises">${ids.length}/${s.capacity}</span>
        ${action}
      </div>
    </li>`;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function mutate(fn, successMessage) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
    if (successMessage) toast(successMessage);
  } catch (err) {
    toast(errorMessage(err), { error: true });
  } finally {
    state.busy = false;
  }
}

/** Inscription atomique : le créneau est relu et la limite vérifiée dans la transaction. */
function register(eventId, slotId) {
  const ref = doc(db, 'events', eventId, 'slots', slotId);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Ce créneau n\'existe plus.');
    const { volunteers = [], capacity } = snap.data();
    if (volunteers.includes(state.me)) return;
    if (volunteers.length >= capacity) throw new Error('Ce créneau est déjà complet.');
    tx.update(ref, { volunteers: arrayUnion(state.me) });
  });
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action], [data-tab]');
  if (!el) return;

  if (el.dataset.tab) {
    state.tab = el.dataset.tab;
    storage.set('bf-tab', state.tab);
    render();
    window.scrollTo({ top: 0 });
    return;
  }

  const { action, event: eventId, slot: slotId } = el.dataset;
  if (action === 'pick') {
    await mutate(() => setDoc(doc(db, 'claims', state.uid), { volunteerId: el.dataset.id }));
  } else if (action === 'change-me') {
    await mutate(() => deleteDoc(doc(db, 'claims', state.uid)));
  } else if (action === 'register') {
    await mutate(() => register(eventId, slotId), 'Inscription enregistrée');
  } else if (action === 'unregister') {
    await mutate(
      () => updateDoc(doc(db, 'events', eventId, 'slots', slotId), { volunteers: arrayRemove(state.me) }),
      'Désinscription enregistrée',
    );
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-action="remark"]');
  if (!form) return;
  e.preventDefault();
  const eventId = form.dataset.event;
  const text = form.elements.text.value.trim();
  if (!text) return;
  await mutate(async () => {
    await addDoc(collection(db, 'events', eventId, 'remarks'), {
      volunteerId: state.me, text, createdAt: serverTimestamp(),
    });
    state.drafts.delete(eventId);
    scheduleRender();
  }, 'Remarque envoyée');
});

// Conserve les brouillons et les sections ouvertes lors des mises à jour en temps réel.
document.addEventListener('input', (e) => {
  const form = e.target.closest('form[data-action="remark"]');
  if (form) state.drafts.set(form.dataset.event, e.target.value);
});
document.addEventListener('toggle', (e) => {
  const d = e.target;
  const set = d.matches?.('details.event') ? state.openEvents
    : d.matches?.('details.remarks') ? state.openRemarks : null;
  if (!set) return;
  if (d.open) set.add(d.dataset.event);
  else set.delete(d.dataset.event);
}, true);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
