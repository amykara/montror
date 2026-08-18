"""
Vérifie que Gmail accepte les identifiants de `.env`, sans envoyer d'e-mail.

    cd backend
    ./venv/Scripts/python.exe tester_email.py

Ouvrir la connexion suffit à valider le compte et le mot de passe
d'application : inutile de déranger une vraie boîte de réception pour savoir
si la configuration tient.
"""

import os

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.conf import settings  # noqa: E402
from django.core.mail import get_connection  # noqa: E402


def principal() -> int:
    if not settings.EMAIL_HOST:
        print("EMAIL_HOST est vide : les e-mails s'affichent dans la console")
        print("du serveur et ne partent chez personne. Renseignez .env.")
        return 1

    print(f"serveur   : {settings.EMAIL_HOST}:{settings.EMAIL_PORT} (TLS {settings.EMAIL_USE_TLS})")
    print(f"compte    : {settings.EMAIL_HOST_USER}")
    print(f"expéditeur: {settings.NOM_BOUTIQUE} <{settings.DEFAULT_FROM_EMAIL}>")

    motdepasse = settings.EMAIL_HOST_PASSWORD
    if not motdepasse:
        print("\nEMAIL_HOST_PASSWORD est vide.")
        return 1
    if len(motdepasse.replace(" ", "")) != 16:
        print(
            f"\nAttention : le mot de passe fait {len(motdepasse)} caractères. "
            "Un mot de passe d'application Google en fait 16."
        )

    connexion = get_connection()
    try:
        connexion.open()
        connexion.close()
    except Exception as err:  # noqa: BLE001 — on veut afficher n'importe quel échec
        print(f"\nÉCHEC : {type(err).__name__}")
        print(str(err)[:300])
        if "BadCredentials" in str(err) or "535" in str(err):
            print(
                "\nGoogle refuse le couple compte / mot de passe. Le plus souvent :\n"
                "  • le mot de passe d'application a été révoqué ;\n"
                "  • le mot de passe du compte Google a changé — cela invalide\n"
                "    tous les mots de passe d'application créés avant ;\n"
                "  • c'est le mot de passe du compte qui a été collé, et non un\n"
                "    mot de passe d'application.\n"
                "Un nouveau se crée sur myaccount.google.com/apppasswords"
            )
        return 1

    print("\nGmail accepte la connexion. La récupération de mot de passe fonctionnera.")
    return 0


if __name__ == "__main__":
    raise SystemExit(principal())
