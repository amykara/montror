from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from shop.models import (
    Category, DeliveryZone, Faq, Product, ProductImage, Review, SiteSettings,
)

# Les visuels de démo vivent dans le frontend ; on les recopie dans /media
# pour que l'API serve de vraies URLs d'images.
SEED_IMAGES_DIRS = [
    settings.BASE_DIR / "seed_images",
    settings.BASE_DIR.parent / "frontend" / "src" / "assets",
]


def trouver_image(filename):
    for dossier in SEED_IMAGES_DIRS:
        chemin = dossier / filename
        if chemin.exists():
            return chemin
    return None

PRODUCTS = [
    dict(reference="MO-1001", nom="Luxoris Automatic Gold", marque="Luxoris", genre="Homme", style="Luxe",
         prix_achat=45000, prix_vente=89000, ancien_prix=125000, images=["hero-watch.jpg", "watch-2.jpg", "watch-6.jpg"],
         video_url="https://cdn.coverr.co/videos/coverr-a-watch-on-a-table-2633/1080p.mp4",
         bracelet="acier", couleur="Or", mouvement="automatique", etanche=True, diametre="41 mm",
         matiere="Acier inoxydable 316L", garantie="24 mois", popularite=98,
         description="Pièce maîtresse de la collection : cadran noir soleillé, lunette dorée et mouvement automatique visible. Une montre qui parle avant vous."),
    dict(reference="MO-1002", nom="Heritage Classic Cuir", marque="Heritage", genre="Homme", style="Classique",
         prix_achat=16000, prix_vente=32000, ancien_prix=45000, images=["watch-1.jpg", "hero-watch.jpg"],
         bracelet="cuir", couleur="Argent", mouvement="quartz", etanche=False, diametre="40 mm",
         matiere="Acier / Cuir véritable", garantie="12 mois", popularite=91,
         description="Le minimalisme suisse dans sa plus belle expression : cadran blanc épuré, bracelet cuir cognac véritable, profil ultra-fin."),
    dict(reference="MO-1003", nom="Royal Gold Bracelet", marque="Royal", genre="Homme", style="Luxe",
         prix_achat=34000, prix_vente=68000, ancien_prix=None, images=["watch-2.jpg", "hero-watch.jpg"],
         bracelet="acier", couleur="Or", mouvement="quartz", etanche=True, diametre="42 mm",
         matiere="Acier plaqué or", garantie="24 mois", popularite=87,
         description="Entièrement plaquée or, avec cadran champagne et guichet date. L'affirmation d'un style sans compromis."),
    dict(reference="MO-1004", nom="Blackline Chrono Sport", marque="Blackline", genre="Homme", style="Sport",
         prix_achat=22000, prix_vente=45000, ancien_prix=59000, images=["watch-3.jpg", "watch-6.jpg"],
         video_url="https://cdn.coverr.co/videos/coverr-a-watch-on-a-table-2633/1080p.mp4",
         bracelet="silicone", couleur="Noir", mouvement="quartz", etanche=True, diametre="44 mm",
         matiere="Acier revêtu PVD", garantie="24 mois", popularite=94,
         description="Chronographe tout noir, boîtier mat et bracelet silicone confort. Conçue pour le mouvement, pensée pour le style."),
    dict(reference="MO-1005", nom="Aurore Rose Mesh", marque="Aurore", genre="Femme", style="Classique",
         prix_achat=14000, prix_vente=29000, ancien_prix=39000, images=["watch-4.jpg", "watch-5.jpg"],
         bracelet="acier", couleur="Or rose", mouvement="quartz", etanche=False, diametre="32 mm",
         matiere="Acier or rose", garantie="12 mois", popularite=96,
         description="Boîtier or rose, cadran nacre et bracelet mesh milanais. Une finesse absolue au poignet, jour et nuit."),
    dict(reference="MO-1006", nom="Aurore Noir Cuir", marque="Aurore", genre="Femme", style="Classique",
         prix_achat=13000, prix_vente=27500, ancien_prix=None, images=["watch-5.jpg", "watch-4.jpg"],
         bracelet="cuir", couleur="Noir", mouvement="quartz", etanche=False, diametre="30 mm",
         matiere="Acier / Cuir", garantie="12 mois", popularite=84,
         description="Cadran noir profond, index dorés, bracelet cuir façon croco. La discrétion élégante d'une pièce intemporelle."),
    dict(reference="MO-1007", nom="Meccanica Skeleton Bleu", marque="Meccanica", genre="Homme", style="Luxe",
         prix_achat=48000, prix_vente=95000, ancien_prix=139000, images=["watch-6.jpg", "hero-watch.jpg"],
         video_url="https://cdn.coverr.co/videos/coverr-a-watch-on-a-table-2633/1080p.mp4",
         bracelet="acier", couleur="Bleu", mouvement="automatique", etanche=True, diametre="42 mm",
         matiere="Acier inoxydable", garantie="24 mois", popularite=89,
         description="Cadran bleu nuit ouvert sur le mécanisme. Un objet d'horlogerie à admirer autant qu'à porter."),
    dict(reference="MO-1008", nom="Blackline Active Femme", marque="Blackline", genre="Femme", style="Sport",
         prix_achat=17000, prix_vente=34000, ancien_prix=None, images=["watch-3.jpg", "watch-5.jpg"], disponible=False,
         bracelet="silicone", couleur="Noir", mouvement="quartz", etanche=True, diametre="36 mm",
         matiere="Acier PVD", garantie="12 mois", popularite=72,
         description="Silhouette sportive, bracelet silicone doux et boîtier compact. Parfaite du sport au bureau."),
    dict(reference="MO-1009", nom="Heritage Executive Acier", marque="Heritage", genre="Homme", style="Classique",
         prix_achat=26000, prix_vente=52000, ancien_prix=65000, images=["watch-6.jpg", "watch-1.jpg"],
         bracelet="acier", couleur="Argent", mouvement="quartz", etanche=True, diametre="40 mm",
         matiere="Acier inoxydable", garantie="24 mois", popularite=80,
         description="Le classique du bureau : bracelet acier massif, cadran sobre, lisibilité parfaite."),
    dict(reference="MO-1010", nom="Royal Lady Gold", marque="Royal", genre="Femme", style="Luxe",
         prix_achat=37000, prix_vente=74000, ancien_prix=None, images=["watch-2.jpg", "watch-4.jpg"],
         bracelet="acier", couleur="Or", mouvement="quartz", etanche=False, diametre="34 mm",
         matiere="Acier plaqué or", garantie="24 mois", popularite=78,
         description="Éclat doré et lignes féminines. Une pièce de cérémonie qui traverse les saisons."),
    dict(reference="MO-1011", nom="Meccanica Diver Pro", marque="Meccanica", genre="Homme", style="Sport",
         prix_achat=29000, prix_vente=58000, ancien_prix=79000, images=["watch-3.jpg", "watch-6.jpg"],
         bracelet="silicone", couleur="Noir", mouvement="automatique", etanche=True, diametre="44 mm",
         matiere="Acier / Verre minéral", garantie="24 mois", popularite=85,
         description="Lunette tournante, index luminescents, étanchéité renforcée. L'esprit plongée au quotidien."),
    dict(reference="MO-1012", nom="Aurore Minimal Blanc", marque="Aurore", genre="Femme", style="Classique",
         prix_achat=12000, prix_vente=24000, ancien_prix=31000, images=["watch-4.jpg", "watch-1.jpg"],
         bracelet="acier", couleur="Argent", mouvement="quartz", etanche=False, diametre="32 mm",
         matiere="Acier inoxydable", garantie="12 mois", popularite=88,
         description="Un cadran blanc pur, sans surcharge. Le meilleur premier achat d'une montre élégante."),
]

