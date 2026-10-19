# Signature HACCP — API

API REST de Signature HACCP : Node.js 20+, Express 5, TypeScript, MongoDB (Mongoose), Zod.
Elle reprend les types, règles et libellés du front (`apps/web`) : statuts de température, escalade des alertes,
huile de friture, DLC, droits par rôle, etc.

## Démarrage

```bash
# à la racine du monorepo
npm install
cp apps/api/.env.example apps/api/.env     # (un .env de développement est déjà fourni)
npm run seed:api -- --reset                # jeu de données de démonstration (optionnel)
npm run dev:api                            # http://localhost:4000
```

Il faut une base MongoDB : locale (`mongodb://127.0.0.1:27017/signature-haccp`) ou MongoDB Atlas
(offre gratuite, région Europe) — copiez alors l'URI de connexion dans `MONGODB_URI`.

Scripts (`apps/api`) : `dev`, `build`, `start`, `seed`, `typecheck`, `test`.
Production : `npm run build:api` puis `npm run start -w api`.

Comptes de démonstration (mot de passe `Haccp2026!`, modifiable via `SEED_PASSWORD`) :
`jules@signature.fr` (super admin) · `camille.roux@signature.fr` (admin) · `nadia.benali@signature.fr` (responsable) ·
`marc.lefevre@signature.fr` (opérateur).

## Fichier `.env`

Toutes les variables sont validées au démarrage : une valeur manquante ou invalide arrête le serveur avec un message clair.
Les deux secrets JWT du `.env` fourni sont générés aléatoirement : **régénérez-en pour la production** et ne les versionnez jamais.
Le détail de chaque variable est commenté dans `.env.example`.

## Sécurité

- Session par cookies **httpOnly** (accès 15 min + rafraîchissement 7 j avec **rotation** ; la réutilisation d'un jeton déjà utilisé révoque toute la session). Clients mobiles : en-tête `X-Client: mobile` → jetons dans le corps, puis `Authorization: Bearer`.
- Protection CSRF par contrôle d'origine, CORS limité à `CORS_ORIGINS`, Helmet, limitation de débit (plus stricte sur l'authentification), verrouillage du compte 15 min après 5 échecs, réponses identiques pour un e-mail inconnu.
- Droits par rôle **vérifiés côté serveur** (matrice dans `src/domain/permissions.ts`) + accès limité aux établissements autorisés. Chaque requête est filtrée par entreprise : une autre entreprise reçoit un 404.
- Données de preuve : jamais de suppression physique (équipements, documents, tâches : archivage avec motif). Journal d'audit des actions sensibles (`GET /company/audit-logs`).
- Fichiers : formats et taille contrôlés, téléchargement uniquement authentifié. Export CSV protégé contre l'injection de formules.

## Routes (préfixe `/api/v1`)

Réponses d'erreur : `{ "error": { "code", "message", "fields?" } }` (422 = validation, avec le détail par champ).
Listes : `{ "data": [...], "meta": { total, page, limit, pages } }`.

| Domaine | Routes |
|---|---|
| Authentification | `POST /auth/register` (JSON ou multipart avec `kbisFile`), `login`, `refresh`, `logout`, `forgot-password`, `reset-password`, `change-password` ; `GET /auth/me` |
| Entreprise | `GET/PUT /company/onboarding`, `GET /company/audit-logs` |
| Utilisateurs | `GET/POST /users`, `GET/PATCH/DELETE /users/:id` (désactivation), `POST /users/:id/resend-invite` |
| Établissements | `GET/POST /establishments` ; `GET/PATCH/DELETE /establishments/:eid` (archivage) ; `GET/PUT /establishments/:eid/settings` |

Sous `/establishments/:eid` :

| Module | Routes |
|---|---|
| Équipements | `GET/POST /equipments`, `GET/PATCH/DELETE /equipments/:id` (archivage avec motif), `POST /equipments/:id/restore`, `GET /equipments/:id/history`, `POST /equipments/:id/sensor/pair`, `DELETE /equipments/:id/sensor` |
| Relevés | `GET/POST /readings` (température critique ⇒ action corrective obligatoire) |
| Alertes | `GET /alerts` (filtres `state,severity,kind,search`), `GET /alerts/:id`, `POST /alerts/:id/take`, `release`, `resolve`, `reopen` |
| Nettoyage | `GET/POST /cleaning`, `PATCH/DELETE /cleaning/:id`, `POST/DELETE /cleaning/:id/complete` |
| Huile | `GET /oil/controls`, `POST /oil/controls`, `GET /oil/fryers`, `GET /oil/changes`, `POST /oil/fryers/:id/changes` |
| Traçabilité | `GET/POST /lots`, `GET/PATCH /lots/:id`, `POST /lots/:id/use`, `POST /lots/:id/discard` |
| Documents | `GET/POST /documents` (multipart : `file` + métadonnées), `GET/PATCH/DELETE /documents/:id`, `GET /documents/:id/file`, `POST /documents/:id/restore`, `DELETE /documents/:id/permanent` |
| Tableau de bord | `GET /dashboard` |
| Rapports | `GET /reports/summary`, `/reports/export.csv`, `/reports/export.pdf` |

