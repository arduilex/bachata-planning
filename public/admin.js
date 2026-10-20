import {
  GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  collection, doc, getDocs, onSnapshot, query, orderBy, addDoc, updateDoc, writeBatch,
  runTransaction, arrayUnion, arrayRemove, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db } from '/firebase.js';
import { watchEvents } from '/store.js';
import { TEMPLATES, DEFAULT_CAPACITY, INITIAL_VOLUNTEERS } from '/templates.js';
import { ADMIN_UIDS } from '/config.js';
import { esc, fmtTime, fmtDate, fmtDateTime, toast, errorMessage, scheduler } from '/common.js';

const state = {
  user: null,
  tab: 'upcoming',
  volunteers: [],
  volunteersLoaded: false,
  editing: false,
};

const main = document.getElementById('main');
const tabs = document.getElementById('tabs');
const account = document.getElementById('account');

let store;
let stopVolunteers;
// Ne pas écraser un formulaire en cours de saisie lors d'une mise à jour en temps réel.
const scheduleRender = scheduler(() => { if (!state.editing) render(); });

// ---------------------------------------------------------------------------
// Connexion Google et vérification du rôle administrateur
// ---------------------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  store?.stop();
  stopVolunteers?.();
  state.user = user;
  account.innerHTML = '';
  tabs.hidden = true;

  if (!user || user.isAnonymous) return renderLogin();

  account.innerHTML = `<button type="button" data-action="logout">Déconnexion</button>`;
  // Contrôle d'affichage uniquement : la vraie protection est dans firestore.rules.
  if (!ADMIN_UIDS.includes(user.uid)) return renderNotAdmin(user);

  stopVolunteers = onSnapshot(collection(db, 'volunteers'), (snap) => {
    state.volunteers = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    state.volunteersLoaded = true;
    scheduleRender();
  }, onError);
  store = watchEvents(query(collection(db, 'events'), orderBy('date')), scheduleRender, onError);
});

function onError(err) {
  console.error(err);
  toast(errorMessage(err), { error: true });
}

function renderLogin() {
  main.innerHTML = `
    <div class="panel login">
      <h3>Accès administrateur</h3>
      <p class="muted">Connecte-toi avec le compte Google déclaré comme administrateur.</p>
      <button class="btn block" data-action="login">Se connecter avec Google</button>
    </div>`;
}

