# Bachata Fusion – Espace bénévoles

Application web (PWA) pour organiser les bénévoles des soirées Bachata Fusion.
Un seul lien à partager dans Messenger : chaque bénévole choisit son prénom et s'inscrit sur les créneaux, en temps réel.

- **Bénévoles** : onglets « Prochains événements » et « Mes événements », inscription/désinscription, remarques.
- **Administrateur** : création des soirées à partir de 3 modèles, modification des créneaux, horaires et nombre de places, gestion des bénévoles, historique.
- Blocage automatique quand un créneau est complet (2/2 par défaut), vérifié côté serveur par les règles Firestore.

## Architecture

| Élément | Rôle |
|---|---|
| **Firebase Hosting** | Héberge les pages (`public/`) en HTTPS |
| **Cloud Firestore** | Base de données temps réel |
| **Firebase Authentication** | Connexion anonyme (bénévoles) et compte Google (administrateur) |
| `firestore.rules` | Règles de sécurité : limite de places, chacun ne modifie que ses inscriptions, admin seul gestionnaire |

Aucun serveur à maintenir : tout fonctionne sur l'offre gratuite **Spark** de Firebase.

```
public/
  index.html, app.js     → espace bénévoles
  admin.html, admin.js   → espace administrateur
  firebase.js            → initialisation Firebase (config fournie par Hosting)
  store.js               → lecture temps réel des soirées
  templates.js           → modèles de soirée et liste initiale des bénévoles
  config.js              → UID des administrateurs
  common.js, styles.css  → fonctions et styles partagés
  sw.js, manifest.webmanifest, logo/icônes → PWA
firestore.rules          → règles de sécurité
firebase.json, .firebaserc → configuration Firebase (projet planning-events)
```

### Données Firestore

| Collection | Contenu |
|---|---|
| `volunteers/{id}` | `name`, `active` |
| `claims/{uid}` | `volunteerId` : lien entre un téléphone (connexion anonyme) et un prénom |
| `events/{id}` | `type`, `typeName`, `title`, `date` (AAAA-MM-JJ) |
| `events/{id}/slots/{id}` | `label`, `start`, `end` (HH:MM), `capacity`, `position`, `volunteers` (liste d'IDs) |
| `events/{id}/remarks/{id}` | `volunteerId`, `text`, `createdAt` |

Les horaires avant midi (ex. `00:00`, `02:00`) sont considérés comme la nuit suivant la date de la soirée.

---

## Installation sur un nouvel ordinateur

### 1. Prérequis

- **Node.js 20 ou plus récent** : https://nodejs.org (vérifier avec `node -v`)
- **Git** (sur Mac : `xcode-select --install` s'il n'est pas déjà là)
- Accès au dépôt GitHub `bachata-planning`

### 2. Récupérer le projet

```bash
git clone https://github.com/arduilex/bachata-planning.git
cd bachata-planning
npm install
```

`npm install` installe Firebase CLI dans le projet : toutes les commandes passent par `npx firebase …` ou `npm run …`.

### 3. Se connecter à Firebase

```bash
npx firebase login          # inutile si déjà connecté
npx firebase projects:list  # le projet planning-events doit apparaître
```

Le projet `planning-events` est déjà sélectionné via `.firebaserc`.

### 4. Vérifier la configuration dans la console Firebase

Sur https://console.firebase.google.com → projet **planning-events** :

1. **Authentication → Sign-in method** : activer **Anonyme** et **Google**.
2. **Firestore Database** : la base doit exister (édition Standard). Sinon, cliquer sur « Créer une base de données ».
3. **Paramètres du projet → Vos applications** : une application **Web** doit exister.
   Sinon, la créer en ligne de commande :
   ```bash
   npx firebase apps:create WEB bachata-planning
   ```

### 5. Publier les règles de sécurité

```bash
npm run deploy:rules
```

Si la commande signale une erreur dans `firestore.rules`, elle indique la ligne concernée.

### 6. Compte administrateur

L'administrateur se connecte avec son **compte Google** (pas de mot de passe ni de clé propre à l'application).
Le compte autorisé est identifié par son **UID Firebase**, déjà configuré :

