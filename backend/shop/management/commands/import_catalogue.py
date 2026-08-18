"""
Importe le catalogue réel depuis produits_montres_import.json.

    python manage.py import_catalogue --json <chemin> [--images <dossier> ...]
    python manage.py import_catalogue --json <chemin> --dry-run

Relançable sans risque : les produits sont appariés par `reference`, et les
photos ne sont attachées qu'aux produits qui n'en ont pas encore.
"""
import json
import re
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils.text import slugify

from shop.models import Category, Product, ProductImage, ProductVideo

EXTENSIONS_IMAGE = {".jpg", ".jpeg", ".png", ".jfif", ".webp"}
EXTENSIONS_VIDEO = {".mp4", ".mov", ".webm"}

# Le JSON décrit des matières de bracelet plus fines que les choix du modèle.
BRACELET_MAP = {
    "acier": "acier",
    "cuir": "cuir",
    "silicone": "silicone",
    "velcro": "velcro",
    "velcro/silicone": "velcro",
    "silicone/cuir": "silicone",
    "": "",
}

# Produits que le catalogage a explicitement marqués « ne jamais publier tel quel ».
# Ils sont importés mais laissés hors ligne (publie=False) : à toi de trancher.
NE_PAS_PUBLIER = {
    "MO-085",  # logo Apple visible à l'écran de la montre
}

# Le JSON de catalogage garde des marques déposées dans les noms « neutres »
# (« Speedmaster-Style »), alors que ses propres consignes les interdisent en
# ligne. On les retire à l'import, sinon un ré-import les ferait revenir.
MARQUES_A_RETIRER = [
    ("Speedmaster-Style", "Tachymètre"),
    ("Speedmaster", "Tachymètre"),
    ("Omega x Swatch", "bicéramique"),
    ("MoonSwatch", "bicéramique"),
    ("Omega", ""),
    ("Toro Rosso", ""),
]


# Visuels retouchés / regénérés par la cliente (dossier « retoucher »). Le JSON
# de catalogage ne les référence pas : il ne cite que les photos WhatsApp
# d'origine. Cette table les rattache et les place EN PREMIER sur la fiche.
# Identification faite visuellement, image par image.
PHOTOS_PRO = {
    "MO-079": [  # Dansi noir, ligne rouge
        "Gemini_Generated_Image_68vrx068vrx068vr.png",
        "Gemini_Generated_Image_p2upi7p2upi7p2up.png",
    ],
    "MO-080": [  # AMIEBR chronographe
        "Gemini_Generated_Image_rldaezrldaezrlda.png",
        "Gemini_Generated_Image_rldaezrldaezrlda2.png",
    ],
    "MO-081": ["Gemini_Generated_Image_7extfh7extfh7ext.png"],          # CASILUO blanche
    "MO-084": ["Gemini_Generated_Image_y6koz2y6koz2y6ko.png"],          # MKEL/MKEI bordeaux
    "MO-085": [  # Touch Watch (non publié) — le 2e est un rendu studio malgré son nom WhatsApp
        "Gemini_Generated_Image_hzxqmyhzxqmyhzxq.png",
        "WhatsApp Image 2026-08-07 at 23.41.31 (1).jpeg",
    ],
    "MO-086": ["ChatGPT Image 8 août 2026, 01_13_58.png"],              # CASIO digitale blanche
    "MO-087": [  # CASIO digitale duo : la noire puis la rouge effet bois
        "ChatGPT Image 8 août 2026, 01_15_30.png",
        "ChatGPT Image 8 août 2026, 01_11_40.png",
    ],
    "MO-088": ["ChatGPT Image 8 août 2026, 01_09_36.png"],              # CASIO carré bleu
}


# Photos réelles absentes du JSON (elles traînaient hors des dossiers de lot).
# Elles viennent APRÈS les visuels pro : elles montrent la pièce telle quelle,
# sur son carton de présentation. Ce carton liste les fonctions (chrono au
# 1/100, alarme, étanchéité, type de pile) — ce n'est pas un bon de garantie,
# et rien sur le site n'en promet une.
PHOTOS_REELLES_EN_PLUS = {
    "MO-086": ["WhatsApp Image 2026-08-07 at 23.40.23.jpeg"],       # blanche, carte IPG ALLOY CASE
    "MO-087": [
        "WhatsApp Image 2026-08-07 at 23.40.23 (1).jpeg",           # effet bois rouge (Limited Edition)
        "WhatsApp Image 2026-08-07 at 23.40.22 (1).jpeg",           # effet bois brun — 3e coloris ?
    ],
    "MO-088": ["WhatsApp Image 2026-08-07 at 23.40.22 (2).jpeg"],   # carré bleu, carte CASIO
}


