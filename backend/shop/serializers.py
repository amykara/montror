import re

from django.conf import settings
from django.db import transaction
from django.db.models import F
from rest_framework import serializers

from .alertes import prevenir_nouvelle_commande
from .models import (
    Category, ContactMessage, DeliveryZone, Faq, JumiaPickupPoint, Order,
    OrderItem, Product, ProductImage, Review, SiteSettings,
)

TELEPHONE_RE = re.compile(r"^\+?[0-9 .\-]{8,20}$")


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "slug"]


class DeliveryZoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryZone
        fields = ["id", "commune", "ville", "tarif_fcfa", "delai_estime"]


class ProductSerializer(serializers.ModelSerializer):
    """Un seul serializer, utilisé pour la liste ET la fiche détail :
    le catalogue reste petit, autant renvoyer toutes les infos d'un coup
    (le frontend Lovable filtre et affiche tout côté client)."""

    categorie = CategorySerializer(read_only=True)
    images = serializers.SerializerMethodField()
    videos = serializers.SerializerMethodField()
    prix_a_negocier = serializers.ReadOnlyField()
    fonctions = serializers.ReadOnlyField(source="liste_fonctions")

    class Meta:
        model = Product
        # `prix_achat_fcfa` et `note_interne` sont volontairement absents :
        # le prix de gros et les notes de catalogage ne sortent jamais de l'admin.
        fields = [
            "id", "nom", "slug", "reference", "marque", "style", "categorie",
            "description", "prix_vente_fcfa", "prix_a_negocier", "ancien_prix_fcfa",
            "couleur", "bracelet", "mouvement", "etanche", "diametre", "matiere",
            "garantie", "fonctions", "livre_avec", "video_url", "popularite",
            "stock", "disponible", "negociable", "acompte_pourcent", "mise_en_avant",
            "cree_le", "images", "videos",
        ]

    def _absolu(self, urls):
        request = self.context.get("request")
        return [request.build_absolute_uri(u) for u in urls] if request else list(urls)

    def get_images(self, obj):
        return self._absolu([img.image.url for img in obj.images.all()])

    def get_videos(self, obj):
        """Vidéos hébergées + éventuelle URL externe saisie dans l'admin."""
        urls = self._absolu([v.video.url for v in obj.videos.all()])
        if obj.video_url:
            urls.append(obj.video_url)
        return urls


class OrderItemInputSerializer(serializers.Serializer):
    produit_id = serializers.IntegerField()
    quantite = serializers.IntegerField(min_value=1, max_value=50)


class JumiaPickupPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = JumiaPickupPoint
        fields = ["id", "commune", "nom", "adresse"]


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemInputSerializer(many=True, write_only=True)
    reference = serializers.CharField(read_only=True)
    total_fcfa = serializers.SerializerMethodField()
    frais_livraison_fcfa = serializers.IntegerField(read_only=True)
    reste_a_payer_fcfa = serializers.ReadOnlyField()

    class Meta:
        model = Order
        fields = [
            "id", "reference", "client_nom", "client_telephone",
            "mode_livraison", "zone_livraison", "adresse", "point_relais",
            "latitude", "longitude", "mode_paiement", "items",
            "frais_livraison_fcfa", "total_fcfa", "acompte_fcfa",
            "reste_a_payer_fcfa",
        ]
        # Montants calculés par le serveur : le client ne les propose pas.
        read_only_fields = ["acompte_fcfa", "frais_livraison_fcfa"]

    def get_total_fcfa(self, obj):
        return obj.total_fcfa

    def validate_client_telephone(self, value):
        value = value.strip()
        if not TELEPHONE_RE.match(value):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        return value

    def validate_client_nom(self, value):
        value = value.strip()
        if len(value) < 2:
            raise serializers.ValidationError("Merci d'indiquer votre nom complet.")
        return value

    def validate(self, attrs):
        mode = attrs.get("mode_livraison", "yango")
        zone = attrs.get("zone_livraison")
        adresse = (attrs.get("adresse") or "").strip()
        relais = attrs.get("point_relais")
        paiement = attrs.get("mode_paiement", "livraison")
        erreurs = {}

        if mode == "yango":
            if zone is None:
                erreurs["zone_livraison"] = "Choisissez votre zone de livraison."
            if not adresse:
                erreurs["adresse"] = "Indiquez l'adresse de livraison."
            if relais is not None:
                erreurs["point_relais"] = "Sans objet pour une livraison à domicile."
        elif mode == "jumia_relais":
            if relais is None:
                erreurs["point_relais"] = "Choisissez le point relais où retirer le colis."
            elif not relais.actif:
                erreurs["point_relais"] = "Ce point relais n'est pas disponible."
            if zone is not None:
                erreurs["zone_livraison"] = "Sans objet pour un retrait en point relais."
            if adresse:
                erreurs["adresse"] = "Sans objet pour un retrait en point relais."

            # TODO: à confirmer auprès de Jumia Delivery (20 00 61 61).
            # Leur documentation vendeur tiers ne mentionne pas de collecte du
            # paiement au retrait : par prudence on n'accepte pas le paiement à
            # la remise ici. À rouvrir s'ils confirment le contraire.
            if paiement == "livraison":
                erreurs["mode_paiement"] = (
                    "Le paiement à la remise n'est pas disponible en point relais. "
                    "Réglez d'avance par Mobile Money."
                )

        if erreurs:
            raise serializers.ValidationError(erreurs)
        return attrs

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("La commande ne contient aucun article.")
        vus = set()
        for item in value:
            if item["produit_id"] in vus:
                raise serializers.ValidationError("Un même produit apparaît deux fois dans la commande.")
            vus.add(item["produit_id"])
        return value

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")

        # select_for_update : deux clients qui commandent la dernière montre en
        # même temps ne peuvent pas passer tous les deux.
        produits = Product.objects.select_for_update().in_bulk(
            [i["produit_id"] for i in items_data]
        )

        erreurs = []
        for item in items_data:
            produit = produits.get(item["produit_id"])
            if produit is None:
                erreurs.append(f"Produit {item['produit_id']} introuvable.")
                continue
            if not produit.publie:
                erreurs.append(f"{produit.nom} n'est plus au catalogue.")
            elif produit.prix_vente_fcfa is None:
                # Produit « prix sur demande » : il se négocie sur WhatsApp,
                # pas via le panier.
                erreurs.append(
                    f"{produit.nom} n'a pas de prix fixé : contactez-nous pour le commander."
                )
            elif not produit.disponible:
                erreurs.append(f"{produit.nom} n'est plus disponible.")
            elif produit.stock < item["quantite"]:
                erreurs.append(
                    f"Stock insuffisant pour {produit.nom} : il en reste {produit.stock}."
                )
        if erreurs:
            raise serializers.ValidationError({"items": erreurs})

        total_produits = sum(
            produits[i["produit_id"]].prix_vente_fcfa * i["quantite"] for i in items_data
        )
        # Un panier contenant une pièce négociable ouvre droit à l'acompte 50 %,
        # et cet acompte offre la livraison.
        panier_negociable = any(produits[i["produit_id"]].negociable for i in items_data)
        acompte_choisi = validated_data.get("mode_paiement") == "acompte_50"

        zone = validated_data.get("zone_livraison")
        if acompte_choisi and panier_negociable:
            frais = 0  # livraison offerte, c'est la contrepartie de l'acompte
        elif validated_data.get("mode_livraison", "yango") == "jumia_relais":
            frais = SiteSettings.load().tarif_point_relais_fcfa
        else:
            frais = zone.tarif_fcfa if zone else 0

        # Commande rattachée au compte si le client est connecté. Sinon elle
        # reste anonyme et se suit par référence + téléphone, comme avant.
        requete = self.context.get("request")
        client = requete.user if requete and requete.user.is_authenticated else None
        order = Order.objects.create(
            client=client, frais_livraison_fcfa=frais, **validated_data
        )

        # Acompte recalculé ici : le client ne décide pas de ce qu'il avance.
        acompte = round(total_produits * 0.5) if (acompte_choisi and panier_negociable) else 0

        for item in items_data:
            produit = produits[item["produit_id"]]
            OrderItem.objects.create(
                commande=order,
                produit=produit,
                nom_produit=produit.nom,
                quantite=item["quantite"],
                # Le prix vient de la base, jamais du client : impossible de
                # commander une montre à 1 FCFA en trafiquant la requête.
                prix_unitaire_fcfa=produit.prix_vente_fcfa,
            )
            Product.objects.filter(pk=produit.pk).update(stock=F("stock") - item["quantite"])

        if acompte:
            order.acompte_fcfa = acompte
            order.save(update_fields=["acompte_fcfa"])

        # Prevenir la boutique. `on_commit` plutot qu'ici directement : si la
        # transaction echouait apres coup, un e-mail annoncerait une commande
        # qui n'existe pas. Et l'echec de l'envoi ne remonte jamais jusqu'au
        # client — sa commande est prise, c'est ce qui compte.
        transaction.on_commit(lambda: prevenir_nouvelle_commande(order))

        return order


