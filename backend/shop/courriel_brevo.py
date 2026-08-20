"""
Envoi d'e-mails par l'API web de Brevo, quand le SMTP est inaccessible.

Pourquoi ce module existe : l'offre gratuite de Render **bloque les ports
SMTP sortants** (25, 465, 587) pour empêcher les abus. Toute tentative
d'envoi via Gmail y échoue sur un « [Errno 101] Network is unreachable »,
quels que soient les identifiants — le mot de passe n'y est pour rien.

Le port 443 reste ouvert. Brevo propose une API HTTPS qui passe donc sans
difficulté, avec 300 e-mails par jour offerts.

C'est un backend Django standard : tout le code qui appelle `send()`
fonctionne sans modification, ici comme en développement où le SMTP reste
utilisable.
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

URL_API = "https://api.brevo.com/v3/smtp/email"
DELAI_RESEAU = 15


def _adresse(valeur: str) -> dict:
    """« MONTR'OR <boutique@exemple.ci> » → {"name": ..., "email": ...}."""
    valeur = (valeur or "").strip()
    if "<" in valeur and valeur.endswith(">"):
        nom, _, adresse = valeur.rpartition("<")
        return {"name": nom.strip().strip('"'), "email": adresse[:-1].strip()}
    return {"email": valeur}


class BackendBrevo(BaseEmailBackend):
    """Expédie chaque message par un appel HTTPS à Brevo."""

    def send_messages(self, email_messages):
        if not email_messages:
            return 0

        cle = settings.BREVO_API_KEY
        if not cle:
            if not self.fail_silently:
                raise ValueError("BREVO_API_KEY n'est pas renseigné.")
            return 0

        envoyes = 0
        for message in email_messages:
            corps = {
                "sender": _adresse(message.from_email or settings.DEFAULT_FROM_EMAIL),
                "to": [{"email": a} for a in message.to],
                "subject": message.subject,
                "textContent": message.body,
            }
            if message.reply_to:
                corps["replyTo"] = _adresse(message.reply_to[0])
            if message.cc:
                corps["cc"] = [{"email": a} for a in message.cc]

            requete = urllib.request.Request(
                URL_API,
                data=json.dumps(corps).encode(),
                headers={
                    "api-key": cle,
                    "content-type": "application/json",
                    "accept": "application/json",
                },
            )
            try:
                with urllib.request.urlopen(requete, timeout=DELAI_RESEAU) as reponse:
                    reponse.read()
                envoyes += 1
            except urllib.error.HTTPError as err:
                detail = err.read().decode(errors="replace")[:250]
                # Jamais le contenu du message dans les journaux : ils
                # transportent des codes de connexion.
                logger.error(
                    "Brevo a refusé l'envoi vers %s (%s) : %s",
                    ", ".join(message.to),
                    err.code,
                    detail,
                )
                if not self.fail_silently:
                    raise
            except Exception as err:  # noqa: BLE001 — dépend du réseau
                logger.error("Brevo injoignable pour %s : %s", ", ".join(message.to), err)
                if not self.fail_silently:
                    raise

        return envoyes