Capteurs : `POST /api/v1/iot/readings` avec l'en-tête `x-device-key` (clé affichée **une seule fois** à l'appairage).
Corps : `{ "value": 2.8, "battery": 84, "signal": 4, "at": "2026-10-15T10:00:00Z" }` (`battery`, `signal`, `at` facultatifs).

## Ce que l'API fait toute seule

- Relevé hors plage ⇒ alerte de température (créée ou mise à jour, **sans doublon** ; sa gravité peut monter, jamais baisser).
- Capteur : batterie faible, capteur muet depuis `SENSOR_OFFLINE_MINUTES` ⇒ alerte ; reconnexion ⇒ clôture automatique.
- Huile : taux de composés polaires, température ou aspect anormal ⇒ alerte ; changement d'huile ⇒ clôture.
- Tâches planifiées (toutes les 5 / 15 min, chaque heure) : capteurs muets, nettoyage en retard, DLC périmées ou proches.
- E-mail immédiat aux administrateurs et responsables de l'établissement (+ destinataires supplémentaires) selon les paramètres de notification. Les alertes **critiques** passent aussi pendant les heures calmes. Sans `SMTP_HOST`, l'e-mail est affiché dans les logs.
- Escalade (calculée à la lecture) : critique N1 15 min · N2 1 h · N3 4 h ; attention N1 1 h · N2 4 h · N3 24 h.

## Brancher le front

1. Variable du front : `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` ; chaque `fetch` avec `credentials: "include"`.
2. `CORS_ORIGINS` doit contenir l'URL exacte du front. Front et API sur des domaines différents en production :
   `COOKIE_SECURE=true` et `COOKIE_SAMESITE=none` (HTTPS obligatoire), `TRUST_PROXY=true` derrière un proxy.
3. Différences avec les données d'exemple du front :
   - identifiants = chaînes MongoDB (24 caractères) ; dates en ISO (`createdAt`, `at`, `lastReadingAt`...) — « il y a 9 min » se calcule à l'affichage ;
   - équipement : `lastReadingAt` (ISO), `history` (dernières valeurs), `status` déjà calculé ; relevé : `at` à la place de `time` ;
   - rôles : `super_admin | admin | manager | operator | auditor` (comme `users.ts`) ;
   - paramètres : les nombres peuvent être envoyés en texte (`"2,8"` accepté).
4. Le front doit créer la page `/reinitialiser-mot-de-passe` (paramètre `?token=`) : les e-mails de réinitialisation et d'invitation y pointent.

## Tests

`npm run test -w api` : 75 tests (logique métier, authentification, parcours complets, droits, isolation entre entreprises,
tâches planifiées). Ils ont besoin d'un MongoDB sur `127.0.0.1:27017` (ou `TEST_MONGODB_URI`) et travaillent sur une base
jetable `haccp_test_*` supprimée à la fin : ils ne touchent jamais la base du `.env`.

## Limites connues

- Testée contre **FerretDB** (serveur compatible MongoDB), pas contre un MongoDB/Atlas réel : lancez `npm run test -w api` sur votre base avant la mise en production.
- Non testés faute d'identifiants : l'envoi SMTP réel et le stockage **Cloudinary** (`STORAGE_DRIVER=cloudinary`). Le stockage `local` est prévu pour le développement (disque éphémère chez la plupart des hébergeurs).
- Non réalisés : double authentification (2FA), notifications push et SMS, résumés quotidiens/hebdomadaires (seule la fréquence « immédiate » envoie), photos justificatives sur les relevés d'huile et le nettoyage, MQTT/LoRaWAN (les capteurs envoient en HTTPS), abonnement Stripe.
- Rapport PDF volontairement sobre (texte structuré) ; mise en page à retravailler avec votre charte.
