from django.contrib import admin
from django.http import JsonResponse
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static


def etat_service(_requete):
    """Point de controle a la racine du domaine.

    Sans lui, « / » renvoyait 404 : la surveillance exterieure (UptimeRobot)
    reveillait bien le serveur, mais le declarait en panne et envoyait de
    fausses alertes. Une reponse courte suffit, et evite d'avoir a retenir
    quelle adresse exacte surveiller.
    """
    return JsonResponse({
        "service": settings.NOM_BOUTIQUE,
        "etat": "ok",
        "api": "/api/",
        "admin": "/admin/",
    })


urlpatterns = [
    path("", etat_service, name="etat-service"),
    path("admin/", admin.site.urls),
    path("api/", include("shop.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
