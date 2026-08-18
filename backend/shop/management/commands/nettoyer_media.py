"""
Supprime les fichiers de media/ qui ne sont plus référencés en base.

Django ne supprime pas le fichier quand on supprime une ligne ProductImage ou
ProductVideo : après quelques `import_catalogue --refaire-images`, le dossier
se remplit de doublons abandonnés.

    python manage.py nettoyer_media --dry-run
    python manage.py nettoyer_media
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from shop.models import ProductImage, ProductVideo


class Command(BaseCommand):
    help = "Supprime les fichiers de media/ qui ne sont référencés par aucun produit."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Liste sans supprimer")

    def handle(self, *args, **options):
        racine = Path(settings.MEDIA_ROOT)
        if not racine.exists():
            self.stdout.write("Aucun dossier media.")
            return

        references = {Path(i.image.name).name for i in ProductImage.objects.all()}
        references |= {Path(v.video.name).name for v in ProductVideo.objects.all()}

        orphelins = [
            f for f in racine.rglob("*")
            if f.is_file() and f.name not in references
        ]
        poids = sum(f.stat().st_size for f in orphelins)

        if options["dry_run"]:
            self.stdout.write(
                f"[simulation] {len(orphelins)} fichier(s) orphelin(s), {poids / 1048576:.1f} Mo a liberer."
            )
            return

        supprimes = 0
        for f in orphelins:
            try:
                f.unlink()
                supprimes += 1
            except OSError as err:
                self.stdout.write(self.style.WARNING(f"Impossible de supprimer {f.name} : {err}"))

        self.stdout.write(self.style.SUCCESS(
            f"{supprimes} fichier(s) supprime(s), {poids / 1048576:.1f} Mo liberes."
        ))
