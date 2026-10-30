# Kitsune Router

**Your models. Your routes.**

Passerelle IA locale en priorité, neutre entre fournisseurs, maintenue et sponsorisée par [ByKitsune](https://bykitsune.com). Vous choisissez modèles, comptes et ordre de repli. Aucun compte ByKitsune ni achat d’API hébergée n’est requis. Les requêtes sont transmises aux fournisseurs configurés ; local-first ne signifie pas inférence hors ligne.

[English](../README.md) · [Dépôt](https://github.com/ByKitsune/kitsune-router) · [Historique](../CHANGELOG.md) · [Migration](../docs/MIGRATION.md)

## Fournisseur officiel ByKitsune

ByKitsune est mis en avant comme fournisseur officiel principal. Dans **Providers**, sélectionnez **Connect ByKitsune**, ajoutez une clé du [tableau de bord ByKitsune](https://bykitsune.com/dashboard?tab=keys), puis choisissez **Fetch Models**. L’API utilise `https://api.bykitsune.com/v1` et l’authentification Bearer ; utilisez les routes `bykitsune/<model-id>` du catalogue obtenu. Vous choisissez toujours les comptes et l’ordre du routage.

Cette intégration concerne le code source actuel.

## Publication et installation

**Conteneur 1.0.2 publié en privé ; accès anonyme en attente ; npm bloqué.** Source immuable `65c8b97d` : 9 041 réussis, 100 ignorés, zéro échec. La récupération `40485038668` a publié GHCR `1.0.2`/`latest` ; lecture authentifiée digest/provenance/SPDX et smoke indépendant de l’image publiée réussis. Le paquet reste **private** à la dernière lecture : le propriétaire a choisi Public sans confirmer, accès anonyme HTTP 401. npm reste refusé E403, lecture publique HTTP 404 ; remplacement du token par l’utilisateur non confirmé. Commandes npm seulement après publication npm vérifiée ; utilisez les sources ou un accès privé autorisé au conteneur. Aucun GitHub Release ni déploiement production. [Preuves 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md) · [Docker](../DOCKER.md).

Les tags restent immuables : `v1.0.1` à `74583402` a passé SSH/CI, mais le contrôle GHCR a échoué avant login/push, sans image canonique. La commande npm publish a échoué, cause encore inconnue ; lecture publique HTTP 404 le 2026-10-27, aucune GitHub Release créée. `v1.0.0` à `390a6567` n’a publié ni npm ni GHCR après l’échec du test de migration. [Tentative 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [Candidate 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md). L’horloge de test et les diagnostics npm ne changent ni le tri ni le refus de propriété en production. Les anciens résultats ne vérifient pas 1.0.2 ; provenance 0.x intacte.

Prérequis : **Node.js >=22.19.0**. Après publication uniquement :

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# Ou : npx @bykitsune/router@1.0.2
```

Depuis le dépôt canonique confirmé ou votre copie existante, à la racine sans sous-dossier `app/` :

Pour une installation **neuve** seulement, générez une fois le secret dans un `.env` privé (shell POSIX/OpenSSL). `next dev` n’exécute pas le générateur du launcher ; sans `JWT_SECRET` aléatoire d’au moins 32 caractères, la connexion échoue. En migration, conservez les valeurs effectives `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` et le `DATA_DIR` absolu. Vérifiez le fichier et remplacez les exemples uniquement sur une installation neuve ; ne le publiez/committez jamais.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Définissez un `INITIAL_PASSWORD` fort avant toute exposition. Ouvrez `http://localhost:20128/dashboard`, connectez un fournisseur autorisé et créez/copiez une clé de passerelle. Base client : `http://localhost:20128/v1`. Choisissez un modèle réellement disponible ; `/api/health` ne prouve pas l’accès au fournisseur.

## Intégration

L’exécutable est **`kitsune-router`** ; la clé du fournisseur est **`kitsunerouter`**. Codex utilise `~/.codex/config.toml` :

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Créez le combo d’exemple `my-route` avant de l’utiliser. La variable contient une clé émise, elle n’en crée pas. Claude Code utilise `ANTHROPIC_BASE_URL=http://localhost:20128` et ajoute `/v1/messages`. Vérifiez les presets sans remplacer les autres paramètres. [Exemples détaillés](../docs/INTEGRATIONS.md).

## Migration et sécurité

Arrêtez l’ancienne passerelle et ses auxiliaires, puis sauvegardez **tout** le répertoire privé. Le démarrage peut migrer `~/.zenrouter` ou `~/.9router` vers `~/.kitsune-router` (équivalents `%APPDATA%` sous Windows), avec instantané SQLite cohérent et vérification des fichiers. Les originaux restent intacts ; aucune destination existante n’est écrasée. Un `DATA_DIR` explicite reste prioritaire et n’est pas déplacé.

Conservez `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/` et `mitm/`. Ne changez pas les sels cryptographiques ni les racines de certificats approuvées pour une simple question de nom. Toutes les clés fournisseur ne sont pas garanties chiffrées au repos. Nouveaux paramètres : `KITSUNE_ROUTER_*` ; en-têtes : `x-kitsune-router-*` ; fournisseur : `kitsunerouter`. `/v1/*` et le port 20128 ne changent pas ; aucun alias ancien n’est exigé.

Docker conserve le volume/montage au `DATA_DIR` effectif : `/app/data` par défaut ou chemin absolu personnalisé pris en charge ; linux/amd64 seulement. Sur Linux restreint, arrêtez/sauvegardez puis gardez l’ancien chemin via `DATA_DIR` explicite sans déplacement, ou demandez une revue privilégiée ; n’ignorez pas les permissions. Vérifiez l’image, miroir facultatif. [Installation](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Exploitation](../docs/OPERATIONS.md).

La compression dépend des données : aucun pourcentage fixe, quota illimité ou fonctionnement continu n’est garanti. Les estimations ne sont pas des factures ; inconnu ne signifie pas gratuit. Respectez droits, régions et conditions des fournisseurs. Pas de service Kitsune hébergé par défaut ; l’ancienne synchronisation a été retirée. Les contrôles source et artefacts locaux ne prouvent pas la publication. [Preuves 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

## Remerciements et licence

Merci aux auteurs/contributeurs de ZenRouter/9Router, dont Joy, ainsi qu’à [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman) et [Ponytail](https://github.com/DietrichGebert/ponytail). Les mentions de copyright et la provenance historique restent conservées. Licence MIT : [LICENSE](../LICENSE).
