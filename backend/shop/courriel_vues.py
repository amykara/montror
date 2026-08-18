"""
Vues du parcours e-mail : confirmation de l'adresse, oubli de mot de passe.

Rappel de ce que l'e-mail sécurise ici : **le mot de passe, pas le
téléphone**. Le rattachement des commandes reste automatique par numéro.
Confondre les deux donnerait une fausse impression de sécurité.
"""

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .comptes import InscriptionIPThrottle, _reponse_session, normaliser_telephone


from .courriel import (
    REINITIALISATION,
    VERIFICATION,
    CodeCourriel,
    EnvoiImpossible,
    envoyer_code,
)
from .sessions import SessionClient


def trouver_compte(identifiant: str):
    """Retrouve un compte à partir d'un numéro **ou** d'une adresse e-mail.

    Le client tape ce dont il se souvient : imposer l'un des deux formats
    bloquerait celui qui se rappelle de l'autre — précisément la situation où
    il vient chercher de l'aide.
    """
    identifiant = (identifiant or "").strip()
    if not identifiant:
        return None
    if "@" in identifiant:
        return User.objects.filter(email__iexact=identifiant).first()
    numero = normaliser_telephone(identifiant)
    return User.objects.filter(username=numero).first() if numero else None



class EnvoiThrottle(AnonRateThrottle):
    """Freine les **envois** d'e-mails : c'est l'action coûteuse, et celle
    dont on peut abuser pour inonder une boîte de réception.

    Indexé sur le numéro visé, comme les autres freins du compte : une IP
    d'opérateur mobile ivoirien couvre des milliers d'abonnés.
    """

    scope = "courriel"

    def get_cache_key(self, request, view):
        brut = request.data.get("identifiant") if hasattr(request, "data") else None
        cible = brut.strip().lower() if isinstance(brut, str) else ""
        # Un numéro écrit de deux façons doit tomber dans le même compteur,
        # sinon changer la mise en forme suffirait à repartir de zéro.
        if cible and "@" not in cible:
            cible = normaliser_telephone(cible)
        if not cible and request.user.is_authenticated:
            cible = request.user.username
        if not cible:
            return super().get_cache_key(request, view)
        return self.cache_format % {"scope": self.scope, "ident": cible}


class SaisieThrottle(EnvoiThrottle):
    """Freine la **saisie** du code, beaucoup plus largement que l'envoi.

    Le code se défend déjà seul : 5 essais et il est brûlé, 15 minutes et il
    expire. Appliquer ici la limite des envois punirait le client qui tape mal
    son code deux fois — une heure d'attente pour une faute de frappe.
    """

    scope = "courriel_essai"


class DemandeCourrielView(APIView):
    """Envoie un code à l'adresse que le client veut associer à son compte."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [EnvoiThrottle]

    def post(self, request):
        champ = serializers.EmailField()
        try:
            adresse = champ.run_validation(request.data.get("email", ""))
        except serializers.ValidationError as err:
            raise serializers.ValidationError({"email": err.detail}) from err

        if CodeCourriel.trop_tot(request.user, VERIFICATION):
            return Response(
                {"detail": "Un code vient d'être envoyé. Patientez une minute."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        CodeCourriel.purger()
        code = CodeCourriel.emettre(request.user, adresse, VERIFICATION)
        try:
            envoyer_code(adresse, code, VERIFICATION, request.user.first_name)
        except EnvoiImpossible:
            # Laisser le code en base ferait attendre un message qui ne
            # viendra pas.
            CodeCourriel.objects.filter(
                utilisateur=request.user, usage=VERIFICATION
            ).delete()
            return Response(
                {"detail": "Envoi impossible pour le moment. Réessayez dans un instant."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"envoye": True, "expire_dans_minutes": 15})


class ConfirmerCourrielView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SaisieThrottle]

    def post(self, request):
        code = str(request.data.get("code", "")).strip()
        adresse = (
            CodeCourriel.consommer(request.user, VERIFICATION, code) if code else None
        )
        if adresse is None:
            return Response(
                {"code": ["Code incorrect ou expiré. Demandez-en un nouveau."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        request.user.email = adresse
        request.user.save(update_fields=["email"])
        return Response({"email": adresse})


class DemandeReinitialisationView(APIView):
    """Envoie un code de réinitialisation à l'adresse confirmée du compte."""

    throttle_classes = [EnvoiThrottle, InscriptionIPThrottle]

    def post(self, request):
        utilisateur = trouver_compte(str(request.data.get("identifiant", "")))

        # Réponse identique dans tous les cas : sinon ce formulaire dirait à
        # qui veut l'entendre quels numéros et quelles adresses sont clients.
        neutre = Response(
            {
                "detail": "Si ce compte existe, un code vient d'être envoyé à "
                "son adresse e-mail.",
            }
        )

        if utilisateur is None or not utilisateur.email or not utilisateur.is_active:
            return neutre
        if CodeCourriel.trop_tot(utilisateur, REINITIALISATION):
            return neutre

        CodeCourriel.purger()
        code = CodeCourriel.emettre(utilisateur, utilisateur.email, REINITIALISATION)
        try:
            envoyer_code(
                utilisateur.email, code, REINITIALISATION, utilisateur.first_name
            )
        except EnvoiImpossible:
            CodeCourriel.objects.filter(
                utilisateur=utilisateur, usage=REINITIALISATION
            ).delete()
        return neutre


class ReinitialiserMotDePasseView(APIView):
    throttle_classes = [SaisieThrottle, InscriptionIPThrottle]

    def post(self, request):
        code = str(request.data.get("code", "")).strip()
        nouveau = str(request.data.get("mot_de_passe", ""))

        utilisateur = trouver_compte(str(request.data.get("identifiant", "")))
        if utilisateur is None or not code:
            return Response(
                {"detail": "Code incorrect ou expiré."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Le mot de passe est validé **avant** de consommer le code : sinon un
        # mot de passe trop court brûlerait le code et obligerait le client à
        # tout recommencer.
        try:
            validate_password(nouveau, utilisateur)
        except DjangoValidationError as err:
            raise serializers.ValidationError(
                {"mot_de_passe": list(err.messages)}
            ) from err

        if CodeCourriel.consommer(utilisateur, REINITIALISATION, code) is None:
            return Response(
                {"detail": "Code incorrect ou expiré."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        utilisateur.set_password(nouveau)
        utilisateur.save(update_fields=["password"])
        # Toutes les sessions tombent : si quelqu'un d'autre s'était introduit,
        # le changement de mot de passe l'éjecte.
        SessionClient.objects.filter(utilisateur=utilisateur).delete()
        return Response(_reponse_session(utilisateur, request))