function renderNotAdmin(user) {
  main.innerHTML = `
    <div class="panel login">
      <h3>Accès refusé</h3>
      <p class="muted">Le compte <b>${esc(user.email)}</b> n'est pas administrateur.</p>
      <p class="muted" style="font-size:13px">UID : <code>${esc(user.uid)}</code><br>
        Pour l'autoriser, ajouter cet UID dans <code>firestore.rules</code> et <code>public/config.js</code> (voir README).</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Rendu
// ---------------------------------------------------------------------------

const nameOf = (id) => state.volunteers.find((v) => v.id === id)?.name ?? '?';

function render() {
  if (!state.volunteersLoaded) return;
  tabs.hidden = false;
  for (const b of tabs.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === state.tab));
  if (state.tab === 'volunteers') return renderVolunteers();

  const past = state.tab === 'history';
  const list = store.list().filter((e) => e.isPast === past);
  if (past) list.reverse();

  main.innerHTML = `
    ${past ? '' : renderCreateForm()}
    <h2 class="section">${past ? 'Soirées passées' : 'Soirées programmées'}</h2>
    ${list.map(renderEvent).join('') || `<div class="empty"><p>${past ? 'Aucune soirée passée.' : 'Aucune soirée programmée.'}</p></div>`}`;
}

function renderCreateForm() {
  return `
    <form class="panel" data-form="create-event">
      <h3>Nouvelle soirée</h3>
      <div class="row">
        <label class="field">Type
          <select name="type">${TEMPLATES.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        </label>
        <label class="field">Date <input type="date" name="date" required></label>
      </div>
      <div class="row" style="margin-top:8px">
        <label class="field">Titre (facultatif) <input name="title" maxlength="120" placeholder="Ex. Soirée Halloween"></label>
        <button class="btn" style="align-self:end">Créer</button>
      </div>
    </form>`;
}

function renderEvent(ev) {
  const active = state.volunteers.filter((v) => v.active);
  const filled = ev.slots.filter((s) => (s.volunteers ?? []).length >= s.capacity).length;
  return `
    <article class="card">
      <form class="card-head" data-form="event" data-event="${esc(ev.id)}">
        <div class="date">${esc(fmtDate(ev.date))} · ${filled}/${ev.slots.length} créneaux complets</div>
        <div class="row" style="margin:6px 0">
          <input name="title" value="${esc(ev.title)}" maxlength="120" required aria-label="Titre">
          <input type="date" name="date" value="${esc(ev.date)}" required aria-label="Date" style="flex:0 1 170px">
          <button class="btn small ghost">Enregistrer</button>
          <button type="button" class="btn small danger" data-action="delete-event" data-event="${esc(ev.id)}">Supprimer</button>
        </div>
        <span class="badge">${esc(ev.typeName)}</span>
      </form>

      ${ev.slots.map((s) => {
        const ids = s.volunteers ?? [];
        const full = ids.length >= s.capacity;
        const available = active.filter((v) => !ids.includes(v.id));
        const ref = `data-event="${esc(ev.id)}" data-slot="${esc(s.id)}"`;
        return `
        <div class="admin-slot${full ? ' full' : ''}">
          <form class="fields" data-form="slot" ${ref}>
            <input name="label" value="${esc(s.label)}" maxlength="60" required aria-label="Intitulé">
            <input type="time" name="start" value="${esc(s.start)}" required aria-label="Début">
            <input type="time" name="end" value="${esc(s.end)}" required aria-label="Fin">
            <input type="number" name="capacity" value="${s.capacity}" min="1" max="20" required aria-label="Places">
            <div class="row" style="grid-column:1/-1">
              <span class="places">${ids.length}/${s.capacity}</span>
              <span class="muted" style="font-size:13px">${fmtTime(s.start)} – ${fmtTime(s.end)}</span>
              <button class="btn small ghost">Enregistrer</button>
              <button type="button" class="btn small danger" data-action="delete-slot" ${ref}>Supprimer</button>
            </div>
          </form>
          <div class="chips">
            ${ids.map((id) => `<span class="chip">${esc(nameOf(id))}<button type="button" aria-label="Désinscrire ${esc(nameOf(id))}" data-action="remove-volunteer-from-slot" ${ref} data-id="${esc(id)}">×</button></span>`).join('')}
            ${!full && available.length ? `
              <select data-action="add-registration" ${ref} style="width:auto;font-size:14px;padding:4px 8px">
                <option value="">+ Inscrire…</option>
                ${available.map((v) => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('')}
              </select>` : ''}
          </div>
        </div>`;
      }).join('')}

      <form class="admin-slot" data-form="add-slot" data-event="${esc(ev.id)}">
        <div class="fields">
          <input name="label" placeholder="Nouveau créneau" maxlength="60" required aria-label="Intitulé">
          <input type="time" name="start" required aria-label="Début">
          <input type="time" name="end" required aria-label="Fin">
          <input type="number" name="capacity" value="${DEFAULT_CAPACITY}" min="1" max="20" required aria-label="Places">
        </div>
        <button class="btn small" style="justify-self:start">Ajouter le créneau</button>
      </form>

      <details class="remarks" open>
        <summary>Remarques · ${ev.remarks.length}</summary>
        <div class="remarks-body">
          ${ev.remarks.map((m) => `
            <div class="remark">
              <div class="meta"><b>${esc(nameOf(m.volunteerId))}</b><span>${esc(fmtDateTime(m.createdAt))}
                <button class="btn small danger" style="padding:0 6px;margin-left:6px" data-action="delete-remark" data-event="${esc(ev.id)}" data-id="${esc(m.id)}">Supprimer</button></span></div>
              <p>${esc(m.text)}</p>
            </div>`).join('') || '<p class="muted" style="margin:0;font-size:14px">Aucune remarque.</p>'}
        </div>
      </details>
    </article>`;
}

function renderVolunteers() {
  const active = state.volunteers.filter((v) => v.active);
  const inactive = state.volunteers.filter((v) => !v.active);
  main.innerHTML = `
    ${state.volunteers.length ? '' : `
      <div class="panel">
        <h3>Première utilisation</h3>
        <p class="muted">Aucun bénévole enregistré. Créer la liste de départ (${INITIAL_VOLUNTEERS.join(', ')}) ?</p>
        <button class="btn" data-action="seed-volunteers">Créer les ${INITIAL_VOLUNTEERS.length} bénévoles</button>
      </div>`}
    <form class="panel" data-form="add-volunteer">
      <h3>Ajouter un bénévole</h3>
      <div class="row">
        <input name="name" placeholder="Prénom" maxlength="60" required>
        <button class="btn">Ajouter</button>
      </div>
    </form>
    <div class="panel">
      <h3>Bénévoles actifs (${active.length})</h3>
      ${active.map((v) => `
        <form class="vol-row" data-form="volunteer" data-id="${esc(v.id)}">
          <input name="name" value="${esc(v.name)}" maxlength="60" required aria-label="Prénom">
          <button class="btn small ghost">Renommer</button>
          <button type="button" class="btn small danger" data-action="deactivate-volunteer" data-id="${esc(v.id)}">Retirer</button>
        </form>`).join('') || '<p class="muted">Aucun bénévole.</p>'}
    </div>
    ${inactive.length ? `
      <div class="panel">
        <h3>Anciens bénévoles</h3>
        <p class="muted" style="font-size:13px;margin-top:-6px">Leur nom reste visible dans l'historique.</p>
        ${inactive.map((v) => `
          <div class="vol-row inactive">
            <span style="flex:1">${esc(v.name)}</span>
            <button class="btn small ghost" data-action="reactivate-volunteer" data-id="${esc(v.id)}">Réactiver</button>
          </div>`).join('')}
      </div>` : ''}`;
}

// ---------------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------------

const slotRef = (eventId, slotId) => doc(db, 'events', eventId, 'slots', slotId);
const findEvent = (id) => store.list().find((e) => e.id === id);

function createEvent({ type, date, title }) {
  const template = TEMPLATES.find((t) => t.id === type);
  const batch = writeBatch(db);
  const eventRef = doc(collection(db, 'events'));
  batch.set(eventRef, {
    type, typeName: template.name, title: title.trim() || template.name, date, createdAt: serverTimestamp(),
  });
  template.slots.forEach(([label, start, end], position) => {
    batch.set(doc(collection(eventRef, 'slots')), { position, label, start, end, capacity: DEFAULT_CAPACITY, volunteers: [] });
  });
  return batch.commit();
}

async function deleteEvent(eventId) {
  const ref = doc(db, 'events', eventId);
  const batch = writeBatch(db);
  for (const sub of ['slots', 'remarks']) {
    (await getDocs(collection(ref, sub))).forEach((d) => batch.delete(d.ref));
  }
  batch.delete(ref);
  return batch.commit();
}

function updateSlot(eventId, slotId, { label, start, end, capacity }) {
  const cap = Number(capacity);
  const ref = slotRef(eventId, slotId);
  return runTransaction(db, async (tx) => {
    const n = ((await tx.get(ref)).data().volunteers ?? []).length;
    if (n > cap) {
      throw new Error(`Impossible : ${n} bénévoles sont déjà inscrits sur ce créneau. Désinscris d'abord ${n - cap} personne(s).`);
    }
    tx.update(ref, { label: label.trim(), start, end, capacity: cap });
  });
}