# Corrections apportées après relecture du catalogue par la cliente. Elles
# écrasent le JSON, sinon chaque ré-import les annulerait.
CORRECTIONS = {
    # Les CASIO digitales sont vendues 3 000 F, pas 5 000 comme le supposait
    # la grille appliquée au catalogage.
    "MO-086": {"prix_vente_fcfa": 3000},
    "MO-087": {"prix_vente_fcfa": 3000},
    "MO-089": {"prix_vente_fcfa": 3000},
    "MO-090": {"prix_vente_fcfa": 3000},
    "MO-088": {
        # Même grille tarifaire que le carré galbé : 4 000 de gros → 8 000.
        "prix_achat_fcfa": 4000,
        "prix_vente_fcfa": 8000,
        # Deux formats coexistent : ce carré-ci est le petit (femme/mixte),
        # le grand galbé est le MO-058 à MO-062 (homme).
        "nom": "CASIO Analogique Carré Bleu (petit format)",
        "description": (
            "Montre analogique petit format, boîtier carré aux angles arrondis, "
            "cadran bleu effet soleil, guichet dateur, bracelet acier argenté. "
            "Format compact, portée femme ou mixte."
        ),
    },
}

# Photos que le JSON attribue au mauvais produit.
PHOTOS_A_IGNORER = {
    # Le grand carré galbé (homme) : il appartient au MO-061, pas au MO-088.
    "MO-088": ["686a4fe3749e68.263367131751797731.jpg"],
    # Doublon du carré bleu, déjà vendu sous sa propre référence.
    "MO-090": ["images.jfif"],
}

PHOTOS_REPRISES = {
    "MO-061": ["686a4fe3749e68.263367131751797731.jpg"],
}


def refs(debut, fin):
    """« MO-018 » → « MO-026 » donne l'ensemble des références intermédiaires."""
    a, b = int(debut.split("-")[1]), int(fin.split("-")[1])
    return {f"MO-{n:03d}" for n in range(a, b + 1)}


