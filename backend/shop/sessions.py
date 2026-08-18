"""
Sessions client : un jeton par appareil, avec expiration.

Le jeton fourni par DRF (`rest_framework.authtoken`) ne convenait pas ici pour
deux raisons :

* il est **unique par utilisateur** (relation un-à-un), donc tous les appareils
  d'un même client partagent la même clé — fermer sa session au bureau éjecte
  aussi le téléphone ;
* il **n'expire jamais**, ce qui laisse un appareil perdu ouvert indéfiniment.

Ce module le remplace par un jeton par appareil, daté, qui se périme au bout de
90 jours d'inactivité. Seule l'empreinte de la clé est stockée : une copie de la
base ne donne aucune session utilisable.
"""

import hashlib
import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

#: Durée d'inactivité au-delà de laquelle la session est refusée.
DUREE_VALIDITE = timedelta(days=90)

#: On ne réécrit pas `vue_le` à chaque requête : une écriture par appel d'API
#: pour une précision dont personne n'a besoin.
PAS_DE_RAFRAICHISSEMENT = timedelta(hours=6)


def empreinte(cle: str) -> str:
    """SHA-256 suffit : la clé est déjà 256 bits d'aléa, il n'y a rien à
    deviner par force brute — contrairement à un mot de passe, qui exigerait
    un hachage lent."""
    return hashlib.sha256(cle.encode()).hexdigest()


def resumer_appareil(user_agent: str) -> str:
    """« Chrome sur Android » plutôt que la chaîne complète : le client doit
    reconnaître son appareil dans la liste, pas lire un en-tête HTTP."""
    ua = (user_agent or "").strip()
    if not ua:
        return ""
    navigateur = next(
        (n for n in ("Edg", "OPR", "Chrome", "Firefox", "Safari") if n in ua),
        "Navigateur",
    )
    navigateur = {"Edg": "Edge", "OPR": "Opera"}.get(navigateur, navigateur)
    systeme = next(
        (s for s in ("Android", "iPhone", "iPad", "Windows", "Mac", "Linux") if s in ua),
        "",
    )
    return f"{navigateur} sur {systeme}" if systeme else navigateur


class SessionClient(models.Model):
    """Un appareil connecté."""

    utilisateur = models.ForeignKey(
        "auth.User", on_delete=models.CASCADE, related_name="sessions_client"
    )
    # Jamais la clé en clair : seule son empreinte est conservée.
    empreinte_cle = models.CharField(max_length=64, unique=True, db_index=True)
    appareil = models.CharField(max_length=60, blank=True)
    cree_le = models.DateTimeField(auto_now_add=True)
    vue_le = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "session client"
        verbose_name_plural = "sessions client"
        ordering = ["-vue_le"]

    def __str__(self):
        return f"{self.utilisateur.username} — {self.appareil or 'appareil inconnu'}"

    @property
    def expiree(self) -> bool:
        return timezone.now() - self.vue_le > DUREE_VALIDITE

    @classmethod
    def ouvrir(cls, utilisateur, user_agent: str = "") -> str:
        """Crée une session et renvoie la clé en clair — la seule fois où elle
        existe ailleurs que dans le navigateur du client."""
        cle = secrets.token_urlsafe(32)
        cls.objects.create(
            utilisateur=utilisateur,
            empreinte_cle=empreinte(cle),
            appareil=resumer_appareil(user_agent)[:60],
        )
        # Ménage discret : les sessions périmées de ce client n'ont plus lieu
        # d'être en base.
        cls.objects.filter(
            utilisateur=utilisateur, vue_le__lt=timezone.now() - DUREE_VALIDITE
        ).delete()
        return cle


class AuthentificationSession(BaseAuthentication):
    """Lit `Authorization: Token <clé>`, comme DRF, pour ne rien changer côté
    frontend."""

    mot_cle = "Token"

    def authenticate(self, request):
        entete = get_authorization_header(request).split()
        if not entete or entete[0].lower() != self.mot_cle.lower().encode():
            return None
        if len(entete) != 2:
            raise exceptions.AuthenticationFailed("En-tête d'authentification mal formé.")

        try:
            cle = entete[1].decode()
        except UnicodeError as err:
            raise exceptions.AuthenticationFailed("Jeton illisible.") from err

        session = (
            SessionClient.objects.select_related("utilisateur")
            .filter(empreinte_cle=empreinte(cle))
            .first()
        )
        if session is None:
            raise exceptions.AuthenticationFailed("Session inconnue ou fermée.")

        if session.expiree:
            session.delete()
            raise exceptions.AuthenticationFailed("Session expirée, reconnectez-vous.")

        if not session.utilisateur.is_active:
            raise exceptions.AuthenticationFailed("Compte désactivé.")

        if timezone.now() - session.vue_le > PAS_DE_RAFRAICHISSEMENT:
            SessionClient.objects.filter(pk=session.pk).update(vue_le=timezone.now())

        request.session_client = session
        return (session.utilisateur, session)

    def authenticate_header(self, request):
        return self.mot_cle
