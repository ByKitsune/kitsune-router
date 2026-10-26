# Kitsune Router

**Your models. Your routes.**

Passerelle IA locale en priorité, neutre entre fournisseurs, maintenue et sponsorisée par [ByKitsune](https://bykitsune.com). Vous choisissez modèles, comptes et ordre de repli. Aucun compte ByKitsune ni achat d’API hébergée n’est requis. Les requêtes sont transmises aux fournisseurs configurés ; local-first ne signifie pas inférence hors ligne.

[English](../README.md) · [Dépôt](https://github.com/ByKitsune/kitsune-router) · [Historique](../CHANGELOG.md) · [Migration](../docs/MIGRATION.md)

## Publication et installation

**1.0.0 est la première version majeure proposée pour le changement de marque ; vérification et publication restent en attente.** Il faut confirmer propriété/enregistrement des espaces de noms, autorisation npm, accès aux registres et artefacts. Cibles : `ByKitsune/kitsune-router`, paquet `@bykitsune/router`, commande `kitsune-router`, image canonique `ghcr.io/bykitsune/kitsune-router`. Les archives 0.x désignent les artefacts ZenRouter d’origine, pas des publications Kitsune rétroactives.

Prérequis : **Node.js >=22.19.0**. Après publication uniquement :

```bash
npm install -g @bykitsune/router@1.0.0
kitsune-router
# Ou : npx @bykitsune/router@1.0.0
```

Depuis les sources, à la racine sans sous-dossier `app/` (utilisez votre copie existante si le dépôt cible n’est pas encore disponible) :

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

Docker doit conserver le volume à `/app/data` ; publication linux/amd64 uniquement. Vérifiez l’image canonique ; un miroir Docker Hub est facultatif. [Installation](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Exploitation](../docs/OPERATIONS.md).

La compression dépend des données : aucun pourcentage fixe, quota illimité ou fonctionnement continu n’est garanti. Les estimations ne sont pas des factures ; inconnu ne signifie pas gratuit. Respectez droits, régions et conditions des fournisseurs. Pas de service Kitsune hébergé par défaut ; l’ancienne synchronisation a été retirée. Cette révision ne certifie aucun test/build actuel. [Projet de version 1.0.0](../releases/RELEASE_NOTES_v1.0.0.md).

## Remerciements et licence

Merci aux auteurs/contributeurs de ZenRouter/9Router, dont Joy, ainsi qu’à [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman) et [Ponytail](https://github.com/DietrichGebert/ponytail). Les mentions de copyright et la provenance historique restent conservées. Licence MIT : [LICENSE](../LICENSE).
