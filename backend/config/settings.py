import os
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "oui"}


def env_list(name, default=""):
    return [v.strip() for v in os.getenv(name, default).split(",") if v.strip()]


DEBUG = env_bool("DEBUG", True)

SECRET_KEY = os.getenv("SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-secret-key-non-utilisable-en-production"
    else:
        raise RuntimeError(
            "SECRET_KEY doit être défini dans .env quand DEBUG=False. "
            "Génère-le avec : python -c \"import secrets;print(secrets.token_urlsafe(50))\""
        )

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "django_filters",
    "shop",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Base de données : SQLite par défaut pour démarrer vite. Dès que DATABASE_URL
# pointe sur Postgres (prod), c'est lui qui est utilisé.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()

if DATABASE_URL.startswith("postgres"):
    url = urlparse(DATABASE_URL)
    # Les hebergeurs Postgres infogeres (Neon, Supabase, Render) refusent les
    # connexions en clair et ajoutent « ?sslmode=require » a la chaine. Sans
    # cette lecture, l'option serait perdue et la connexion reposerait sur le
    # « prefer » par defaut de psycopg2 — silencieux tant que ca marche,
    # incomprehensible le jour ou ca casse.
    parametres = dict(parse_qsl(url.query))
    options = {}
    if "sslmode" in parametres:
        options["sslmode"] = parametres["sslmode"]
    elif url.hostname not in ("localhost", "127.0.0.1", None):
        options["sslmode"] = "require"

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": url.path.lstrip("/"),
            "USER": unquote(url.username or ""),
            "PASSWORD": unquote(url.password or ""),
            "HOST": url.hostname or "",
            "PORT": str(url.port or ""),
            # Connexions reutilisees 10 min : ouvrir une session Postgres a
            # chaque requete coute plus cher que la requete elle-meme.
            "CONN_MAX_AGE": 600,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": options,
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# Argon2 en tête plutôt que le PBKDF2 par défaut. Deux raisons : c'est le
# hachage recommandé par Django (résistant aux attaques par GPU, contrairement
# à PBKDF2), et il est bien plus rapide ici — ~0,3 s contre ~4 s pour les
# 720 000 itérations de PBKDF2 sur une machine modeste. Quatre secondes
# d'attente à chaque connexion, un client ne les accepte pas.
# PBKDF2 reste dans la liste : les mots de passe déjà enregistrés continuent
# de fonctionner et Django les réencode en Argon2 à la connexion suivante.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.ScryptPasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fr-fr"
TIME_ZONE = "Africa/Abidjan"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Photos des produits
# ---------------------------------------------------------------------------
# Sur les hébergeurs gratuits (Render, Railway…), le disque est remis à zéro à
# chaque déploiement. Une photo ajoutée depuis l'admin y survivrait quelques
# heures, puis la fiche produit se retrouverait sans image, sans que personne
# comprenne pourquoi.
#
# Dès que CLOUDINARY_URL est renseigné, les fichiers partent donc chez
# Cloudinary. Sans lui — en développement — tout reste sur le disque local,
# ce qui évite d'avoir besoin d'un compte pour travailler.
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "").strip()

if CLOUDINARY_URL:
    INSTALLED_APPS += ["cloudinary", "cloudinary_storage"]
    STOCKAGE_MEDIAS = "cloudinary_storage.storage.MediaCloudinaryStorage"
else:
    STOCKAGE_MEDIAS = "django.core.files.storage.FileSystemStorage"
    if not DEBUG:
        raise RuntimeError(
            "CLOUDINARY_URL doit être renseigné quand DEBUG=False : sans lui, "
            "les photos ajoutées depuis l'admin disparaîtraient au prochain "
            "déploiement."
        )

