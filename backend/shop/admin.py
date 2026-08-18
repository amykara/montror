from django.contrib import admin
from django.utils.html import format_html

from .models import (
    Category, ContactMessage, DeliveryZone, Faq, JumiaPickupPoint, Order, OrderItem,
    Product, ProductImage, ProductVideo, Review, SiteSettings,
)


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1
    fields = ["image", "apercu", "principale", "ordre"]
    readonly_fields = ["apercu"]

    @admin.display(description="Aperçu")
    def apercu(self, obj):
        if obj.pk and obj.image:
            return format_html('<img src="{}" style="height:60px;border-radius:4px" />', obj.image.url)
        return "—"


class ProductVideoInline(admin.TabularInline):
    model = ProductVideo
    extra = 0
    fields = ["video", "apercu", "mise_en_avant", "ordre"]
    readonly_fields = ["apercu"]

    @admin.display(description="Aperçu")
    def apercu(self, obj):
        if obj.pk and obj.video:
            return format_html(
                '<video src="{}" style="height:120px" muted playsinline controls preload="metadata"></video>',
                obj.video.url,
            )
        return "—"


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = [
        "nom", "reference", "marque", "categorie", "prix_affiche", "marge",
        "stock", "publie", "disponible", "negociable", "alerte",
    ]
    list_filter = ["publie", "categorie", "style", "bracelet", "disponible", "negociable"]
    list_editable = ["stock", "publie", "disponible", "negociable"]
    search_fields = ["nom", "reference", "marque", "note_interne"]
    list_per_page = 50
    inlines = [ProductImageInline, ProductVideoInline]
    fieldsets = [
        ("Identité", {"fields": ["nom", "reference", "slug", "marque", "categorie", "style", "description"]}),
        ("Prix", {
            "fields": ["prix_achat_fcfa", "prix_vente_fcfa", "ancien_prix_fcfa",
                       "negociable", "acompte_pourcent"],
            "description": "Laisser « prix de vente » vide affiche « Nous contacter » sur le site. "
                           "Le prix d'achat reste interne, il n'est jamais envoyé au site. "
                           "« Acompte » à 50 exige la moitié d'avance avant expédition.",
        }),
        ("Caractéristiques", {
            "fields": ["couleur", "bracelet", "mouvement", "etanche", "diametre",
                       "matiere", "garantie", "fonctions", "livre_avec", "video_url"],
            "description": "N'y renseigner que ce qui est vérifiable sur la pièce. "
                           "Les champs laissés vides n'apparaissent pas sur le site.",
        }),
        ("Mise en ligne", {"fields": ["publie", "mise_en_avant", "disponible", "stock", "popularite"]}),
        ("Interne", {"fields": ["note_interne"], "classes": ["collapse"]}),
    ]
    prepopulated_fields = {"slug": ["nom"]}

    @admin.display(description="Prix de vente", ordering="prix_vente_fcfa")
    def prix_affiche(self, obj):
        if obj.prix_vente_fcfa is None:
            return format_html('<span style="color:#b45309">à négocier</span>')
        return f"{obj.prix_vente_fcfa:,} FCFA".replace(",", " ")

    @admin.display(description="Marge")
    def marge(self, obj):
        marge = obj.marge_fcfa
        return "—" if marge is None else f"{marge:,} FCFA".replace(",", " ")

    @admin.display(description="Alerte")
    def alerte(self, obj):
        if not obj.note_interne:
            return ""
        urgent = "ATTENTION" in obj.note_interne.upper()
        return format_html(
            '<span title="{}" style="color:{}">{}</span>',
            obj.note_interne[:300],
            "#b91c1c" if urgent else "#6b7280",
            "⚠ à vérifier" if urgent else "note",
        )


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    fields = ["nom_produit", "produit", "quantite", "prix_unitaire_fcfa", "sous_total_affiche"]
    readonly_fields = ["sous_total_affiche"]

    @admin.display(description="Sous-total")
    def sous_total_affiche(self, obj):
        return f"{obj.sous_total:,} FCFA".replace(",", " ") if obj.pk else "—"


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ["reference", "client_nom", "client_telephone", "statut",
                    "total_affiche", "livraison_affichee", "mode_paiement",
                    "reste_affiche", "cree_le"]
    list_filter = ["statut", "mode_livraison", "mode_paiement", "zone_livraison"]
    list_editable = ["statut"]
    search_fields = ["reference", "client_nom", "client_telephone"]
    readonly_fields = ["reference", "frais_livraison_fcfa", "total_affiche",
                       "reste_affiche", "cree_le", "maj_le"]
    date_hierarchy = "cree_le"
    inlines = [OrderItemInline]

    @admin.display(description="Total")
    def total_affiche(self, obj):
        return f"{obj.total_fcfa:,} FCFA".replace(",", " ")

    @admin.display(description="Livraison")
    def livraison_affichee(self, obj):
        if obj.mode_livraison == "jumia_relais":
            return f"Relais : {obj.point_relais}" if obj.point_relais else "Relais (non precise)"
        return f"Domicile : {obj.zone_livraison}" if obj.zone_livraison else "Domicile"

    @admin.display(description="Reste à encaisser")
    def reste_affiche(self, obj):
        reste = obj.reste_a_payer_fcfa
        if reste == 0:
            return format_html('<span style="color:#15803d">payé</span>')
        return f"{reste:,} FCFA".replace(",", " ")


@admin.register(JumiaPickupPoint)
class JumiaPickupPointAdmin(admin.ModelAdmin):
    list_display = ["nom", "commune", "actif", "apercu_adresse"]
    list_filter = ["actif", "commune"]
    list_editable = ["actif"]
    search_fields = ["nom", "commune", "adresse"]
    list_per_page = 60

    @admin.display(description="Adresse")
    def apercu_adresse(self, obj):
        if obj.adresse.strip().lower() == obj.commune.strip().lower():
            return format_html('<span style="color:#b91c1c">a preciser</span>')
        return obj.adresse[:80]


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ["nom", "ville", "note", "publie", "ordre", "cree_le"]
    list_filter = ["publie", "note"]
    list_editable = ["publie", "ordre"]
    search_fields = ["nom", "texte"]


@admin.register(Faq)
class FaqAdmin(admin.ModelAdmin):
    list_display = ["question", "publie", "ordre"]
    list_filter = ["publie"]
    list_editable = ["publie", "ordre"]


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ["nom", "email", "telephone", "traite", "cree_le"]
    list_filter = ["traite"]
    list_editable = ["traite"]
    search_fields = ["nom", "email", "telephone", "message"]
    readonly_fields = ["nom", "email", "telephone", "message", "cree_le"]

    def has_add_permission(self, request):
        return False  # les messages arrivent par le formulaire du site


@admin.register(SiteSettings)
class SiteSettingsAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return not SiteSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DeliveryZone)
class DeliveryZoneAdmin(admin.ModelAdmin):
    list_display = ["commune", "ville", "tarif_fcfa", "delai_estime", "actif"]
    list_editable = ["tarif_fcfa", "delai_estime", "actif"]


admin.site.register(Category)

admin.site.site_header = "MONTR'OR — Administration"
admin.site.site_title = "MONTR'OR"
admin.site.index_title = "Gestion de la boutique"