# On ne livre qu'Abidjan pour l'instant.
ZONES = [
    dict(commune="Grand Abidjan", ville="Abidjan", tarif_fcfa=1000, delai_estime="24 à 48h"),
]

# Avis et FAQ de démarrage : à remplacer par tes vrais avis depuis l'admin.
REVIEWS = [
    dict(nom="Aïcha K.", ville="Cocody", note=5, ordre=1,
         texte="Livrée en 24h à Angré. La montre est encore plus belle en vrai, et j'ai payé à la réception. Confiance totale."),
    dict(nom="Yann D.", ville="Marcory", note=5, ordre=2,
         texte="Service WhatsApp très réactif, ils m'ont conseillé le bon modèle. Qualité au-dessus du prix payé."),
    dict(nom="Fatou S.", ville="Bouaké", note=5, ordre=3,
         texte="Reçue en 3 jours à Bouaké, emballage soigné, facture et garantie incluses. Je recommande vraiment."),
]

FAQS = [
    dict(ordre=1, question="Puis-je payer à la livraison ?",
         reponse="Oui. Le paiement à la livraison est disponible partout en Côte d'Ivoire : vous réglez le livreur à la réception du colis, après vérification."),
    dict(ordre=2, question="Quels sont les délais de livraison ?",
         reponse="24 à 48h dans le Grand Abidjan avec Yango Next Day Delivery, et 2 à 5 jours pour les autres villes via Jumia Delivery."),
    dict(ordre=3, question="Les montres sont-elles garanties ?",
         reponse="Chaque montre est garantie de 12 à 24 mois selon le modèle, contre tout défaut de fabrication du mouvement."),
    dict(ordre=4, question="Puis-je échanger un article ?",
         reponse="Oui, sous 7 jours, si la montre n'a pas été portée et que l'emballage d'origine est intact."),
    dict(ordre=5, question="Comment suivre ma commande ?",
         reponse="Depuis la page Suivi, avec le numéro de commande reçu à la validation (ex. MO-4F82K1) et le téléphone utilisé lors de l'achat."),
]


