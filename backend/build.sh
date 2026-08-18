#!/usr/bin/env bash
# Script de construction exécuté par Render à chaque déploiement.
# `set -o errexit` : si une étape échoue, le déploiement échoue au lieu de
# mettre en ligne une version à moitié installée.
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

# Fichiers statiques de l'admin Django, servis ensuite par WhiteNoise.
python manage.py collectstatic --no-input

# Les migrations tournent ici plutôt qu'au démarrage : si elles échouaient,
# le serveur redémarrerait en boucle sans qu'on sache pourquoi.
python manage.py migrate
