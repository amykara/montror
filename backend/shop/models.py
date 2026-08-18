import secrets

from django.core.validators import MaxValueValidator, MinValueValidator
from django.conf import settings
from django.core.files.storage import default_storage
from django.db import models
from django.utils.text import slugify


class Category(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(unique=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    class Meta:
        verbose_name_plural = "Categories"

    def __str__(self):
        return self.name


class DeliveryZone(models.Model):
    """Zone de livraison Abidjan (commune) ou autre ville, avec tarif fixe."""
    commune = models.CharField(max_length=100)
    ville = models.CharField(max_length=100, default="Abidjan")
    tarif_fcfa = models.PositiveIntegerField(help_text="Frais de livraison en FCFA")
    delai_estime = models.CharField(max_length=50, default="24-48h")
    actif = models.BooleanField(default=True)

    class Meta:
        unique_together = ("commune", "ville")

    def __str__(self):
        return f"{self.commune} ({self.ville}) - {self.tarif_fcfa} FCFA"


class JumiaPickupPoint(models.Model):
    """Point relais Jumia où le client vient retirer son colis."""

    commune = models.CharField(max_length=100)
    nom = models.CharField(max_length=150)
    adresse = models.TextField()
    actif = models.BooleanField(
        default=True,
        help_text="Décoche tant que l'adresse n'est pas assez précise pour un client",
    )

    class Meta:
        ordering = ["commune", "nom"]
        unique_together = ("commune", "nom")
        verbose_name = "Point relais Jumia"
        verbose_name_plural = "Points relais Jumia"

    def __str__(self):
        return f"{self.nom} ({self.commune})"


class Product(models.Model):
    BRACELET_CHOICES = [
        ("cuir", "Cuir"),
        ("acier", "Acier"),
        ("silicone", "Silicone"),
        ("velcro", "Velcro"),
    ]
    MOUVEMENT_CHOICES = [
        ("quartz", "Quartz"),
        ("automatique", "Automatique"),
    ]

    STYLE_CHOICES = [
        ("Luxe", "Luxe"),
        ("Sport", "Sport"),
        ("Classique", "Classique"),
    ]

    nom = models.CharField(max_length=150)
    slug = models.SlugField(unique=True, blank=True)
    reference = models.CharField(max_length=50, unique=True)
    marque = models.CharField(max_length=80, blank=True)
    style = models.CharField(max_length=20, choices=STYLE_CHOICES, blank=True)
    categorie = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name="produits")
    description = models.TextField(blank=True)
    # Usage interne uniquement (marges, rentabilité) : jamais exposé par l'API.
    prix_achat_fcfa = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Prix de gros chez le fournisseur. Jamais affiché sur le site.",
    )
    # Vide = prix pas encore fixé : le site affiche « Nous contacter » à la place
    # du prix et du bouton d'achat.
    prix_vente_fcfa = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Prix affiché au client. Laisser vide pour un produit à négocier de A à Z.",
    )
    ancien_prix_fcfa = models.PositiveIntegerField(null=True, blank=True, help_text="Pour afficher une promo barrée")
    couleur = models.CharField(max_length=50, blank=True)
    bracelet = models.CharField(max_length=20, choices=BRACELET_CHOICES, blank=True)
    mouvement = models.CharField(max_length=20, choices=MOUVEMENT_CHOICES, blank=True)
    etanche = models.BooleanField(default=False)
    diametre = models.CharField(max_length=20, blank=True, help_text="Ex. 41 mm")
    matiere = models.CharField(max_length=100, blank=True, help_text="Ex. Acier inoxydable 316L")
    garantie = models.CharField(max_length=50, blank=True, help_text="Ex. 24 mois")
    fonctions = models.TextField(
        blank=True,
        help_text="Une fonction par ligne (ex. « Guichet dateur à 6h »). "
                  "N'y mettre que ce qui est visible sur la montre.",
    )
    livre_avec = models.CharField(
        max_length=200, blank=True,
        help_text="Ex. « Coffret rigide finition bois + coussinet »",
    )
    video_url = models.URLField(blank=True)
    popularite = models.PositiveIntegerField(default=0)
    stock = models.PositiveIntegerField(default=0)
    disponible = models.BooleanField(default=True, help_text="Décoche pour afficher « Rupture »")
    negociable = models.BooleanField(
        default=False,
        help_text="Affiche un bouton « Négocier avec notre équipe » sur la fiche produit",
    )
    acompte_pourcent = models.PositiveSmallIntegerField(
        default=0,
        validators=[MaxValueValidator(100)],
        help_text="0 = payable intégralement à la livraison. 50 = un acompte de "
                  "50 %% est demandé avant expédition (pièces chères ou sur commande).",
    )
    publie = models.BooleanField(
        default=True,
        help_text="Décoche pour retirer complètement le produit du site (il reste en base)",
    )
    mise_en_avant = models.BooleanField(
        default=True,
        help_text="Autorise l'affichage en vitrine (accueil, hero). Décoche pour un "
                  "produit qui reste au catalogue mais qu'on ne met pas en avant — "
                  "photo montrant un emballage de marque, visuel à retoucher…",
    )
    note_interne = models.TextField(
        blank=True,
        help_text="Notes de catalogage, alertes marque… Visible seulement ici.",
    )
    cree_le = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(f"{self.nom}-{self.reference}")
        super().save(*args, **kwargs)

    @property
    def liste_fonctions(self):
        return [ligne.strip() for ligne in self.fonctions.splitlines() if ligne.strip()]

    @property
    def prix_a_negocier(self):
        """Aucun prix fixé : le site invite à contacter la boutique."""
        return self.prix_vente_fcfa is None

    @property
    def marge_fcfa(self):
        if self.prix_vente_fcfa is None or self.prix_achat_fcfa is None:
            return None
        return self.prix_vente_fcfa - self.prix_achat_fcfa

    def __str__(self):
        return f"{self.nom} ({self.reference})"


