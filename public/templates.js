// Modèles de soirée : les créneaux sont copiés à la création de chaque soirée,
// puis modifiables soirée par soirée dans l'espace administrateur.
export const TEMPLATES = [
  {
    id: 'workshop',
    name: 'Soirée avec workshops',
    slots: [
      ['Installation', '19:00', '20:00'],
      ['Caisse', '20:00', '21:00'],
      ['Caisse', '21:00', '22:00'],
      ['Caisse', '22:00', '23:00'],
      ['Caisse', '23:00', '00:00'],
      ['Caisse', '00:00', '01:00'],
      ['Rangement', '02:00', '02:30'],
    ],
  },
  {
    id: 'revision',
    name: 'Soirée avec révision',
    slots: [
      ['Installation', '20:00', '21:00'],
      ['Caisse', '21:00', '22:00'],
      ['Caisse', '22:00', '23:00'],
      ['Caisse', '23:00', '00:00'],
      ['Caisse', '00:00', '01:00'],
      ['Rangement', '02:00', '02:30'],
    ],
  },
  {
    id: 'docks',
    name: 'Bachata Docks',
    slots: [
      ['Installation', '18:45', '19:15'],
      ['Désinstallation', '22:00', '22:30'],
    ],
  },
];

export const DEFAULT_CAPACITY = 2;

export const INITIAL_VOLUNTEERS = ['Émilie', 'Cédric', 'Aurore', 'Axel', 'Estelle', 'Alex', 'Youness', 'Alexandre', 'Kévin'];