# Fonctions et conditionnement, par famille de modèles.
#
# ⚠️ N'y figure QUE ce qui se lit sur les photos : disposition du cadran,
# guichets, sous-cadrans, mentions imprimées, contenu du coffret. Volontairement
# absents : étanchéité en ATM, marque du mouvement (Miyota…), type de verre
# (saphir, Hardlex), céramique, titane. Ces informations existent pour les
# vraies montres des marques copiées, pas pour ces pièces-ci : les afficher
# serait une allégation invérifiable envers le client.
FONCTIONS_PAR_FAMILLE = [
    ({"MO-003", "MO-004"}, [
        "Écran LCD rétroéclairé",
        "Podomètre 3D : pas, distance, calories",
        "Double fuseau horaire",
        "Chronomètre et alarme",
        "Calendrier jour et date",
    ], ""),
    ({"MO-001", "MO-005", "MO-006"}, [
        "Affichage 3 aiguilles",
        "Index sertis de strass",
        "Lunette octogonale sertie",
    ], ""),
    ({"MO-010", "MO-011", "MO-012"}, [
        "Chiffres romains dorés",
        "Guichet dateur à 6h",
        "Affichage 3 aiguilles",
    ], ""),
    ({"MO-002"}, [
        "Chiffres romains à XII et VI",
        "Guichet dateur à 3h",
        "Sous-cadran des secondes",
    ], ""),
    ({"MO-014", "MO-015", "MO-016"}, [
        "Boîtier octogonal à finition sablée",
        "Cadran strié, index dorés",
        "Mention « Water Resistant Quartz » au cadran",
    ], ""),
    ({"MO-007", "MO-008"}, [
        "Double guichet : jour et date",
        "Index bâtons fins",
    ], ""),
    ({"MO-009"}, [
        "Cadran soleil texturé",
        "Guichet dateur à 6h, jour à 3h",
        "Index sertis à 12h et 9h",
    ], ""),
    ({"MO-013"}, [
        "Guichet du jour en arc à 12h",
        "Guichet dateur à 6h",
        "Index sertis de strass",
    ], ""),
    ({"MO-017", "MO-094"}, [
        "Boîtier rectangulaire galbé",
        "Cadran strié à guilloché central",
        "Chiffres arabes à 12, 3, 6 et 9",
        "Guichet dateur à 4h30",
    ], ""),
    (refs("MO-018", "MO-026") | {"MO-074"}, [
        "Chronographe à 3 sous-cadrans",
        "Guichet dateur à 4h30",
        "Deux boutons-poussoirs encadrant la couronne",
    ], "Coffret rigide finition bois avec coussinet"),
    (refs("MO-028", "MO-044"), [
        "Chronographe à 2 sous-cadrans",
        "Guichet dateur à 6h",
        "Lunette tachymétrique",
        "Bracelet cuir à surpiqûres contrastées",
    ], "Coffret rigide finition bois et pochette de rangement"),
    (refs("MO-047", "MO-056"), [
        "Chronographe multi-compteurs",
        "Boîtier acier",
    ], ""),
    ({"MO-057", "MO-091"}, [
        "Cadran effet soleil",
        "Mention « Water Resistant Quartz » au cadran",
    ], ""),
    (refs("MO-058", "MO-062"), [
        "Boîtier carré galbé façon vintage",
        "Cadran effet soleil",
        "Guichet dateur à 3h",
    ], ""),
    ({"MO-063", "MO-096"}, [
        "Affichage numérique « Alarm Chrono »",
        "Heure, jour, date et alarme",
    ], ""),
    ({"MO-064"}, [
        "Chronographe à sous-cadrans",
        "Lunette graduée",
    ], ""),
    (refs("MO-065", "MO-073"), [
        "Chronographe à sous-cadrans",
        "Lunette tachymétrique assortie au boîtier",
        "Bracelet velcro",
    ], "Boîte de présentation bicéramique"),
    (refs("MO-075", "MO-078"), [
        "Double affichage analogique et numérique",
        "Chronomètre, alarme et rétroéclairage",
        "Double fuseau horaire",
    ], ""),
    ({"MO-079"}, [
        "Affichage 3 aiguilles, index dorés",
        "Bracelet silicone à ligne centrale rouge",
    ], ""),
    ({"MO-080"}, [
        "Chronographe à sous-cadrans",
        "Guichet dateur",
        "Bracelet cuir à surpiqûres blanches",
    ], ""),
    ({"MO-081"}, [
        "Affichage numérique rond",
        "Chronomètre, alarme et rétroéclairage",
        "Mention « 3 BAR » au cadran",
    ], ""),
    ({"MO-082", "MO-083"}, [
        "Chiffres romains",
        "Sous-cadrans décoratifs",
    ], ""),
    ({"MO-084"}, [
        "Chronographe à sous-cadrans",
        "Chiffres romains",
        "Échelle de dates en périphérie",
    ], ""),
    ({"MO-085"}, ["Écran tactile numérique"], ""),
    ({"MO-086", "MO-087", "MO-090"}, [
        "Affichage numérique LED",
        "Chronomètre au 1/100e",
        "Format 12/24h et calendrier automatique",
        "Mentions « IPG » et « WR » sur la carte d'origine",
    ], "Carte de présentation d'origine"),
    ({"MO-088"}, [
        "Boîtier carré aux angles arrondis",
        "Cadran effet soleil",
        "Guichet dateur à 3h",
        "Carte d'origine mentionnant l'éclairage LED/EL et la pile CR2025/CR2032",
    ], "Carte de présentation d'origine"),
    ({"MO-089"}, [
        "Affichage numérique LED",
        "Boîtier et bracelet acier finition dorée",
    ], ""),
    ({"MO-092", "MO-097"}, [
        "Lunette tournante graduée",
        "Index ronds lumineux",
    ], ""),
    ({"MO-093"}, [
        "Cadran texturé quadrillé",
        "Lunette octogonale",
        "Boîtier intégré au bracelet",
    ], ""),
    ({"MO-095"}, [
        "Cadran dégradé",
        "Aiguille des secondes fluorescente",
    ], ""),
    ({"MO-098"}, ["Guichet dateur", "Finition bicolore or et argent"], ""),
    ({"MO-099"}, [
        "Cadran strié horizontalement",
        "Sous-cadran type réserve de marche",
    ], ""),
    ({"MO-045"}, [
        "Guichet jour et date à 3h",
        "Index bâtons dorés",
    ], ""),
    ({"MO-046"}, [
        "Index minimalistes à points lumineux",
        "Bracelet maillons acier revêtu",
    ], ""),
]


