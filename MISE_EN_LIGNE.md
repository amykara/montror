# Mettre MONTR'OR en ligne — gratuitement

> **C'est fait.** Le site tourne depuis le 20 août 2026 :
>
> | | |
> |---|---|
> | Boutique | https://montror.missdiana944.workers.dev |
> | API | https://montror-api.onrender.com/api/ |
> | Admin | https://montror-api.onrender.com/admin/ |
> | Code | https://github.com/amykara/montror |
>
> Ce document reste la marche à suivre pour refaire la manœuvre — nouvel
> hébergeur, second site, ou remise en route après un incident.

Quatre comptes à créer, aucune carte bancaire. Comptez une heure la première
fois.

L'ordre compte : la base et les photos d'abord, l'API ensuite, le site en
dernier — chaque étape a besoin d'une valeur produite par la précédente.

---

## 1. La base de données — Neon

Le disque des hébergeurs gratuits est effacé à chaque déploiement. Une base
posée dessus perdrait toutes vos commandes.

1. Compte sur **neon.tech** (connexion avec GitHub ou Google)
2. **Create project** → région **Europe (Frankfurt)**, la plus proche d'Abidjan
3. Copiez la **Connection string**, qui ressemble à :
   `postgresql://user:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/neondb`

Gardez-la de côté : c'est votre `DATABASE_URL`.

> **Au passage, ça corrige un vrai défaut.** Sur SQLite, Django ignore
> silencieusement le verrou qui empêche deux clients d'acheter la même
> dernière montre. Sur Postgres, ce verrou fonctionne enfin.

---

## 2. Les photos — Cloudinary

1. Compte sur **cloudinary.com** (offre gratuite : 25 Go, vous en utilisez 0,06)
2. Tableau de bord → **API Environment variable**
3. Copiez la ligne `cloudinary://123456789:abcdef@votre-cloud`

C'est votre `CLOUDINARY_URL`.

### Transférer vos 131 photos existantes

À faire **une seule fois**, depuis votre ordinateur :

```bash
cd backend
# collez la valeur dans .env, puis :
./venv/Scripts/python.exe manage.py envoyer_medias --simulation   # pour voir
./venv/Scripts/python.exe manage.py envoyer_medias                # pour envoyer
```

Sans cette étape, toutes vos fiches produit s'afficheraient sans image.

---

## 3. L'API Django — Render

1. Poussez le projet sur **GitHub** (le dépôt peut être privé)
2. Compte sur **render.com** → **New** → **Blueprint**
3. Sélectionnez votre dépôt : Render lit `render.yaml` et configure tout seul
4. Il demande alors les valeurs manquantes :

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | la chaîne Neon de l'étape 1 |
| `CLOUDINARY_URL` | la chaîne Cloudinary de l'étape 2 |
| `ALLOWED_HOSTS` | `montror-api.onrender.com` |
| `CORS_ALLOWED_ORIGINS` | `https://montror.missdiana944.workers.dev` *(voir étape 4)* |
| `CSRF_TRUSTED_ORIGINS` | idem |
| `EMAIL_HOST_USER` | votre adresse Gmail |
| `EMAIL_HOST_PASSWORD` | le **mot de passe d'application** Google |
| `DEFAULT_FROM_EMAIL` | la même adresse Gmail |

`SECRET_KEY` est générée par Render. Ne la choisissez pas vous-même.

### Créer votre compte administrateur

Une fois le service en ligne, onglet **Shell** dans Render :

```bash
python manage.py createsuperuser
```

L'admin sera sur `https://montror-api.onrender.com/admin/`.

---

## 4. Le site — Cloudflare

Le site n'est pas un simple dossier de fichiers : il fait du rendu côté
serveur. Il tourne donc dans un **Worker**, pas sur un hébergement statique.

1. Compte sur **cloudflare.com**
2. Depuis votre ordinateur :

```bash
cd frontend
echo "VITE_API_URL=https://montror-api.onrender.com/api" > .env
npm run deploy
```

Wrangler ouvre votre navigateur pour l'autorisation, puis publie sur
`https://montror.missdiana944.workers.dev`.

3. **Retournez sur Render** et corrigez `CORS_ALLOWED_ORIGINS` et
   `CSRF_TRUSTED_ORIGINS` avec cette URL exacte. Sans ça, le navigateur
   bloquera tous les appels à l'API et le site restera vide.

---

## 5. Empêcher l'API de s'endormir

L'offre gratuite de Render met le service en veille après 15 minutes sans
visite. Le client suivant attend environ 50 secondes — il sera parti avant.

1. Compte sur **uptimerobot.com**
2. **Add New Monitor** → type **HTTP(s)**
3. URL : `https://montror-api.onrender.com/api/`
4. Intervalle : **10 minutes**

744 heures pour un mois complet, 750 offertes par Render. Ça passe, sans marge.

---

## Vérifier que tout marche

Dans cet ordre, chaque test valide un maillon :

1. `https://montror-api.onrender.com/api/produits/` renvoie du JSON → la base répond
2. Une photo s'affiche dans le catalogue → Cloudinary répond
3. Une commande de test passe → l'écriture en base fonctionne
4. « Mot de passe oublié » envoie un e-mail → le SMTP répond

---

## Quand ça deviendra sérieux

Dès les premières vraies commandes, **passez l'API à 7 $/mois** (Render
Starter). La mise en veille disparaît, et vous cessez de perdre des clients
sans jamais savoir pourquoi.

Plus tard, un VPS à 3 000 F/mois (Hetzner) réunirait tout sur une machine.
Wave et Orange Money proposent désormais des cartes virtuelles Visa qui
permettent de payer ce genre de service.