STORAGES = {
    "default": {"BACKEND": STOCKAGE_MEDIAS},
    "staticfiles": {
        # Le manifeste exige un collectstatic préalable : réservé à la prod.
        "BACKEND": (
            "django.contrib.staticfiles.storage.StaticFilesStorage"
            if DEBUG
            else "whitenoise.storage.CompressedManifestStaticFilesStorage"
        )
    },
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5 Mo : on ne reçoit que du JSON
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    # Pagination réglable par le client (?page_size=), plafonnée pour éviter
    # qu'on demande la base entière en une requête.
    "DEFAULT_PAGINATION_CLASS": "shop.pagination.CataloguePagination",
    "PAGE_SIZE": 60,
    # Pas de throttle global : en SSR, toutes les lectures du catalogue
    # arrivent depuis l'IP du serveur frontend et seraient comptées ensemble,
    # ce qui bloquerait le site entier. Seules les écritures et le suivi,
    # appelés depuis le navigateur du client, sont limités.
    # Deux niveaux (voir shop/throttling.py) : un compteur serré sur
    # l'identifiant visé — téléphone du client, référence de commande — et un
    # plafond par IP beaucoup plus large. Les opérateurs mobiles ivoiriens
    # partagent une même IP entre des milliers d'abonnés : un frein par IP
    # seul refuserait des commandes à de vrais clients.
    "DEFAULT_THROTTLE_RATES": {
        "commande": "8/hour",       # par numéro de téléphone
        "commande_ip": "60/hour",
        "contact": "3/hour",        # par numéro de téléphone
        "contact_ip": "40/hour",
        "suivi": "20/hour",         # par référence de commande
        "suivi_ip": "200/hour",
        "visite_ip": "300/hour",    # comptage de fréquentation
        "auth": "20/hour",          # par numéro de téléphone
        "inscription": "30/hour",   # par IP, contre la création en masse
        "courriel": "8/hour",         # par numéro : envois d’e-mails
        "courriel_essai": "30/hour",  # saisies de code, bien plus large
    },
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # Jeton plutôt que session : le frontend est sur un autre port, et une
        # session inter-origines impose une gymnastique CSRF inutile ici.
        # Implémentation maison (shop/sessions.py) : celle de DRF n'a qu'un
        # jeton par client, sans expiration.
        "shop.sessions.AuthentificationSession",
    ],
}
if not DEBUG:
    REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
        "rest_framework.renderers.JSONRenderer",  # pas d'API navigable en prod
    ]

# Origines autorisées à appeler l'API depuis un navigateur.
# Le frontend Lovable (vite dev) écoute sur 8080.
CORS_ALLOWED_ORIGINS = env_list(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:8080,http://127.0.0.1:8080",
)
# En dev, vite change de port si le sien est déjà pris (8080 → 8081...).
# On accepte donc n'importe quel port local, mais uniquement quand DEBUG=True.
if DEBUG:
    CORS_ALLOWED_ORIGIN_REGEXES = [r"^http://(localhost|127\.0\.0\.1):\d+$"]

CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]

CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS") or CORS_ALLOWED_ORIGINS

# Durcissement activé dès qu'on quitte le mode debug.
if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "same-origin"
    X_FRAME_OPTIONS = "DENY"
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Nom affiché comme expéditeur : l'adresse technique peut être partagée
# avec un autre projet, le client doit reconnaître qui lui écrit.
NOM_BOUTIQUE = os.getenv("NOM_BOUTIQUE", "MONTR'OR").strip()

# Adresse de l'admin, rappelee dans les alertes de commande.
#
# Deduite d'ALLOWED_HOSTS plutot que saisie a part : une variable de plus,
# c'est une variable qu'on oublie de renseigner en ligne — et le lien renvoyait
# alors vers 127.0.0.1, l'ordinateur du destinataire. Ici, elle est juste par
# construction, partout ou le site tourne.
def _url_admin() -> str:
    manuel = os.getenv("URL_ADMIN", "").strip()
    if manuel:
        return manuel
    hote = next((h for h in ALLOWED_HOSTS if h not in ("localhost", "127.0.0.1", "*")), "")
    if hote:
        return f"https://{hote}/admin/"
    return "http://127.0.0.1:8000/admin/"


URL_ADMIN = _url_admin()

# E-mail : sert à confirmer l'adresse d'un client et surtout à lui permettre
# de récupérer son mot de passe. Sans SMTP configuré, Django écrit les
# messages dans la console : pratique en développement, désastreux en ligne —
# les codes de réinitialisation finiraient dans les journaux du serveur au
# lieu d'arriver chez le client, qui resterait dehors sans comprendre.
EMAIL_HOST = os.getenv("EMAIL_HOST", "").strip()
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "").strip()
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "") or (
    EMAIL_HOST_USER or "no-reply@localhost"
)
# Brevo passe par HTTPS et non par SMTP. C'est indispensable en ligne :
# l'offre gratuite de Render ferme les ports SMTP sortants (25, 465, 587)
# pour se prémunir des abus. Un envoi Gmail y échoue systématiquement sur
# « [Errno 101] Network is unreachable », quels que soient les identifiants.
# Le port 443, lui, reste ouvert.
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "").strip()

if BREVO_API_KEY:
    EMAIL_BACKEND = "shop.courriel_brevo.BackendBrevo"
elif EMAIL_HOST:
    EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
else:
    EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

if not BREVO_API_KEY and not EMAIL_HOST and not DEBUG:
    raise RuntimeError(
        "Aucun moyen d'envoyer un e-mail n'est configuré (ni BREVO_API_KEY ni "
        "EMAIL_HOST) : les codes de récupération de mot de passe et les "
        "alertes de commande s'écriraient dans les journaux du serveur au "
        "lieu de partir chez le destinataire."
    )

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "ERROR", "propagate": False},
    },
}
