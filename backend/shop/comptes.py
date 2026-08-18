"""
Compte client — entièrement facultatif.

On peut commander sans compte : le suivi se fait alors par référence +
téléphone. Le compte n'apporte que du confort : coordonnées pré-remplies au
checkout et historique des commandes retrouvé depuis n'importe quel appareil.

L'identifiant est le **numéro de téléphone** : ici personne ne se souvient de
son adresse e-mail, et c'est déjà le numéro qui sert au suivi et à WhatsApp.
"""
import re

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Order
from .serializers import OrderTrackingSerializer
from .sessions import SessionClient

TELEPHONE_RE = re.compile(r"^\+?[0-9 .\-]{8,20}$")


def normaliser_telephone(valeur: str) -> str:
    """« 07 01 22 33 44 », « +225 0701223344 » → « 0701223344 ».

    Sans ça, le même client créerait plusieurs comptes selon sa façon d'écrire
    son numéro.
    """
    chiffres = "".join(c for c in valeur if c.isdigit())
    return chiffres[-10:] if len(chiffres) >= 10 else chiffres


class AuthThrottle(AnonRateThrottle):
    """Freine les essais de mot de passe au hasard.

    Volontairement indexé sur le **numéro visé**, pas sur l'IP : les opérateurs
    mobiles ivoiriens (Orange, MTN, Moov) partagent une même IP publique entre
    des milliers d'abonnés. Une limite par IP bloquerait des clients légitimes
    dès qu'un seul se trompe plusieurs fois, sans gêner un attaquant qui change
    d'IP. Par numéro, en revanche, forcer un compte reste impraticable.

    Repli sur l'IP quand la requête n'a pas de numéro exploitable (corps vide
    ou malformé), pour ne pas laisser une porte ouverte.
    """

    scope = "auth"

    def get_cache_key(self, request, view):
        brut = request.data.get("telephone") if hasattr(request, "data") else None
        numero = normaliser_telephone(brut) if isinstance(brut, str) else ""
        if not numero:
            return super().get_cache_key(request, view)
        return self.cache_format % {"scope": self.scope, "ident": f"tel:{numero}"}


class InscriptionIPThrottle(AnonRateThrottle):
    """Plafond par IP réservé à l'inscription.

    Le frein par numéro ne suffit pas ici : un script pourrait créer des
    milliers de comptes en changeant de numéro à chaque fois. Le taux reste
    volontairement large pour ne pas gêner plusieurs vrais clients derrière la
    même IP d'opérateur.
    """

    scope = "inscription"


def rattacher_commandes(utilisateur) -> int:
    """Rattache au compte les commandes passées avec ce numéro sans être
    connecté. Appelé à l'inscription **et** à chaque connexion : sans ce
    second appel, un client qui a déjà un compte mais commande sans se
    connecter laisserait des commandes orphelines pour toujours.

    Le rapprochement se fait sur les 8 derniers chiffres : le téléphone saisi
    au checkout peut s'écrire « +225 07… » quand l'identifiant du compte est
    normalisé.

    Choix assumé : le numéro n'est pas vérifié. S'inscrire avec le numéro d'un
    autre donne donc accès à son historique de commandes — nom, articles,
    montants. Aucun moyen de paiement n'est exposé, le règlement se fait à la
    livraison. Le jour où le site encaissera en ligne, il faudra prouver le
    numéro (code à usage unique) avant de rattacher quoi que ce soit.
    """
    if len(utilisateur.username) < 8:
        return 0
    return Order.objects.filter(
        client__isnull=True,
        client_telephone__contains=utilisateur.username[-8:],
    ).update(client=utilisateur)


