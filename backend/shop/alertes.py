"""
Prévenir la boutique qu'une commande vient d'arriver.

Sans ça, il faut penser à ouvrir l'admin pour découvrir une commande — et un
client qui attend un appel de confirmation pendant des heures annule.

L'envoi est **volontairement silencieux en cas d'échec** : une panne de Gmail
ne doit jamais empêcher une vente. La commande est déjà enregistrée quand
cette fonction est appelée ; au pire, elle est visible dans l'admin.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMessage

logger = logging.getLogger(__name__)

SUJET = "Nouvelle commande {reference} — {total} FCFA"

CORPS = """Nouvelle commande sur {boutique}.

  Référence   {reference}
  Client      {nom}
  Téléphone   {telephone}
  Total       {total} FCFA ({paiement})

{livraison}
Articles :
{articles}

À faire : appeler le client pour confirmer, puis passer la commande en
« Confirmée » dans l'administration.

  {admin}
"""


def _formater_fcfa(montant: int) -> str:
    """« 23900 » → « 23 900 » : un montant se lit d'un coup d'œil ou pas."""
    return f"{montant:,}".replace(",", " ")


def prevenir_nouvelle_commande(commande) -> None:
    reglages = commande.__class__._meta.apps.get_model("shop", "SiteSettings").load()
    destinataire = (reglages.email_alertes or "").strip()
    if not destinataire:
        return

    if commande.point_relais:
        livraison = (
            f"Retrait au point relais {commande.point_relais.nom} "
            f"({commande.point_relais.commune}).\n"
        )
    elif commande.zone_livraison:
        livraison = (
            f"Livraison à domicile — {commande.zone_livraison.commune}.\n"
            f"  Adresse : {commande.adresse or '(non précisée)'}\n"
        )
    else:
        livraison = "Mode de livraison non précisé.\n"

    if commande.latitude and commande.longitude:
        livraison += (
            f"  Position : https://www.google.com/maps?q="
            f"{commande.latitude},{commande.longitude}\n"
        )

    articles = "\n".join(
        f"  {item.quantite} × {item.nom_produit or item.produit.nom} "
        f"— {_formater_fcfa(item.sous_total)} FCFA"
        for item in commande.items.all()
    )

    message = EmailMessage(
        subject=SUJET.format(
            reference=commande.reference, total=_formater_fcfa(commande.total_fcfa)
        ),
        body=CORPS.format(
            boutique=settings.NOM_BOUTIQUE,
            reference=commande.reference,
            nom=commande.client_nom,
            telephone=commande.client_telephone,
            total=_formater_fcfa(commande.total_fcfa),
            paiement=commande.get_mode_paiement_display(),
            livraison=livraison,
            articles=articles,
            admin=settings.URL_ADMIN,
        ),
        from_email=f"{settings.NOM_BOUTIQUE} <{settings.DEFAULT_FROM_EMAIL}>",
        to=[destinataire],
        # Repondre a l'e-mail ecrit au client, pas a la boite technique.
        reply_to=[reglages.email] if reglages.email else [],
    )

    try:
        message.send(fail_silently=False)
    except Exception as err:  # noqa: BLE001 — dépend du service SMTP
        # On journalise sans relancer : la vente prime sur la notification.
        logger.error(
            "Alerte de commande %s non envoyée à %s : %s",
            commande.reference,
            destinataire,
            err,
        )
