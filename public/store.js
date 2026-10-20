// Lecture temps réel des soirées, de leurs créneaux et de leurs remarques.
import {
  collection, onSnapshot, orderBy, query,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '/firebase.js';
import { sortSlots, isPastEvent } from '/common.js';

/**
 * Écoute les soirées renvoyées par `eventsQuery` ainsi que leurs sous-collections.
 * `onChange` est appelé à chaque modification ; `list()` renvoie l'état courant.
 */
export function watchEvents(eventsQuery, onChange, onError) {
  const events = new Map();
  const listeners = new Map();

  const stopEvents = onSnapshot(eventsQuery, (snap) => {
    const seen = new Set();
    for (const doc of snap.docs) {
      seen.add(doc.id);
      const ev = events.get(doc.id) ?? { slots: [], remarks: [], loaded: false };
      Object.assign(ev, { id: doc.id, ...doc.data() });
      events.set(doc.id, ev);
      if (listeners.has(doc.id)) continue;
      listeners.set(doc.id, [
        onSnapshot(collection(db, 'events', doc.id, 'slots'), (s) => {
          ev.slots = sortSlots(s.docs.map((d) => ({ id: d.id, ...d.data() })));
          ev.loaded = true;
          onChange();
        }, onError),
        onSnapshot(query(collection(db, 'events', doc.id, 'remarks'), orderBy('createdAt')), (s) => {
          ev.remarks = s.docs.map((d) => {
            const data = d.data({ serverTimestamps: 'estimate' });
            return { id: d.id, ...data, createdAt: data.createdAt?.toDate() };
          });
          onChange();
        }, onError),
      ]);
    }
    for (const id of [...events.keys()]) {
      if (seen.has(id)) continue;
      listeners.get(id)?.forEach((stop) => stop());
      listeners.delete(id);
      events.delete(id);
    }
    onChange();
  }, onError);

  return {
    list() {
      return [...events.values()]
        .filter((ev) => ev.loaded)
        .map((ev) => ({ ...ev, isPast: isPastEvent(ev, ev.slots) }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    },
    stop() {
      stopEvents();
      listeners.forEach((l) => l.forEach((stop) => stop()));
    },
  };
}
