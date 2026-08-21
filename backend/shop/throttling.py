"""
Freins d'usage indexés sur un identifiant métier plutôt que sur l'adresse IP.

En Côte d'Ivoire, Orange, MTN et Moov font passer des milliers d'abonnés
derrière une même adresse IP publique (CGNAT). Une limite par IP ne distingue
alors pas un attaquant d'un quartier entier : elle bloque des clients qui n'ont
rien fait, pendant qu'un script qui change d'adresse passe au travers. Sur une
boutique, cela veut dire des commandes refusées — c'est-à-dire du chiffre
d'affaires perdu, en silence.

On compte donc par ce que l'abus vise réellement : le numéro de téléphone qui
commande, la référence dont on tente le suivi. Un plafond par IP reste en
second rideau, volontairement large, contre la création en masse.
"""

from rest_framework.throttling import AnonRateThrottle


class IdentifiantThrottle(AnonRateThrottle):
    """Compte les requêtes par identifiant métier, IP en repli.

    Le repli compte : sans lui, une requête sans le champ attendu (corps vide,
    champ mal orthographié) ne serait comptée nulle part.
    """

    #: Nom du champ à lire dans la requête.
    champ = ""
    #: "data" pour un corps POST, "query" pour la chaîne de requête.
    source = "data"

    def _identifiant(self, request) -> str:
        if self.source == "query":
            brut = request.query_params.get(self.champ, "")
        else:
            brut = request.data.get(self.champ, "") if hasattr(request, "data") else ""
        return brut.strip() if isinstance(brut, str) else ""

    def get_cache_key(self, request, view):
        identifiant = self._nettoyer(self._identifiant(request))
        if not identifiant:
            return super().get_cache_key(request, view)
        return self.cache_format % {
            "scope": self.scope,
            "ident": f"{self.champ}:{identifiant}",
        }

    @staticmethod
    def _nettoyer(valeur: str) -> str:
        return valeur


class TelephoneThrottle(IdentifiantThrottle):
    """Les 8 derniers chiffres suffisent : « +225 07 01 … » et « 0701… »
    doivent tomber dans le même compteur, sinon il suffit de changer la mise
    en forme du numéro pour repartir de zéro."""

    source = "data"

    @staticmethod
    def _nettoyer(valeur: str) -> str:
        chiffres = "".join(c for c in valeur if c.isdigit())
        return chiffres[-8:] if len(chiffres) >= 8 else ""


class CommandeParTelephone(TelephoneThrottle):
    champ = "client_telephone"
    scope = "commande"


class CommandeParIP(AnonRateThrottle):
    scope = "commande_ip"


class ContactParTelephone(TelephoneThrottle):
    champ = "telephone"
    scope = "contact"


class ContactParIP(AnonRateThrottle):
    scope = "contact_ip"


class SuiviParReference(IdentifiantThrottle):
    """Indexé sur la référence visée : forcer une commande précise reste
    impraticable, sans empêcher les autres clients de suivre la leur."""

    champ = "reference"
    source = "query"
    scope = "suivi"

    @staticmethod
    def _nettoyer(valeur: str) -> str:
        return valeur.upper()


class SuiviParIP(AnonRateThrottle):
    scope = "suivi_ip"


class VisiteParIP(AnonRateThrottle):
    """Plafond large : une même personne consulte facilement quinze fiches
    d'affilée. Il ne sert qu'à empêcher qu'un script gonfle le compteur."""

    scope = "visite_ip"
