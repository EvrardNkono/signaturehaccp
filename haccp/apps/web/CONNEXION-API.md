# Connexion front ↔ API

## Démarrage
1. **API** (`signature-haccp-api`) : `npm install`, copier `.env.example` en `.env` (MongoDB + 2 secrets JWT), puis `npm run seed` (données de démo) et `npm run dev` → http://localhost:4000
2. **Front** (`haccp`) : `npm install`, vérifier `apps/web/.env.local` (`NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`), puis `npm run dev` → http://localhost:3000
3. `CORS_ORIGINS` et `APP_URL` de l'API doivent valoir l'URL du front (`http://localhost:3000`).

## Ce qui a été ajouté côté front
- `src/lib/api.ts` : client HTTP (cookies httpOnly, rafraîchissement automatique de session sur 401, erreurs typées, téléchargement CSV/PDF)
- `src/lib/session.tsx` : session (utilisateur, droits, établissements, établissement actif, compteur d'alertes, déconnexion)
- `src/hooks/use-api.ts` : chargement des données avec états chargement / erreur / rechargement
- Pages : mot de passe oublié, réinitialisation (liens des e-mails d'invitation et de réinitialisation)
- Toutes les pages lisent et écrivent via l'API ; les données d'exemple ont été supprimées

## Corrections d'incohérences
- Utilisateurs : un seul rôle (comme l'API), prénom/nom, établissements, invitation par e-mail, renvoi d'invitation
- Mot de passe : même règle que l'API (8 caractères, une lettre, un chiffre)
- Nettoyage : décocher une tâche est réservé aux responsables (règle de l'API)
- Inscription : case « conditions » ajoutée (elle était exigée par la validation mais absente de l'écran)
- Paramètres : conversion vers `{ profile, thresholds }` ; lecture seule hors administrateurs

## Corrections côté API
- Rapports : le seuil « DLC bientôt » suit le réglage de l'établissement (il était fixé à 2)
- `GET /alerts` accepte `equipmentId` (alertes d'un équipement)
- `GET /oil/fryers` renvoie les seuils huile (`limits`) lisibles par les opérateurs