```
T3ZA4bGuNNQAwgQxK6RtAQbG1v82
```

Il est déclaré à deux endroits, qui doivent rester identiques :

- `firestore.rules` → fonction `adminUids()` (c'est elle qui protège réellement les données) ;
- `public/config.js` → `ADMIN_UIDS` (sert seulement à afficher ou non l'interface admin).

Pour ajouter un autre administrateur : il se connecte une première fois sur `/admin`, la page « Accès refusé » affiche son UID ; l'ajouter aux deux listes puis `npm run deploy`.
L'UID d'un compte est aussi visible dans la console Firebase → **Authentication → Users**.

### 7. Tester en local

```bash
npm start
```

Puis ouvrir :

- Bénévoles : http://localhost:5050
- Administrateur : http://localhost:5050/admin

> ⚠️ En local, l'application utilise la **vraie** base de données Firestore du projet.
> Ce que tu crées en test sera visible en ligne : pense à supprimer les soirées de test.

Arrêter avec `Ctrl + C`.

### 8. Première utilisation (espace admin)

1. Ouvrir `/admin` → **Se connecter avec Google** (avec le compte administrateur de l'étape 6).
2. Onglet **Bénévoles** → **Créer les 9 bénévoles** (Émilie, Cédric, Aurore, Axel, Estelle, Alex, Youness, Alexandre, Kévin).
3. Onglet **Soirées à venir** → choisir le type et la date → **Créer**.

### 9. Mettre en ligne

```bash
npm run deploy
```

L'application est alors disponible sur :

- Bénévoles : **https://planning-events.web.app** ← lien à partager dans Messenger
- Administrateur : https://planning-events.web.app/admin ← à ne jamais partager

Les bénévoles peuvent l'ajouter à leur écran d'accueil (Safari : Partager → « Sur l'écran d'accueil » ; Chrome : menu → « Installer l'application »).

---

## Mettre à jour l'application

```bash
git pull
npm run deploy
```

## Modèles de soirée

Définis dans `public/templates.js` (modifiables, puis `npm run deploy`) :

| Modèle | Créneaux |
|---|---|
| Soirée avec workshops | Installation 19h–20h · Caisse 20h → 1h (par heure) · Rangement 2h–2h30 |
| Soirée avec révision | Installation 20h–21h · Caisse 21h → 1h (par heure) · Rangement 2h–2h30 |
| Bachata Docks | Installation 18h45–19h15 · Désinstallation 22h–22h30 |

Chaque soirée créée copie les créneaux du modèle ; ils restent ensuite modifiables individuellement dans l'admin.

## Dépannage

| Problème | Solution |
|---|---|
| « Configuration Firebase introuvable » | Lancer avec `npm start` (pas en ouvrant le fichier HTML directement) et vérifier qu'une application Web existe (étape 4.3). |
| « Accès refusé » dans l'admin | Le compte Google connecté n'est pas celui de l'UID configuré (étape 6). La page affiche l'UID du compte connecté pour comparer. |
| « Action refusée » ou chargement impossible | Les règles ne sont pas publiées : `npm run deploy:rules`. Vérifier aussi que la connexion Anonyme est activée. |
| La fenêtre Google ne s'ouvre pas | Autoriser les pop-ups ; vérifier dans Authentication → Settings → Domaines autorisés que `localhost` et `planning-events.web.app` sont présents. |
| Le port 5050 est occupé | Changer `emulators.hosting.port` dans `firebase.json`. |

## Limites connues

- Les bénévoles s'identifient en choisissant leur prénom, sans mot de passe : rien n'empêche techniquement quelqu'un de choisir le prénom d'un autre. Adapté à une équipe de confiance.
- L'offre Spark ne fait pas de sauvegarde automatique de Firestore.