function addSlot(eventId, { label, start, end, capacity }) {
  const ev = findEvent(eventId);
  const position = Math.max(-1, ...ev.slots.map((s) => s.position ?? 0)) + 1;
  return addDoc(collection(db, 'events', eventId, 'slots'), {
    position, label: label.trim(), start, end, capacity: Number(capacity), volunteers: [],
  });
}

function addRegistration(eventId, slotId, volunteerId) {
  const ref = slotRef(eventId, slotId);
  return runTransaction(db, async (tx) => {
    const { volunteers = [], capacity } = (await tx.get(ref)).data();
    if (volunteers.length >= capacity) throw new Error('Ce créneau est déjà complet.');
    tx.update(ref, { volunteers: arrayUnion(volunteerId) });
  });
}

/** Retire un bénévole : ses places sur les soirées à venir sont libérées, l'historique garde son nom. */
function deactivateVolunteer(volunteerId) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'volunteers', volunteerId), { active: false });
  for (const ev of store.list().filter((e) => !e.isPast)) {
    for (const s of ev.slots) {
      if (s.volunteers?.includes(volunteerId)) batch.update(slotRef(ev.id, s.id), { volunteers: arrayRemove(volunteerId) });
    }
  }
  return batch.commit();
}

function seedVolunteers() {
  const batch = writeBatch(db);
  INITIAL_VOLUNTEERS.forEach((name) => batch.set(doc(collection(db, 'volunteers')), { name, active: true }));
  return batch.commit();
}