class ProductImage(models.Model):
    produit = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to="produits/")
    principale = models.BooleanField(default=False)
    ordre = models.PositiveIntegerField(default=0, help_text="Ordre d'affichage dans la galerie")

    class Meta:
        # L'image principale d'abord, puis l'ordre choisi dans l'admin.
        ordering = ["-principale", "ordre", "id"]

    def delete(self, *args, **kwargs):
        # Sans ça, le fichier reste sur le disque et media/ enfle à chaque
        # ré-import. Voir aussi la commande `nettoyer_media`.
        fichier = self.image
        super().delete(*args, **kwargs)
        fichier.delete(save=False)

    def __str__(self):
        return f"Image de {self.produit.nom}"


def stockage_videos():
    """Stockage des vidéos.

    Cloudinary sépare strictement images et vidéos : envoyer un `.mp4` sur le
    canal des images se solde par un « Invalid image file », alors que le
    fichier est parfaitement valide. Il faut donc désigner explicitement le
    stockage vidéo, le réglage global `STORAGES["default"]` ne servant que
    pour les photos.

    Callable plutôt que valeur fixe : le choix se fait au démarrage, ce qui
    laisse le développement sur le disque local sans compte Cloudinary.
    """
    if getattr(settings, "CLOUDINARY_URL", ""):
        from cloudinary_storage.storage import VideoMediaCloudinaryStorage

        return VideoMediaCloudinaryStorage()
    return default_storage


class ProductVideo(models.Model):
    """Vidéo de présentation (souvent filmée au téléphone par le fournisseur).
    Sert à animer la fiche produit et la vitrine d'accueil."""

    produit = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="videos")
    video = models.FileField(upload_to="produits/videos/", storage=stockage_videos)
    ordre = models.PositiveIntegerField(default=0)
    mise_en_avant = models.BooleanField(
        default=False,
        help_text="Coche pour utiliser cette vidéo dans la vitrine animée de l'accueil",
    )

    class Meta:
        ordering = ["-mise_en_avant", "ordre", "id"]
        verbose_name = "Vidéo produit"
        verbose_name_plural = "Vidéos produit"

    def delete(self, *args, **kwargs):
        fichier = self.video
        super().delete(*args, **kwargs)
        fichier.delete(save=False)

    def __str__(self):
        return f"Vidéo de {self.produit.nom}"


