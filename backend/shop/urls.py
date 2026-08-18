from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .comptes import (
    ConnexionView, DeconnexionView, InscriptionView, MonCompteView,
)
from .courriel_vues import (
    ConfirmerCourrielView, DemandeCourrielView, DemandeReinitialisationView,
    ReinitialiserMotDePasseView,
)
from .views import (
    CategoryViewSet, ContactMessageCreateView, DeliveryZoneViewSet, FaqListView,
    JumiaPickupPointViewSet,
    OrderCreateView, OrderTrackingView, ProductViewSet, ReviewListView, SiteSettingsView,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="categorie")
router.register("zones-livraison", DeliveryZoneViewSet, basename="zone-livraison")
router.register("produits", ProductViewSet, basename="produit")
router.register("points-relais", JumiaPickupPointViewSet, basename="point-relais")

urlpatterns = [
    path("", include(router.urls)),
    path("commandes/", OrderCreateView.as_view(), name="commande-creer"),
    path("commandes/suivi/", OrderTrackingView.as_view(), name="commande-suivi"),
    path("avis/", ReviewListView.as_view(), name="avis-liste"),
    path("faq/", FaqListView.as_view(), name="faq-liste"),
    path("reglages/", SiteSettingsView.as_view(), name="reglages-site"),
    path("contact/", ContactMessageCreateView.as_view(), name="contact-creer"),
    path("compte/inscription/", InscriptionView.as_view(), name="compte-inscription"),
    path("compte/connexion/", ConnexionView.as_view(), name="compte-connexion"),
    path("compte/deconnexion/", DeconnexionView.as_view(), name="compte-deconnexion"),
    path("compte/moi/", MonCompteView.as_view(), name="compte-moi"),
    path("compte/email/code/", DemandeCourrielView.as_view(), name="compte-email-code"),
    path("compte/email/confirmer/", ConfirmerCourrielView.as_view(), name="compte-email-confirmer"),
    path("compte/mot-de-passe/code/", DemandeReinitialisationView.as_view(), name="compte-mdp-code"),
    path("compte/mot-de-passe/reinitialiser/", ReinitialiserMotDePasseView.as_view(), name="compte-mdp-reinit"),
]
