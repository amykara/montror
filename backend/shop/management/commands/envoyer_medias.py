"""
Transfère vers Cloudinary les photos et vidéos encore stockées localement.

À lancer **une fois**, au moment de la mise en ligne. Sans ça, les 100 et
quelques visuels déjà en base resteraient sur le disque du poste de
développement : en production, chaque fiche produit s'afficherait sans image.

    CLOUDINARY_URL="cloudinary://..." python manage.py envoyer_medias

La commande est rejouable : un fichier déjà envoyé est reconnu à son nom et
ignoré. On peut donc la relancer après une coupure sans rien dupliquer.
"""

import time
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from shop.models import ProductImage, ProductVideo

#: Dossier d'origine des fichiers, tel que le remplit `upload_to` dans les
#: modeles. Un nom qui commence encore par la est reste sur le disque.
PREFIXE_LOCAL = "produits/"

#: Delai avant chaque nouvelle tentative, en secondes. `None` = on
#: abandonne ce fichier et on passe au suivant. Ces valeurs triplent
#: quand Cloudinary repond explicitement qu il est sature.
ATTENTES = (5, 15, 40, None)

#: Pause entre deux videos. Le re-encodage cote Cloudinary est limite
#: sur l offre gratuite : les enchainer sans respirer fait echouer la
#: moitie du lot.
PAUSE_ENTRE_VIDEOS = 8


class Command(BaseCommand):
    help = "Envoie vers Cloudinary les médias encore présents sur le disque local."

    def add_arguments(self, parser):
        parser.add_argument(
            "--simulation",
            action="store_true",
            help="Affiche ce qui serait envoyé, sans rien transférer.",
        )

    def handle(self, *args, **options):
        if not settings.CLOUDINARY_URL:
            raise CommandError(
                "CLOUDINARY_URL n'est pas renseigné : il n'y a nulle part où "
                "envoyer les fichiers. Ajoutez-le dans .env."
            )

        simulation = options["simulation"]
        total_envoyes = total_absents = total_deja = total_echecs = 0
        echecs = []

        for modele, champ, libelle in (
            (ProductImage, "image", "photo"),
            (ProductVideo, "video", "vidéo"),
        ):
            for objet in modele.objects.select_related("produit").all():
                fichier = getattr(objet, champ)
                nom = fichier.name or ""

                if not nom:
                    continue

                chemin = Path(settings.MEDIA_ROOT) / nom
                if not chemin.exists():
                    # Déjà transféré, ou fichier perdu. La distinction se fait
                    # sur le nom, **sans appeler le réseau** : interroger
                    # Cloudinary un fichier à la fois rendait chaque relance
                    # interminable, avec plus de cent allers-retours avant même
                    # d'atteindre le travail restant.
                    #
                    # Un chemin encore local commence par le dossier d'origine
                    # (« produits/ ») ; une fois chez Cloudinary, il porte le
                    # préfixe du stockage distant.
                    if nom.startswith(PREFIXE_LOCAL):
                        total_absents += 1
                        self.stderr.write(
                            f"  introuvable : {objet.produit.reference} — {nom}"
                        )
                    else:
                        total_deja += 1
                    continue

                if simulation:
                    total_envoyes += 1
                    self.stdout.write(f"  à envoyer : {objet.produit.reference} — {nom}")
                    continue

                # Plusieurs tentatives espacées : un refus de Cloudinary est
                # rarement définitif. Les vidéos, surtout, passent par une file
                # de ré-encodage dont l'offre gratuite limite la capacité — le
                # service répond alors « Slow Down » et il suffit d'attendre.
                for tentative, attente in enumerate(ATTENTES, start=1):
                    try:
                        with chemin.open("rb") as brut:
                            # `save=True` réécrit le chemin renvoyé par
                            # Cloudinary dans la base : c'est lui que le site
                            # servira ensuite.
                            fichier.save(Path(nom).name, File(brut), save=True)
                        total_envoyes += 1
                        self.stdout.write(
                            f"  {libelle} envoyée : {objet.produit.reference} — {Path(nom).name}"
                        )
                        break
                    except Exception as err:  # noqa: BLE001 — dépend du service distant
                        saturation = "slow down" in str(err).lower()
                        if attente is not None:
                            delai = attente * (3 if saturation else 1)
                            self.stdout.write(
                                f"    tentative {tentative} refusée"
                                f"{' (service saturé)' if saturation else ''}, "
                                f"nouvel essai dans {delai} s…"
                            )
                            time.sleep(delai)
                            continue
                        # On note et on continue : un fichier refusé ne doit
                        # pas faire perdre le travail déjà accompli.
                        total_echecs += 1
                        echecs.append((objet.produit.reference, Path(nom).name, str(err)[:90]))
                        self.stderr.write(
                            f"  REFUSÉ : {objet.produit.reference} — {Path(nom).name} "
                            f"({str(err)[:60]})"
                        )

                # Respiration entre deux vidéos : les enchaîner sans pause est
                # précisément ce qui sature la file d'attente.
                if champ == "video":
                    time.sleep(PAUSE_ENTRE_VIDEOS)

        self.stdout.write("")
        verbe = "à envoyer" if simulation else "envoyés"
        self.stdout.write(self.style.SUCCESS(f"{total_envoyes} fichier(s) {verbe}."))
        if total_deja:
            self.stdout.write(f"{total_deja} déjà en ligne, ignoré(s).")
        if total_absents:
            self.stdout.write(
                self.style.WARNING(
                    f"{total_absents} fichier(s) introuvables : leur fiche "
                    "s'affichera sans visuel."
                )
            )
        if total_echecs:
            self.stdout.write(
                self.style.ERROR(f"{total_echecs} fichier(s) refusés par Cloudinary :")
            )
            for reference, nom, motif in echecs:
                self.stdout.write(f"  {reference} — {nom} : {motif}")
            self.stdout.write(
                "Relancez la commande : les fichiers déjà en ligne sont ignorés, "
                "seuls ceux-ci seront retentés."
            )
