# MONTR'OR — boutique de montres

Frontend TanStack Start + React + Tailwind (template Lovable), branché sur un
backend Django/DRF qui est la **source de vérité** : catalogue, photos, stocks,
zones de livraison, commandes, avis, FAQ, coordonnées et messages de contact.
Rien d'affiché sur le site n'est écrit en dur — tout se pilote depuis l'admin.

## Démarrer

### Backend (Django + DRF)
```
cd backend
python -m venv venv
venv\Scripts\activate          # Windows  (source venv/bin/activate sur Linux/Mac)
pip install -r requirements.txt
copy .env.example .env         # cp sur Linux/Mac
python manage.py migrate
python manage.py loaddata reglages  # zones, avis, FAQ, coordonnées (si fixture)
python manage.py createsuperuser
python manage.py runserver
```
- API : http://127.0.0.1:8000/api/produits/
- Admin : http://127.0.0.1:8000/admin/

> Python 3.12 ou 3.13.

### Frontend
```
cd frontend
npm install
npm run dev
```
Site : http://localhost:8080 (vite bascule sur 8081 si le port est pris).
L'API est lue sur `VITE_API_URL` — voir `frontend/.env.example`.

## Importer un catalogue (JSON de catalogage)

```
python manage.py import_catalogue --json produits_montres_import.json \
    --images ../les_montres ../retoucher ../lot2_whatsapp \
             ../videos_montres ../photos_casio \
    --stock 5
```
- `--dry-run` simule sans rien écrire.
- Relançable : les produits sont appariés par `reference`, les photos ne sont
  attachées qu'aux produits qui n'en ont pas encore.
- Les noms d'images du JSON sont tronqués (`00.49.31.jpeg`) alors que les
  fichiers gardent le préfixe WhatsApp complet : l'appariement se fait par
  suffixe.
- Un produit sans `prix_vente_fcfa` reste visible mais affiche « Prix sur
  demande » et un bouton WhatsApp au lieu du bouton d'achat.
- `badge_negociation` alimente le champ `negociable` → bouton « Négocier avec
  notre équipe » sur la fiche produit.
- `remarque_interne` est copié dans `note_interne` : visible seulement dans
  l'admin, jamais sur le site. Une note contenant « ATTENTION » ressort en
  rouge dans la liste des produits.
- Les marques déposées listées dans `MARQUES_A_RETIRER` (Omega, Swatch,
  Speedmaster, Toro Rosso…) sont retirées des noms, descriptions et URL à
  chaque import — sinon un ré-import les ferait revenir.

## Descriptions et caractéristiques

Deux champs alimentent la fiche produit au-delà de la description :
- `fonctions` — une par ligne, affichées en liste à puces sous « Ce que fait
  cette montre » ;
- `livre_avec` — le conditionnement (coffret, carte d'origine…).

Ils sont pré-remplis par famille de modèles via `FONCTIONS_PAR_FAMILLE`
(import_catalogue.py). **Une caractéristique laissée vide n'apparaît pas** sur
le site : plus de tableau rempli de tirets.

⚠️ Règle à tenir : n'y mettre que ce qui se **lit sur la photo** (guichets,
sous-cadrans, mentions imprimées, contenu du coffret). Sont volontairement
exclus l'étanchéité en ATM, la marque du mouvement (Miyota…), le type de verre
(saphir, Hardlex), la céramique et le titane. Ces caractéristiques existent
pour les montres authentiques des marques copiées, pas nécessairement pour ces
pièces : les afficher serait une allégation invérifiable envers l'acheteur.

## Visuels retouchés

Le dossier `retoucher/` contient des visuels regénérés (ChatGPT / Gemini) que
le JSON de catalogage **ne référence pas** : il ne cite que les photos WhatsApp
d'origine. La table `PHOTOS_PRO` de `import_catalogue.py` fait le lien,
identifié image par image, et place ces visuels **en première position** sur la
fiche produit. Pour les rattacher après coup :

```
python manage.py import_catalogue --json ... --images ... --refaire-images
```