def fonctions_du_produit(reference):
    """Renvoie (fonctions, livré avec) pour une référence, ou ('', '')."""
    for references, fonctions, coffret in FONCTIONS_PAR_FAMILLE:
        if reference in references:
            return "\n".join(fonctions), coffret
    return "", ""


def nettoyer_marques(texte):
    """Retire les marques déposées d'un texte destiné au site public."""
    for terme, remplacement in MARQUES_A_RETIRER:
        texte = re.sub(re.escape(terme), remplacement, texte, flags=re.IGNORECASE)
    return re.sub(r"\s{2,}", " ", texte).replace(" )", ")").strip(" -")


class Command(BaseCommand):
    help = "Importe le catalogue de montres depuis le JSON de catalogage."

    def add_arguments(self, parser):
        parser.add_argument("--json", required=True, help="Chemin du fichier produits_montres_import.json")
        parser.add_argument(
            "--images", nargs="*", default=[],
            help="Dossiers contenant les photos (parcourus récursivement)",
        )
        parser.add_argument("--stock", type=int, default=0, help="Stock initial appliqué aux nouveaux produits")
        parser.add_argument(
            "--refaire-images", action="store_true",
            help="Détache puis rattache toutes les photos (à utiliser après avoir ajouté des visuels retouchés)",
        )
        parser.add_argument("--dry-run", action="store_true", help="Simule l'import sans rien écrire")

    def handle(self, *args, **options):
        chemin = Path(options["json"])
        if not chemin.exists():
            raise CommandError(f"Fichier introuvable : {chemin}")

        donnees = json.loads(chemin.read_text(encoding="utf-8"))
        self.refaire_images = options["refaire_images"]
        self.videos = []
        self.images = self._indexer_images(options["images"])
        self.stdout.write(
            f"{len(donnees)} produits dans le JSON, "
            f"{len(self.images)} images et {len(self.videos)} videos indexees."
        )

        if options["dry_run"]:
            self._simuler(donnees)
            return

        with transaction.atomic():
            crees, maj, photos, videos = self._importer(donnees, options["stock"])

        self.stdout.write(self.style.SUCCESS(
            f"Import termine : {crees} crees, {maj} mis a jour, "
            f"{photos} photos et {videos} videos attachees. "
            f"Total en base : {Product.objects.count()} produits."
        ))
        caches = Product.objects.filter(publie=False).count()
        if caches:
            self.stdout.write(self.style.WARNING(
                f"{caches} produit(s) importe(s) mais NON publie(s) : a valider dans l'admin."
            ))
        sans_prix = Product.objects.filter(prix_vente_fcfa__isnull=True).count()
        if sans_prix:
            self.stdout.write(
                f"{sans_prix} produit(s) sans prix : le site affichera « Nous contacter »."
            )

    # ------------------------------------------------------------------ #

    def _indexer_images(self, dossiers):
        images, videos = [], []
        for d in dossiers:
            racine = Path(d)
            if not racine.exists():
                self.stdout.write(self.style.WARNING(f"Dossier introuvable, ignore : {racine}"))
                continue
            for f in racine.rglob("*"):
                if not f.is_file():
                    continue
                if f.suffix.lower() in EXTENSIONS_IMAGE:
                    images.append(f)
                elif f.suffix.lower() in EXTENSIONS_VIDEO:
                    videos.append(f)
        self.videos = videos
        return images

    @staticmethod
    def _signature(nom):
        """Signature WhatsApp d'un fichier : (horodatage, index de doublon).

        « WhatsApp Video 11.53.19.mp4 (3,6s) » et
        « WhatsApp Video 2026-08-04 at 11.53.19.mp4 » donnent tous deux
        ('11.53.19', None) ; « ...23_42_55__2_.mp4 » et « ...23.42.55 (2).mp4 »
        donnent ('23.42.55', '2').
        """
        base = re.sub(r"\(\s*[\d,]+\s*s\s*\)", "", nom)  # retire « (3,6s) »
        uniforme = base.replace("_", ".").replace(" ", ".")
        heures = re.findall(r"\d{2}\.\d{2}\.\d{2}", uniforme)
        if not heures:
            return None
        index = re.search(r"\((\d+)\)|\.\.(\d+)\.(?:mp4|mov|webm)", uniforme, re.IGNORECASE)
        return heures[-1], (index.group(1) or index.group(2)) if index else None

    @staticmethod
    def _normaliser(nom):
        """Rend comparables « WhatsApp_Video_2026-08-07_at_23_42_54.mp4 » (JSON)
        et « WhatsApp Video 2026-08-07 at 23.42.54.mp4 » (fichier réel), ainsi
        que « __1_.mp4 » et « (1).mp4 »."""
        n = nom.strip().lower()
        for c in ("_", " ", ".", "-", "(", ")"):
            n = n.replace(c, "")
        return n

    def _chercher(self, nom, fichiers):
        """Égalité, puis suffixe, puis comparaison normalisée (suffixe aussi)."""
        cible = nom.strip().lower()
        if not cible:
            return None
        for f in fichiers:
            if f.name.lower() == cible:
                return f
        for f in fichiers:
            if f.name.lower().endswith(cible):
                return f
        cible_n = self._normaliser(cible)
        if len(cible_n) >= 6:  # trop court pour discriminer (« 1mp4 »…)
            for f in fichiers:
                if self._normaliser(f.name).endswith(cible_n):
                    return f

        # Dernier recours : même horodatage WhatsApp et même index de doublon.
        signature = self._signature(nom)
        if signature:
            for f in fichiers:
                if self._signature(f.name) == signature:
                    return f
        return None

    @staticmethod
    def _noms_sources(produit_json):
        return [n.strip() for n in produit_json["fichier_image_source"].split("+") if n.strip()]

    def _fichiers_du_produit(self, produit_json, fichiers, extensions):
        """Un même champ liste photos et vidéos ; on ne garde que l'un ou l'autre.
        Les suites du type « ... 23_42_55.mp4 + __1_.mp4 » sont recollées : le
        second nom est un suffixe du premier."""
        noms = self._noms_sources(produit_json)
        # L'extension n'est pas toujours en fin de nom : « ....mp4 (3,6s) ».
        candidats = [n for n in noms if any(e in n.lower() for e in extensions)]

        trouves, vus, precedent = [], set(), None
        for n in candidats:
            f = self._chercher(n, fichiers)
            if f is None and precedent and n.startswith("__"):
                # « __1_.mp4 » seul : on le recolle au nom précédent.
                base = precedent.rsplit(".", 1)[0]
                f = self._chercher(base + n, fichiers)
            if f and f not in vus:
                vus.add(f)
                trouves.append(f)
            precedent = n
        return trouves

    def _lister(self, reference, noms, etiquette):
        trouves = []
        for nom in noms:
            fichier = self._chercher(nom, self.images)
            if fichier is None:
                self.stdout.write(self.style.WARNING(
                    f"{reference} : {etiquette} introuvable ({nom})"
                ))
            else:
                trouves.append(fichier)
        return trouves

    def _images_du_produit(self, produit_json):
        """Ordre d'affichage : visuel pro (il vend), puis photo réelle du
        produit avec sa carte, puis le reste des clichés du lot."""
        ref = produit_json["reference"]
        pro = self._lister(ref, PHOTOS_PRO.get(ref, []), "visuel pro")
        reelles = self._lister(ref, PHOTOS_REELLES_EN_PLUS.get(ref, []), "photo réelle")
        reprises = self._lister(ref, PHOTOS_REPRISES.get(ref, []), "photo reprise")
        brutes = self._fichiers_du_produit(produit_json, self.images, EXTENSIONS_IMAGE)

        # Photos que le catalogage a rattachées au mauvais modèle.
        a_ignorer = {n.lower() for n in PHOTOS_A_IGNORER.get(ref, [])}

        ordonnees, vues = [], set()
        for f in pro + reelles + brutes + reprises:
            if f in vues or f.name.lower() in a_ignorer:
                continue
            vues.add(f)
            ordonnees.append(f)
        return ordonnees

    def _videos_du_produit(self, produit_json):
        return self._fichiers_du_produit(produit_json, self.videos, EXTENSIONS_VIDEO)

    def _simuler(self, donnees):
        existantes = set(Product.objects.values_list("reference", flat=True))
        crees = sum(1 for p in donnees if p["reference"] not in existantes)
        avec_photo = sum(1 for p in donnees if self._images_du_produit(p))
        avec_video = sum(1 for p in donnees if self._videos_du_produit(p))
        self.stdout.write(
            f"[simulation] {crees} creations, {len(donnees) - crees} mises a jour, "
            f"{avec_photo} produits avec au moins une photo, "
            f"{avec_video} avec au moins une video, "
            f"{sum(1 for p in donnees if p['prix_vente_fcfa'] is None)} sans prix, "
            f"{sum(1 for p in donnees if p['reference'] in NE_PAS_PUBLIER)} non publie(s)."
        )
        categories = sorted({p["categorie"] for p in donnees})
        self.stdout.write("Categories attendues : " + ", ".join(categories))

    def _importer(self, donnees, stock_initial):
        cat_par_nom = {}
        for nom in sorted({p["categorie"] for p in donnees}):
            cat, _ = Category.objects.get_or_create(name=nom)
            cat_par_nom[nom] = cat

        crees = maj = photos = videos = 0
        for p in donnees:
            bracelet = BRACELET_MAP.get((p["bracelet"] or "").strip().lower(), "")
            nom_public = nettoyer_marques(p["nom"])[:150]
            fonctions, livre_avec = fonctions_du_produit(p["reference"])
            champs = dict(
                nom=nom_public,
                marque=nettoyer_marques(p["marque"])[:80],
                style=p["style"] if p["style"] in dict(Product.STYLE_CHOICES) else "",
                categorie=cat_par_nom[p["categorie"]],
                description=nettoyer_marques(p["description"]),
                prix_achat_fcfa=p["prix_achat_fcfa"],
                prix_vente_fcfa=p["prix_vente_fcfa"],
                couleur=p["couleur"][:50],
                bracelet=bracelet,
                mouvement=p["mouvement"] if p["mouvement"] in dict(Product.MOUVEMENT_CHOICES) else "",
                etanche=bool(p["etanche"]),
                diametre=p["diametre"][:20],
                matiere=p["matiere"][:100],
                # Volontairement vide : le fournisseur n'accorde aucune
                # garantie, la boutique ne peut donc pas en promettre une. Le
                # champ existe toujours dans l'admin pour le jour où ça
                # changera, mais un ré-import ne doit rien réintroduire.
                garantie="",
                fonctions=fonctions,
                livre_avec=livre_avec,
                negociable=bool(p["badge_negociation"]),
                disponible=bool(p["disponible"]),
                publie=p["reference"] not in NE_PAS_PUBLIER,
                note_interne=p["remarque_interne"],
            )

            champs.update(CORRECTIONS.get(p["reference"], {}))
            nom_public = champs["nom"]

            produit = Product.objects.filter(reference=p["reference"]).first()
            if produit is None:
                produit = Product.objects.create(
                    reference=p["reference"], stock=stock_initial, **champs
                )
                crees += 1
            else:
                for k, v in champs.items():
                    setattr(produit, k, v)
                # Le slug est dérivé du nom : s'il a été nettoyé d'une marque
                # déposée, l'URL doit suivre.
                attendu = slugify(f"{nom_public}-{produit.reference}")
                if produit.slug != attendu:
                    produit.slug = attendu
                produit.save()
                maj += 1

            if self.refaire_images:
                produit.images.all().delete()
            if not produit.images.exists():
                for i, source in enumerate(self._images_du_produit(p)):
                    with open(source, "rb") as fichier:
                        img = ProductImage(produit=produit, principale=(i == 0), ordre=i)
                        nom = source.name.replace(" ", "-")
                        img.image.save(f"{p['reference']}-{nom}", File(fichier), save=True)
                        photos += 1

            if not produit.videos.exists():
                for i, source in enumerate(self._videos_du_produit(p)):
                    with open(source, "rb") as fichier:
                        # Une pièce sans photo s'appuie sur sa vidéo : on la met
                        # en avant dans la vitrine animée de l'accueil.
                        vid = ProductVideo(
                            produit=produit,
                            ordre=i,
                            mise_en_avant=(i == 0 and not produit.images.exists()),
                        )
                        nom = source.name.replace(" ", "-")
                        vid.video.save(f"{p['reference']}-{nom}", File(fichier), save=True)
                        videos += 1

        return crees, maj, photos, videos
