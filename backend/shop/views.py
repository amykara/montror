from django.db.models import F, Prefetch
from django.utils import timezone
from rest_framework import filters, generics, status, viewsets
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import (
    Category, DeliveryZone, Faq, JumiaPickupPoint, Order, OrderItem,
    Product, Review, SiteSettings, Visite,
)
from .serializers import (
    CategorySerializer, ContactMessageSerializer, DeliveryZoneSerializer,
    FaqSerializer, JumiaPickupPointSerializer, OrderCreateSerializer, OrderTrackingSerializer,
    ProductSerializer, ReviewSerializer, SiteSettingsSerializer,
)


from .throttling import (
    CommandeParIP, CommandeParTelephone, ContactParIP, ContactParTelephone,
    SuiviParIP, SuiviParReference, VisiteParIP,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    pagination_class = None


class DeliveryZoneViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DeliveryZone.objects.filter(actif=True)
    serializer_class = DeliveryZoneSerializer
    pagination_class = None


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    # `publie=False` = retiré du site (produit sensible, visuel à retoucher...).
    # On ne filtre pas sur `disponible` : les produits en rupture doivent
    # rester visibles côté frontend (badge "Rupture"), juste non commandables.
    queryset = (
        Product.objects.filter(publie=True)
        .prefetch_related("images", "videos")
        .select_related("categorie")
    )
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["categorie", "bracelet", "mouvement", "etanche", "style", "marque"]
    search_fields = ["nom", "marque", "reference", "description"]
    # `prix_achat_fcfa` n'est pas triable : il ne doit fuiter par aucun biais.
    ordering_fields = ["prix_vente_fcfa", "cree_le", "popularite"]
    lookup_field = "slug"


class JumiaPickupPointViewSet(viewsets.ReadOnlyModelViewSet):
    """Points relais proposés au checkout. Les entrées dont l'adresse est trop
    vague restent inactives : un client ne saurait pas où aller."""

    queryset = JumiaPickupPoint.objects.filter(actif=True)
    serializer_class = JumiaPickupPointSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ["commune"]
    pagination_class = None


class ReviewListView(generics.ListAPIView):
    queryset = Review.objects.filter(publie=True)
    serializer_class = ReviewSerializer
    pagination_class = None


class FaqListView(generics.ListAPIView):
    queryset = Faq.objects.filter(publie=True)
    serializer_class = FaqSerializer
    pagination_class = None


class SiteSettingsView(generics.RetrieveAPIView):
    serializer_class = SiteSettingsSerializer

    def get_object(self):
        return SiteSettings.load()


class ContactMessageCreateView(generics.CreateAPIView):
    serializer_class = ContactMessageSerializer
    throttle_classes = [ContactParTelephone, ContactParIP]


class OrderCreateView(generics.CreateAPIView):
    queryset = Order.objects.all()
    serializer_class = OrderCreateSerializer
    throttle_classes = [CommandeParTelephone, CommandeParIP]


class OrderTrackingView(generics.GenericAPIView):
    """Suivi public : il faut la référence ET le téléphone utilisé à la commande.
    La référence seule ne suffit pas, le téléphone seul non plus."""

    serializer_class = OrderTrackingSerializer
    throttle_classes = [SuiviParReference, SuiviParIP]

    @staticmethod
    def _normaliser_tel(valeur):
        return "".join(c for c in valeur if c.isdigit())[-8:]

    def get(self, request, *args, **kwargs):
        reference = request.query_params.get("reference", "").strip().upper()
        telephone = request.query_params.get("telephone", "").strip()

        if not reference or not telephone:
            return Response(
                {"detail": "Indiquez votre numéro de commande et votre téléphone."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        commande = (
            Order.objects.filter(reference=reference)
            .select_related("zone_livraison")
            .prefetch_related(Prefetch("items", queryset=OrderItem.objects.select_related("produit")))
            .first()
        )
        # Message identique dans les deux cas : on ne révèle pas si une
        # référence existe quand le téléphone ne correspond pas.
        if commande is None or self._normaliser_tel(commande.client_telephone) != self._normaliser_tel(telephone):
            return Response(
                {"detail": "Aucune commande ne correspond à ces informations."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self.get_serializer(commande).data)


class VisiteView(APIView):
    """Enregistre une visite. Appelé par le site à chaque page consultée.

    Aucune authentification : n'importe qui peut incrémenter le compteur. Le
    risque est assumé — c'est un indicateur de tendance pour la boutique, pas
    une donnée de facturation, et l'exiger obligerait à identifier les
    visiteurs, exactement ce qu'on veut éviter.
    """

    permission_classes = [AllowAny]
    authentication_classes: list = []
    throttle_classes = [VisiteParIP]

    def post(self, request):
        # `nouvelle` distingue l'arrivée sur le site du simple changement de
        # page : le navigateur ne l'envoie qu'une fois par onglet ouvert.
        nouvelle = bool(request.data.get("nouvelle"))
        jour = timezone.localdate()

        # F() plutôt que lire-puis-écrire : deux visiteurs simultanés
        # incrémenteraient sinon la même valeur et l'un des deux serait perdu.
        Visite.objects.get_or_create(jour=jour)
        Visite.objects.filter(jour=jour).update(
            pages=F("pages") + 1,
            visites=F("visites") + (1 if nouvelle else 0),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