class Command(BaseCommand):
    help = (
        "Remplit la base avec le contenu de démarrage : catégories, zones, "
        "12 montres + photos, avis clients, FAQ et réglages du site."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--images-seulement",
            action="store_true",
            help="Ne (re)charge que les photos des produits déjà en base.",
        )

    def handle(self, *args, **options):
        if options["images_seulement"]:
            ajoutees = self.charger_images()
            self.stdout.write(self.style.SUCCESS(f"{ajoutees} image(s) ajoutée(s)."))
            return

        cat_by_name = {}
        for name in ["Homme", "Femme"]:
            cat, _ = Category.objects.get_or_create(name=name)
            cat_by_name[name] = cat

        for z in ZONES:
            DeliveryZone.objects.get_or_create(
                commune=z["commune"], ville=z["ville"],
                defaults={"tarif_fcfa": z["tarif_fcfa"], "delai_estime": z["delai_estime"]},
            )

        created = 0
        for p in PRODUCTS:
            produit, was_created = Product.objects.get_or_create(
                reference=p["reference"],
                defaults=dict(
                    nom=p["nom"],
                    marque=p["marque"],
                    style=p["style"],
                    categorie=cat_by_name[p["genre"]],
                    description=p["description"],
                    prix_achat_fcfa=p["prix_achat"],
                    prix_vente_fcfa=p["prix_vente"],
                    ancien_prix_fcfa=p.get("ancien_prix"),
                    couleur=p["couleur"],
                    bracelet=p["bracelet"],
                    mouvement=p["mouvement"],
                    etanche=p["etanche"],
                    diametre=p["diametre"],
                    matiere=p["matiere"],
                    garantie=p["garantie"],
                    video_url=p.get("video_url", ""),
                    popularite=p["popularite"],
                    stock=15,
                    disponible=p.get("disponible", True),
                ),
            )
            if was_created:
                created += 1

        images_ajoutees = self.charger_images()

        for r in REVIEWS:
            Review.objects.get_or_create(nom=r["nom"], texte=r["texte"], defaults=r)

        for f in FAQS:
            Faq.objects.get_or_create(question=f["question"], defaults=f)

        SiteSettings.load()

        self.stdout.write(self.style.SUCCESS(
            f"Seed termine : {created} produits crees ({Product.objects.count()} au total), "
            f"{images_ajoutees} images, {Review.objects.count()} avis, {Faq.objects.count()} questions FAQ."
        ))
        if images_ajoutees == 0 and not ProductImage.objects.exists():
            self.stdout.write(self.style.WARNING(
                "Aucune image trouvee. Depose tes photos dans backend/seed_images/ "
                "ou ajoute-les depuis l'admin Django."
            ))

    def charger_images(self):
        """Attache les visuels aux produits qui n'en ont pas encore (idempotent)."""
        ajoutees = 0
        for p in PRODUCTS:
            produit = Product.objects.filter(reference=p["reference"]).first()
            if produit is None or produit.images.exists():
                continue
            for i, filename in enumerate(p["images"]):
                src = trouver_image(filename)
                if src is None:
                    continue
                with open(src, "rb") as fichier:
                    img = ProductImage(produit=produit, principale=(i == 0), ordre=i)
                    img.image.save(f"{p['reference']}-{filename}", File(fichier), save=True)
                    ajoutees += 1
        return ajoutees