class Order(models.Model):
    STATUT_CHOICES = [
        ("en_attente", "En attente de confirmation"),
        ("confirmee", "Confirmée"),
        ("expediee", "Expédiée"),
        ("livree", "Livrée"),
        ("annulee", "Annulée"),
    ]
    PAIEMENT_CHOICES = [
        ("livraison", "Paiement à la livraison"),
        ("mobile_money", "Mobile Money (payé d'avance)"),
        ("acompte_50", "Acompte 50 % + solde à la livraison"),
    ]

    MODE_LIVRAISON_CHOICES = [
        ("yango", "Livraison à domicile (Yango)"),
        ("jumia_relais", "Point Relais Jumia"),
    ]

    # Étape de suivi affichée au client, dans l'ordre. L'index sert au frontend.
    ETAPES_SUIVI = ["en_attente", "confirmee", "expediee", "livree"]

    reference = models.CharField(
        max_length=20, unique=True, blank=True, db_index=True,
        help_text="Numéro communiqué au client, ex. MO-4F82K1",
    )
    # Le compte est facultatif : une commande passée sans connexion reste
    # valide et se suit par référence + téléphone.
    client = models.ForeignKey(
        "auth.User", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="commandes",
    )
    client_nom = models.CharField(max_length=150)
    client_telephone = models.CharField(max_length=30, db_index=True)

    mode_livraison = models.CharField(
        max_length=20, choices=MODE_LIVRAISON_CHOICES, default="yango",
    )
    # Ne s'applique qu'à la livraison à domicile : au point relais, le client
    # se déplace et il n'y a pas de zone tarifaire.
    zone_livraison = models.ForeignKey(
        DeliveryZone, on_delete=models.PROTECT, null=True, blank=True,
    )
    adresse = models.CharField(max_length=255, blank=True)
    point_relais = models.ForeignKey(
        JumiaPickupPoint, on_delete=models.PROTECT, null=True, blank=True,
        help_text="Renseigné uniquement si le mode de livraison est « Point Relais Jumia »",
    )
    # Relevées par le navigateur si le client accepte : le texte d'adresse
    # reste approximatif à Abidjan, les coordonnées aident le livreur.
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    mode_paiement = models.CharField(max_length=20, choices=PAIEMENT_CHOICES, default="livraison")
    acompte_fcfa = models.PositiveIntegerField(default=0)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default="en_attente")
    # Frais figés à la commande : si tu changes le tarif d'une zone plus tard,
    # les anciennes commandes gardent le prix réellement facturé.
    frais_livraison_fcfa = models.PositiveIntegerField(default=0)
    note_interne = models.TextField(blank=True, help_text="Visible seulement dans l'admin")
    cree_le = models.DateTimeField(auto_now_add=True)
    maj_le = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-cree_le"]

    @staticmethod
    def _nouvelle_reference():
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sans I/O/0/1, illisibles au téléphone
        return "MO-" + "".join(secrets.choice(alphabet) for _ in range(6))

    def save(self, *args, **kwargs):
        if not self.reference:
            for _ in range(10):
                candidate = self._nouvelle_reference()
                if not Order.objects.filter(reference=candidate).exists():
                    self.reference = candidate
                    break
            else:
                raise RuntimeError("Impossible de générer une référence de commande unique")
        super().save(*args, **kwargs)

    def clean(self):
        """Les deux modes de livraison n'utilisent pas les mêmes champs."""
        from django.core.exceptions import ValidationError

        erreurs = {}
        if self.mode_livraison == "yango":
            if self.zone_livraison_id is None:
                erreurs["zone_livraison"] = "Obligatoire pour une livraison à domicile."
            if not self.adresse.strip():
                erreurs["adresse"] = "Obligatoire pour une livraison à domicile."
            if self.point_relais_id is not None:
                erreurs["point_relais"] = "À laisser vide pour une livraison à domicile."
        elif self.mode_livraison == "jumia_relais":
            if self.point_relais_id is None:
                erreurs["point_relais"] = "Obligatoire pour un retrait en point relais."
            if self.zone_livraison_id is not None:
                erreurs["zone_livraison"] = "À laisser vide pour un retrait en point relais."
            if self.adresse.strip():
                erreurs["adresse"] = "À laisser vide pour un retrait en point relais."
        if erreurs:
            raise ValidationError(erreurs)

    @property
    def total_produits_fcfa(self):
        return sum(item.sous_total for item in self.items.all())

    @property
    def total_fcfa(self):
        return self.total_produits_fcfa + self.frais_livraison_fcfa

    @property
    def reste_a_payer_fcfa(self):
        """Ce que le client règle à la réception du colis."""
        if self.mode_paiement == "mobile_money":
            return 0
        return max(self.total_fcfa - self.acompte_fcfa, 0)

    @property
    def etape_index(self):
        """Position dans le parcours de suivi ; -1 pour une commande annulée."""
        if self.statut == "annulee":
            return -1
        try:
            return self.ETAPES_SUIVI.index(self.statut)
        except ValueError:
            return 0

    def __str__(self):
        return f"Commande {self.reference} - {self.client_nom}"


