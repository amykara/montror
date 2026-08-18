"""
Adresse e-mail du compte client : confirmation et récupération du mot de passe.

Ce que l'e-mail sert **et ne sert pas** : il ne prouve pas le téléphone, donc
il ne conditionne pas le rattachement des commandes — celui-ci reste
automatique par numéro (voir `rattacher_commandes` dans comptes.py). Il répond
au seul manque qui coûte vraiment quelque chose au quotidien : un client qui
oublie son mot de passe n'avait aucun recours.

L'e-mail est **facultatif**. Sans lui, le compte fonctionne exactement pareil ;
il n'y a simplement pas de récupération possible.

Convention retenue : `User.email` n'est renseigné **qu'une fois le code
confirmé**. Une adresse présente en base est donc, par construction, une
adresse vérifiée — pas de drapeau supplémentaire qu'on oublierait de tenir à
jour. L'adresse en attente vit dans le code de vérification.
"""

import hashlib
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import models
from django.utils import timezone

logger = logging.getLogger(__name__)

#: Court exprès : un code valable une heure traîne dans une boîte de réception.
DUREE_VALIDITE = timedelta(minutes=15)

#: 1 000 000 de combinaisons, 5 essais : deviner est hors de portée, et le
#: code est brûlé bien avant.
ESSAIS_MAX = 5

#: Empêche de faire pleuvoir les e-mails sur une adresse.
DELAI_ENTRE_ENVOIS = timedelta(seconds=60)

VERIFICATION = "verification"
REINITIALISATION = "reinitialisation"


class EnvoiImpossible(Exception):
    """L'e-mail n'est pas parti."""


def _empreinte(code: str, adresse: str) -> str:
    """L'adresse sert de sel : deux clients qui reçoivent « 042913 » n'ont pas
    la même empreinte en base."""
    return hashlib.sha256(f"{adresse}:{code}".encode()).hexdigest()


class CodeCourriel(models.Model):
    USAGES = [
        (VERIFICATION, "Vérification de l'adresse"),
        (REINITIALISATION, "Réinitialisation du mot de passe"),
    ]

    utilisateur = models.ForeignKey(
        "auth.User", on_delete=models.CASCADE, related_name="codes_courriel"
    )
    #: Adresse visée. Pour une vérification, c'est l'adresse **en attente** :
    #: elle ne rejoint `User.email` qu'une fois le code confirmé.
    adresse = models.EmailField()
    usage = models.CharField(max_length=20, choices=USAGES)
    # Le code n'est jamais stocké en clair : qui lirait la base ne pourrait
    # pas reprendre un compte dont la demande est en cours.
    empreinte = models.CharField(max_length=64)
    cree_le = models.DateTimeField(auto_now_add=True)
    essais = models.PositiveSmallIntegerField(default=0)

    class Meta:
        verbose_name = "code e-mail"
        verbose_name_plural = "codes e-mail"
        ordering = ["-cree_le"]

    def __str__(self):
        return f"{self.adresse} — {self.get_usage_display()}"

    @property
    def expire(self) -> bool:
        return timezone.now() - self.cree_le > DUREE_VALIDITE

    @classmethod
    def derniere(cls, utilisateur, usage: str):
        return (
            cls.objects.filter(utilisateur=utilisateur, usage=usage)
            .order_by("-cree_le")
            .first()
        )

    @classmethod
    def trop_tot(cls, utilisateur, usage: str) -> bool:
        derniere = cls.derniere(utilisateur, usage)
        return bool(derniere and timezone.now() - derniere.cree_le < DELAI_ENTRE_ENVOIS)

    @classmethod
    def emettre(cls, utilisateur, adresse: str, usage: str) -> str:
        """Renvoie le code en clair, à transmettre par e-mail — et nulle part
        ailleurs. Les demandes précédentes du même usage sont supprimées : un
        seul code valable à la fois, sinon les anciens resteraient utilisables.
        """
        cls.objects.filter(utilisateur=utilisateur, usage=usage).delete()
        code = f"{secrets.randbelow(1_000_000):06d}"
        cls.objects.create(
            utilisateur=utilisateur,
            adresse=adresse,
            usage=usage,
            empreinte=_empreinte(code, adresse),
        )
        return code

    @classmethod
    def consommer(cls, utilisateur, usage: str, code: str) -> str | None:
        """Vérifie le code, le détruit, et renvoie l'adresse visée.

        Un code ne sert qu'une fois : sans ça, un code lu par-dessus l'épaule
        resterait valable un quart d'heure.
        """
        entree = cls.derniere(utilisateur, usage)
        if entree is None or entree.expire or entree.essais >= ESSAIS_MAX:
            return None

        if not secrets.compare_digest(
            entree.empreinte, _empreinte(code.strip(), entree.adresse)
        ):
            cls.objects.filter(pk=entree.pk).update(essais=models.F("essais") + 1)
            return None

        adresse = entree.adresse
        entree.delete()
        return adresse

    @classmethod
    def purger(cls) -> int:
        """Les codes périmés n'ont plus d'usage : appelé à chaque émission."""
        return cls.objects.filter(
            cree_le__lt=timezone.now() - DUREE_VALIDITE
        ).delete()[0]


MESSAGES = {
    VERIFICATION: (
        "Confirmez votre adresse e-mail",
        "Bonjour {nom},\n\n"
        "Votre code de confirmation {boutique} est : {code}\n\n"
        "Il est valable 15 minutes. Cette adresse servira uniquement à "
        "récupérer votre mot de passe si vous l'oubliez.\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.\n\n"
        "— {boutique}\n",
    ),
    REINITIALISATION: (
        "Réinitialiser votre mot de passe",
        "Bonjour {nom},\n\n"
        "Votre code de réinitialisation {boutique} est : {code}\n\n"
        "Il est valable 15 minutes.\n\n"
        "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : "
        "votre mot de passe reste inchangé.\n\n"
        "— {boutique}\n",
    ),
}


def envoyer_code(adresse: str, code: str, usage: str, nom: str) -> None:
    """Expédie le code.

    L'expéditeur porte le nom de la boutique : l'adresse technique peut être
    partagée avec un autre projet, mais un client qui reçoit « MONTR'OR » dans
    sa boîte doit reconnaître qui lui écrit.
    """
    sujet, corps = MESSAGES[usage]
    boutique = settings.NOM_BOUTIQUE
    message = EmailMessage(
        subject=f"{sujet} — {boutique}",
        body=corps.format(nom=nom or "", code=code, boutique=boutique),
        # « MONTR'OR <adresse> » : le nom affiché prime sur l'adresse dans la
        # plupart des messageries.
        from_email=f"{boutique} <{settings.DEFAULT_FROM_EMAIL}>",
        to=[adresse],
    )
    try:
        message.send(fail_silently=False)
    except Exception as err:  # noqa: BLE001 — dépend du backend SMTP configuré
        # Le code n'apparaît jamais dans les logs : ce sont eux qu'on lit en
        # cas d'incident, souvent à plusieurs.
        logger.error("Envoi e-mail refusé pour %s : %s", adresse, err)
        raise EnvoiImpossible from err