Deux tables gouvernent l'ordre d'affichage :
- `PHOTOS_PRO` — le visuel retouché, en première position (c'est lui qui vend) ;
- `PHOTOS_REELLES_EN_PLUS` — la photo brute de la pièce sur son carton de
  présentation, juste derrière : elle montre ce qui sera réellement livré.
  Ce carton liste les fonctions, ce n'est pas un bon de garantie — le
  fournisseur n'en accorde aucune, et le site n'en promet aucune.

Attention aux noms trompeurs : `WhatsApp Image 2026-08-07 at 23.41.31 (1).jpeg`
est un **rendu studio**, pas une photo, malgré son nom de fichier.

⚠️ Ce sont des images **générées**, pas des photos de la pièce réelle. Elles
rendent bien mieux que les clichés WhatsApp, mais elles réinventent les
détails : le nom lu sur le cadran diffère d'un rendu à l'autre (Dansi/Danser,
AMIEBR/AMIER, MKEL/MKEI), un rendu de la MO-080 montre un cadran noir alors que
la pièce est décrite bleu marine, et le bleu de la MO-088 est plus profond sur
le rendu que sur la photo réelle (turquoise). À comparer avant de s'en servir
comme photo de vente : c'est ce qui crée les litiges à la livraison.

## Aucun produit sans visuel

Un produit publié sans photo affichait un visuel « photo à venir ». Ce cas
n'existe plus : les 11 pièces qui n'avaient qu'une vidéo ont reçu une **image
fixe extraite de cette vidéo**.

L'extraction se fait par le navigateur (`montror-extraire-frames.mjs`) : pour
chaque vidéo, plusieurs instants sont testés et le script garde la frame la
plus nette (variance du Laplacien), recadrée au carré en 1000×1000. Puis :

```
python manage.py attacher_posters --dossier ../posters_video
```

Le poster devient l'image principale. Le fichier s'appelle `<REF>-poster.jpg`.

Le visuel de repli reste dans le code pour un futur produit créé sans photo,
mais aucun produit publié ne l'utilise. **Règle : pas de visuel = pas publié.**

## Entretien du dossier media

Supprimer une image en base ne supprimait pas son fichier : chaque
`--refaire-images` laissait des doublons. C'est corrigé (`ProductImage.delete`
et `ProductVideo.delete` effacent le fichier), et pour rattraper l'existant :

```
python manage.py nettoyer_media --dry-run
python manage.py nettoyer_media
```

## Vidéos

Les vidéos produit se gèrent comme les photos, dans l'admin (bloc « Vidéos
produit » de la fiche). L'import les attache automatiquement : les `.mp4` du
JSON sont appariés par horodatage WhatsApp, ce qui absorbe les écarts de nom
(`WhatsApp_Video_..._23_42_55__2_.mp4` ↔ `WhatsApp Video ... 23.42.55 (2).mp4`).

Où elles apparaissent :
- **Fiche produit** : dans la galerie, avec vignettes. Une pièce filmée mais
  jamais photographiée ouvre directement sur sa vidéo.
- **Accueil, section « En mouvement »** : les 4 premières pièces filmées, en
  lecture automatique, muettes et en boucle.

Économie de données (le visiteur est souvent en 3G/4G) : `preload="metadata"`
ne télécharge que la première image, et un `IntersectionObserver` ne lance la
lecture qu'à l'entrée de la vignette à l'écran. Les 14 vidéos pèsent 20 Mo au
total, 0,5 à 2,5 Mo pièce.

## Modes de livraison

Deux parcours, qui ne demandent pas les mêmes informations :

| Mode | Champs exigés | Frais |
|---|---|---|
| Yango (domicile) | zone de livraison + adresse | tarif de la zone |
| Point Relais Jumia | point relais | 0 |

La cohérence est vérifiée **côté serveur** (`Order.clean()` et le serializer) :
envoyer une adresse avec un point relais, ou l'inverse, est refusé.

Les 41 points relais s'importent avec :
```
python manage.py import_points_relais --json ../files/jumia_points_relais.json
```
3 d'entre eux (Abobo Centre, Songon, Bingerville Centre) arrivent **inactifs** :
leur adresse se résume au nom de la commune, un client ne les trouverait pas.
Ils n'apparaissent pas au checkout tant qu'ils ne sont pas précisés dans l'admin.

### Géolocalisation

Le bouton à côté du champ d'adresse demande la position au navigateur, puis
interroge Nominatim (OpenStreetMap) pour proposer une adresse. Le texte reste
modifiable — à Abidjan l'adressage est informel et le résultat est souvent
approximatif. Les coordonnées sont enregistrées sur la commande même si le
texte est ensuite corrigé : c'est ce qui sert au livreur. Le débit est bridé à
une requête par seconde, conformément à la politique de Nominatim.

Si la précision déçoit à l'usage, basculer vers Google Maps Geocoding (payant)
— ne pas maintenir les deux en parallèle.

## Modes de paiement

Trois façons de régler, proposées au checkout :

| Mode | Enregistré comme | Quand |
|---|---|---|
| À la livraison | `livraison` | par défaut |
| Payé d'avance (Wave, Orange, MTN) | `immediat` | au choix du client |
| Acompte puis solde à la réception | `acompte` | proposé dès qu'un article du panier a un `acompte_pourcent` |

L'acompte se règle **par produit** dans l'admin (champ « Acompte », en %).
Mettre 50 sur les pièces chères ou sur commande. Le montant est **recalculé
par Django** à la création de la commande, jamais transmis par le navigateur :
un client ne peut pas décider de ce qu'il avance.

L'admin affiche une colonne « Reste à encaisser » sur la liste des commandes —
le livreur sait exactement quoi réclamer.

## Les éléments qui font vendre

La carte produit et la fiche affichent, **quand la donnée existe** :

| Élément affiché | Condition |
|---|---|
| Badge `−X %`, prix barré, « Économisez N FCFA » | `ancien_prix_fcfa` renseigné et supérieur au prix de vente |
| « Plus que N en stock » | `stock` entre 1 et 3 |
| Bouton « Ajouter » sur la carte | produit achetable (prix fixé, disponible, en stock) |
| « Payez à la livraison » | produit achetable |