class InscriptionSerializer(serializers.Serializer):
    nom_complet = serializers.CharField(max_length=150)
    telephone = serializers.CharField(max_length=30)
    # Demandé ici et pas seulement après coup : ajouter son adresse depuis la
    # page compte suppose d'être connecté, et on ne peut justement plus l'être
    # quand on a oublié son mot de passe. Sans ce champ, « mot de passe
    # oublié » ne servirait à personne.
    email = serializers.EmailField()
    # 8, comme le MinimumLengthValidator de Django appliqué juste après :
    # annoncer 6 puis refuser à 7 ne fait qu'égarer le client.
    mot_de_passe = serializers.CharField(write_only=True, min_length=8)

    def validate_telephone(self, value):
        if not TELEPHONE_RE.match(value.strip()):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        identifiant = normaliser_telephone(value)
        if User.objects.filter(username=identifiant).exists():
            raise serializers.ValidationError(
                "Un compte existe déjà avec ce numéro. Connectez-vous."
            )
        return value

    def validate_email(self, value):
        # Unicité indispensable : le mot de passe se récupère avec l'adresse,
        # deux comptes qui la partagent rendraient la demande ambiguë.
        adresse = value.strip().lower()
        if User.objects.filter(email__iexact=adresse).exists():
            raise serializers.ValidationError(
                "Un compte utilise déjà cette adresse. Connectez-vous."
            )
        return adresse

    def validate_mot_de_passe(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as err:
            raise serializers.ValidationError(list(err.messages)) from err
        return value

    @transaction.atomic
    def create(self, validated_data):
        identifiant = normaliser_telephone(validated_data["telephone"])
        nom = validated_data["nom_complet"].strip()
        utilisateur = User.objects.create_user(
            username=identifiant,
            email=validated_data["email"],
            password=validated_data["mot_de_passe"],
            first_name=nom[:150],
        )
        rattacher_commandes(utilisateur)
        return utilisateur


class ConnexionSerializer(serializers.Serializer):
    telephone = serializers.CharField(max_length=30)
    mot_de_passe = serializers.CharField(write_only=True)

    def validate(self, attrs):
        utilisateur = authenticate(
            username=normaliser_telephone(attrs["telephone"]),
            password=attrs["mot_de_passe"],
        )
        # Message unique : on ne révèle pas si le numéro existe.
        if utilisateur is None or not utilisateur.is_active:
            raise serializers.ValidationError(
                {"detail": "Numéro ou mot de passe incorrect."}
            )
        attrs["utilisateur"] = utilisateur
        return attrs


def _reponse_session(utilisateur, requete):
    # Une session par appareil : se déconnecter ici ne ferme pas les autres.
    return {
        "jeton": SessionClient.ouvrir(utilisateur, requete.META.get("HTTP_USER_AGENT", "")),
        "nom_complet": utilisateur.first_name or utilisateur.username,
        "telephone": utilisateur.username,
    }


class InscriptionView(generics.CreateAPIView):
    serializer_class = InscriptionSerializer
    throttle_classes = [AuthThrottle, InscriptionIPThrottle]

    def create(self, request, *args, **kwargs):
        s = self.get_serializer(data=request.data)
        s.is_valid(raise_exception=True)
        return Response(_reponse_session(s.save(), request), status=status.HTTP_201_CREATED)


class ConnexionView(APIView):
    throttle_classes = [AuthThrottle]

    def post(self, request):
        s = ConnexionSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        utilisateur = s.validated_data["utilisateur"]
        # Les commandes passées entre-temps sans être connecté rejoignent le
        # compte : c'est là que le client vient les chercher.
        rattacher_commandes(utilisateur)
        return Response(_reponse_session(utilisateur, request))


class DeconnexionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # `request.auth` est la session qui a servi à s'authentifier : on ne
        # ferme que celle-ci. `tout=true` ferme les autres appareils, utile
        # quand on a perdu son téléphone.
        if str(request.data.get("tout", "")).lower() in {"1", "true", "oui"}:
            SessionClient.objects.filter(utilisateur=request.user).delete()
        elif request.auth is not None:
            SessionClient.objects.filter(pk=request.auth.pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MonCompteView(APIView):
    """Profil + historique complet, réservé au titulaire du compte."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        commandes = (
            Order.objects.filter(client=request.user)
            .select_related("zone_livraison", "point_relais")
            .prefetch_related("items")
        )
        return Response({
            "nom_complet": request.user.first_name or request.user.username,
            "telephone": request.user.username,
            # Vide = aucune adresse confirmée : le client ne pourra pas
            # récupérer son mot de passe tant qu'il n'en ajoute pas.
            "email": request.user.email,
            "commandes": OrderTrackingSerializer(commandes, many=True).data,
        })