// ---------------------------------------------------------------------------
// Événements de l'interface
// ---------------------------------------------------------------------------

async function run(fn, message) {
  try {
    await fn();
    if (message) toast(message);
  } catch (err) {
    toast(errorMessage(err), { error: true });
  }
  state.editing = false;
  scheduleRender();
}

document.addEventListener('submit', (e) => {
  const form = e.target;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const { event: eventId, slot: slotId, id } = form.dataset;
  switch (form.dataset.form) {
    case 'create-event':
      return run(() => createEvent(data), 'Soirée créée');
    case 'event':
      return run(() => updateDoc(doc(db, 'events', eventId), { title: data.title.trim(), date: data.date }), 'Soirée mise à jour');
    case 'slot':
      return run(() => updateSlot(eventId, slotId, data), 'Créneau mis à jour');
    case 'add-slot':
      return run(() => addSlot(eventId, data), 'Créneau ajouté');
    case 'add-volunteer':
      return run(() => addDoc(collection(db, 'volunteers'), { name: data.name.trim(), active: true }), 'Bénévole ajouté');
    case 'volunteer':
      return run(() => updateDoc(doc(db, 'volunteers', id), { name: data.name.trim() }), 'Prénom modifié');
  }
});

document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    return render();
  }
  const el = e.target.closest('button[data-action]');
  if (!el) return;
  const { event: eventId, slot: slotId, id } = el.dataset;
  switch (el.dataset.action) {
    case 'login':
      return signInWithPopup(auth, new GoogleAuthProvider()).catch(onError);
    case 'logout':
      return signOut(auth);
    case 'delete-event':
      if (confirm('Supprimer cette soirée, ses inscriptions et ses remarques ?')) run(() => deleteEvent(eventId), 'Soirée supprimée');
      return;
    case 'delete-slot':
      if (confirm('Supprimer ce créneau et ses inscriptions ?')) {
        run(async () => { const b = writeBatch(db); b.delete(slotRef(eventId, slotId)); await b.commit(); }, 'Créneau supprimé');
      }
      return;
    case 'remove-volunteer-from-slot':
      return run(() => updateDoc(slotRef(eventId, slotId), { volunteers: arrayRemove(id) }), 'Bénévole désinscrit');
    case 'delete-remark':
      return run(async () => { const b = writeBatch(db); b.delete(doc(db, 'events', eventId, 'remarks', id)); await b.commit(); }, 'Remarque supprimée');
    case 'deactivate-volunteer':
      if (confirm('Retirer ce bénévole ? Ses inscriptions aux soirées à venir seront libérées.')) run(() => deactivateVolunteer(id), 'Bénévole retiré');
      return;
    case 'reactivate-volunteer':
      return run(() => updateDoc(doc(db, 'volunteers', id), { active: true }), 'Bénévole réactivé');
    case 'seed-volunteers':
      return run(seedVolunteers, 'Bénévoles créés');
  }
});

document.addEventListener('change', (e) => {
  const select = e.target.closest('select[data-action="add-registration"]');
  if (!select?.value) return;
  run(() => addRegistration(select.dataset.event, select.dataset.slot, select.value), 'Bénévole inscrit');
});

document.addEventListener('focusin', (e) => { state.editing = e.target.matches('input, select, textarea'); });
document.addEventListener('focusout', () => { state.editing = false; });