⚠️ **Aujourd'hui aucun produit n'a d'ancien prix et tous ont un stock de 5** :
les promos et l'urgence n'apparaissent donc nulle part. Pour les activer,
renseigner « ancien prix » dans l'admin — et uniquement s'il s'agit d'un prix
réellement pratiqué avant, sinon c'est un prix de référence fictif.

Le bandeau de réassurance sous l'en-tête (délai, tarif, paiement à la
réception, WhatsApp) se remplit tout seul à partir des zones de livraison et
des réglages du site.

## Ce qui se gère depuis l'admin Django

| Dans l'admin | Effet sur le site |
|---|---|
| Produits | catalogue, prix, promos, **filtres** (catégories, marques, couleurs, bracelets) et curseur de prix, tous déduits des données réelles |
| Publié (case à cocher) | retire complètement un produit du site sans le supprimer — sert aux visuels à retoucher ou aux fiches à valider |
| Prix de vente vide | affiche « Prix sur demande » + bouton WhatsApp, et interdit la commande par le panier |
| Négociable | ajoute le bouton « Négocier avec notre équipe » (WhatsApp pré-rempli avec le produit et son prix) |
| Photos produits | galerie de la fiche ; `principale` + `ordre` définissent l'affichage. Sans photo, un visuel neutre « photo à venir » s'affiche |
| Stock / Disponible | badge « Rupture », blocage de la commande, **décrément automatique à chaque vente** |
| Zones de livraison | choix et **tarifs affichés au checkout** et dans le panier, délais annoncés sur l'accueil |
| Commandes → Statut | **progression visible par le client** sur la page Suivi |
| Avis clients | bloc « Avis clients » de l'accueil (décoche `publié` pour retirer) |
| Questions fréquentes | bloc FAQ de l'accueil |
| Réglages du site | nom, téléphone, WhatsApp, email, adresse, horaires — partout sur le site |
| Messages de contact | boîte de réception du formulaire du site |

## Garanties côté serveur

- **Prix** : jamais lus depuis le navigateur. Le client envoie des `produit_id` et
  des quantités, Django applique ses propres prix et les fige dans la commande.
- **Stock** : vérifié puis décrémenté dans une transaction avec `select_for_update`.
  Deux clients ne peuvent pas acheter la dernière pièce en même temps.
- **Frais de livraison** : figés à la commande. Changer un tarif plus tard ne
  réécrit pas les commandes passées.
- **Suivi** : `GET /api/commandes/suivi/?reference=...&telephone=...` exige les
  **deux**. Réponse identique si la référence est inconnue ou si le téléphone ne
  correspond pas — impossible de deviner les commandes des autres.
- **Anti-spam** : commandes 15/h, contact 5/h, essais de suivi 30/h par IP.
  Les lectures du catalogue ne sont pas limitées (en SSR elles viennent toutes
  de l'IP du serveur frontend).

## Endpoints

| Méthode | URL | Rôle |
|---|---|---|
| GET | `/api/produits/` `/api/produits/<slug>/` | catalogue et fiche (filtres, recherche, tri) |
| GET | `/api/categories/` `/api/zones-livraison/` | catégories, zones et tarifs |
| GET | `/api/avis/` `/api/faq/` `/api/reglages/` | contenus éditoriaux et coordonnées |
| POST | `/api/commandes/` | création de commande (renvoie la référence) |
| GET | `/api/commandes/suivi/` | suivi par référence **+** téléphone |
| POST | `/api/contact/` | message du formulaire de contact |

## Passer en production

Le pas-à-pas complet est dans **[MISE_EN_LIGNE.md](MISE_EN_LIGNE.md)** :
Neon (Postgres), Cloudinary (photos), Render (API), Cloudflare (site).

Trois variables sont obligatoires dès que `DEBUG=False`. Django refuse de
démarrer sans elles, plutôt que de tourner à moitié :

| Variable | Sans elle |
|---|---|
| `SECRET_KEY` | sessions et jetons signés avec une clé publiquement connue |
| `CLOUDINARY_URL` | photos effacées au déploiement suivant |
| `EMAIL_HOST` | codes de mot de passe écrits dans les journaux du serveur |

Vérifier avant de publier : `python manage.py check --deploy` doit être vert,
et `python tester_email.py` confirmer que le SMTP répond.

## Limites connues

- Le paiement Mobile Money reste manuel (Wave / Orange / MTN affichés au
  checkout, encaissement hors ligne). Une intégration CinetPay ou PayDunya
  reste à faire pour un paiement en ligne réel.
- Pas de notification automatique au client lors d'un changement de statut :
  le client doit consulter la page Suivi (ou être prévenu par WhatsApp).
- L'identification du client repose sur son numéro de téléphone, sans
  vérification par code. Suffisant tant que le règlement se fait à la
  livraison et qu'aucun moyen de paiement n'est conservé ; à renforcer le jour
  où le site encaissera en ligne.
- Certains visuels fournisseur demandent un arbitrage avant publication. Voir
  le champ `note_interne` de chaque produit dans l'admin.