class OrderItemSerializer(serializers.ModelSerializer):
    nom = serializers.SerializerMethodField()
    slug = serializers.CharField(source="produit.slug", read_only=True)
    sous_total = serializers.ReadOnlyField()

    class Meta:
        model = OrderItem
        fields = ["id", "nom", "slug", "quantite", "prix_unitaire_fcfa", "sous_total"]

    def get_nom(self, obj):
        return obj.nom_produit or obj.produit.nom


class OrderTrackingSerializer(serializers.ModelSerializer):
    """Vue client d'une commande : ce qu'on accepte de montrer à qui connaît
    la référence ET le téléphone. Pas d'adresse ni de note interne."""

    items = OrderItemSerializer(many=True, read_only=True)
    # L'un des deux est nul selon le mode : livraison à domicile → zone,
    # retrait en point relais → point_relais. Le client doit voir où va
    # sa montre dans les deux cas.
    zone_livraison = DeliveryZoneSerializer(read_only=True)
    point_relais = JumiaPickupPointSerializer(read_only=True)
    mode_livraison_libelle = serializers.CharField(
        source="get_mode_livraison_display", read_only=True
    )
    statut_libelle = serializers.CharField(source="get_statut_display", read_only=True)
    etape_index = serializers.ReadOnlyField()
    total_produits_fcfa = serializers.ReadOnlyField()
    total_fcfa = serializers.ReadOnlyField()
    mode_paiement_libelle = serializers.CharField(source="get_mode_paiement_display", read_only=True)
    reste_a_payer_fcfa = serializers.ReadOnlyField()

    class Meta:
        model = Order
        fields = [
            "reference", "client_nom", "zone_livraison", "point_relais",
            "mode_livraison", "mode_livraison_libelle", "mode_paiement",
            "mode_paiement_libelle", "statut", "statut_libelle", "etape_index",
            "items", "frais_livraison_fcfa", "total_produits_fcfa", "total_fcfa",
            "acompte_fcfa", "reste_a_payer_fcfa", "cree_le", "maj_le",
        ]


class ReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ["id", "nom", "ville", "note", "texte"]


class FaqSerializer(serializers.ModelSerializer):
    class Meta:
        model = Faq
        fields = ["id", "question", "reponse"]


class SiteSettingsSerializer(serializers.ModelSerializer):

    class Meta:
        model = SiteSettings
        fields = [
            "nom", "slogan", "telephone_affichage", "telephone_tel",
            "whatsapp", "email", "adresse", "horaires", "tarif_point_relais_fcfa",
        ]


class ContactMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactMessage
        fields = ["id", "nom", "email", "telephone", "message"]
        extra_kwargs = {"id": {"read_only": True}}

    def validate(self, attrs):
        if not attrs.get("email") and not attrs.get("telephone"):
            raise serializers.ValidationError(
                "Laissez au moins un email ou un téléphone pour qu'on puisse vous répondre."
            )
        return attrs

    def validate_message(self, value):
        value = value.strip()
        if len(value) < 10:
            raise serializers.ValidationError("Votre message est trop court.")
        return value
