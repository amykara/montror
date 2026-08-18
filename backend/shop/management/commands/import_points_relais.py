"""
Importe les points relais Jumia depuis jumia_points_relais.json.

    python manage.py import_points_relais --json ../jumia_points_relais.json

Relançable : les points sont appariés par (commune, nom).
Les entrées dont l'adresse se résume au nom de la commune arrivent avec
`actif=False` — un client ne retrouverait pas le lieu. Elles n'apparaissent
donc pas au checkout tant qu'elles ne sont pas corrigées dans l'admin.
"""
import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from shop.models import JumiaPickupPoint


class Command(BaseCommand):
    help = "Importe la liste des points relais Jumia."

    def add_arguments(self, parser):
        parser.add_argument("--json", required=True, help="Chemin du fichier JSON")
        parser.add_argument("--dry-run", action="store_true", help="Simule sans écrire")

    def handle(self, *args, **options):
        chemin = Path(options["json"])
        if not chemin.exists():
            raise CommandError(f"Fichier introuvable : {chemin}")

        points = json.loads(chemin.read_text(encoding="utf-8"))
        inactifs = [p for p in points if not p.get("actif", True)]

        if options["dry_run"]:
            communes = sorted({p["commune"] for p in points})
            self.stdout.write(
                f"[simulation] {len(points)} points, {len(communes)} communes, "
                f"{len(inactifs)} inactif(s)."
            )
            self.stdout.write("Communes : " + ", ".join(communes))
            return

        crees = maj = 0
        for p in points:
            _, cree = JumiaPickupPoint.objects.update_or_create(
                commune=p["commune"].strip(),
                nom=p["nom"].strip(),
                defaults={
                    "adresse": p["adresse"].strip(),
                    "actif": bool(p.get("actif", True)),
                },
            )
            crees += cree
            maj += not cree

        actifs = JumiaPickupPoint.objects.filter(actif=True).count()
        self.stdout.write(self.style.SUCCESS(
            f"Import termine : {crees} cree(s), {maj} mis a jour. "
            f"{actifs} point(s) actif(s) sur {JumiaPickupPoint.objects.count()}."
        ))
        for p in inactifs:
            self.stdout.write(self.style.WARNING(
                f"  inactif : {p['nom']} ({p['commune']}) — {p.get('remarque', 'adresse a preciser')}"
            ))
