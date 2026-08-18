"""
Attache aux produits sans photo une image fixe extraite de leur vidéo.

Les fichiers attendus s'appellent `<REFERENCE>-poster.jpg` (ex. MO-092-poster.jpg).
Ils sont produits par le script d'extraction, qui choisit dans chaque vidéo la
frame la plus nette.

    python manage.py attacher_posters --dossier ../posters_video
    python manage.py attacher_posters --dossier ../posters_video --remplacer
"""
from pathlib import Path

from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from shop.models import Product, ProductImage


class Command(BaseCommand):
    help = "Attache les images extraites des vidéos aux produits qui n'ont pas de photo."

    def add_arguments(self, parser):
        parser.add_argument("--dossier", required=True, help="Dossier contenant les <REF>-poster.jpg")
        parser.add_argument(
            "--remplacer", action="store_true",
            help="Réattache même si le produit possède déjà un poster",
        )

    def handle(self, *args, **options):
        dossier = Path(options["dossier"])
        if not dossier.exists():
            raise CommandError(f"Dossier introuvable : {dossier}")

        posters = sorted(dossier.glob("*-poster.jpg"))
        if not posters:
            raise CommandError(f"Aucun fichier *-poster.jpg dans {dossier}")

        attaches = ignores = 0
        for chemin in posters:
            reference = chemin.name.replace("-poster.jpg", "")
            produit = Product.objects.filter(reference=reference).first()
            if produit is None:
                self.stdout.write(self.style.WARNING(f"{reference} : produit inconnu"))
                continue

            deja = produit.images.filter(image__contains="-poster").first()
            if deja and not options["remplacer"]:
                ignores += 1
                continue
            if deja:
                deja.delete()

            # Le poster passe devant : c'est la seule vue fixe de la pièce.
            produit.images.update(principale=False)
            with open(chemin, "rb") as fichier:
                img = ProductImage(produit=produit, principale=True, ordre=0)
                img.image.save(chemin.name, File(fichier), save=True)
            attaches += 1

        self.stdout.write(self.style.SUCCESS(
            f"{attaches} poster(s) attache(s), {ignores} deja en place."
        ))

        restants = Product.objects.filter(publie=True, images__isnull=True)
        if restants.exists():
            self.stdout.write(self.style.WARNING(
                "Produits publies encore sans aucun visuel : "
                + ", ".join(restants.values_list("reference", flat=True))
            ))