class OrderItem(models.Model):
    commande = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    produit = models.ForeignKey(Product, on_delete=models.PROTECT)
    # Le nom est recopié : si le produit est renommé, la commande garde ce qui a été vendu.
    nom_produit = models.CharField(max_length=150, blank=True)
    quantite = models.PositiveIntegerField(default=1)
    prix_unitaire_fcfa = models.PositiveIntegerField()

    @property
    def sous_total(self):
        return self.quantite * self.prix_unitaire_fcfa

    def __str__(self):
        return f"{self.quantite} x {self.nom_produit or self.produit.nom}"


class Review(models.Model):
    """Avis client affiché sur la page d'accueil, modéré depuis l'admin."""
    nom = models.CharField(max_length=100)
    ville = models.CharField(max_length=100, blank=True)
    note = models.PositiveSmallIntegerField(
        default=5, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    texte = models.TextField()
    publie = models.BooleanField(default=True, help_text="Décoche pour retirer l'avis du site")
    ordre = models.PositiveIntegerField(default=0)
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["ordre", "-cree_le"]
        verbose_name = "Avis client"
        verbose_name_plural = "Avis clients"

    def __str__(self):
        return f"{self.nom} ({self.note}/5)"


class Faq(models.Model):
    question = models.CharField(max_length=255)
    reponse = models.TextField()
    publie = models.BooleanField(default=True)
    ordre = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["ordre", "id"]
        verbose_name = "Question fréquente"
        verbose_name_plural = "Questions fréquentes"

    def __str__(self):
        return self.question


class SiteSettings(models.Model):
    """Coordonnées et textes de la boutique. Une seule ligne, éditable dans l'admin."""
    nom = models.CharField(max_length=80, default="MONTR'OR")
    slogan = models.CharField(max_length=120, default="L'élégance accessible")
    telephone_affichage = models.CharField(max_length=30, default="07 01 85 07 08")
    telephone_tel = models.CharField(max_length=30, default="+2250701850708", help_text="Format international, pour le lien d'appel")
    whatsapp = models.CharField(max_length=30, default="2250701850708", help_text="Sans + ni espaces, pour wa.me")
    email = models.EmailField(default="contact@montror.ci")
    adresse = models.CharField(max_length=255, default="Cocody Angré, Abidjan, Côte d'Ivoire")
    horaires = models.CharField(max_length=120, default="Lun – Sam : 08h – 20h")
    tarif_point_relais_fcfa = models.PositiveIntegerField(
        default=800,
        help_text="Frais facturés pour un retrait en point relais Jumia",
    )

    class Meta:
        verbose_name = "Réglages du site"
        verbose_name_plural = "Réglages du site"

    def save(self, *args, **kwargs):
        self.pk = 1  # singleton : impossible de créer une deuxième ligne
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # on ne supprime pas les réglages du site

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Réglages du site"


class ContactMessage(models.Model):
    nom = models.CharField(max_length=150)
    email = models.EmailField(blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    message = models.TextField()
    traite = models.BooleanField(default=False, help_text="Coche une fois que tu as répondu")
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le"]
        verbose_name = "Message de contact"
        verbose_name_plural = "Messages de contact"

    def __str__(self):
        return f"{self.nom} — {self.cree_le:%d/%m/%Y}"


# Les modèles liés au compte client vivent dans leurs propres modules, au plus
# près de la logique qui les utilise. Ils sont réexportés ici pour que Django
# les découvre : `makemigrations` n'inspecte que `models.py`.
from .courriel import CodeCourriel  # noqa: E402,F401
from .sessions import SessionClient  # noqa: E402,F401
