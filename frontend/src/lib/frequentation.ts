import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";

import { API_URL } from "@/lib/api";

/** Marque, pour l'onglet en cours, qu'on a déjà signalé l'arrivée. */
const CLE = "montror:visite";

/**
 * Signale chaque page consultée à l'API, pour le compteur de fréquentation
 * visible dans l'administration.
 *
 * Le comptage se fait depuis le navigateur et non côté serveur : les robots
 * de surveillance frappent l'API toutes les cinq minutes sans exécuter de
 * JavaScript, et gonfleraient les chiffres d'un facteur dix.
 *
 * Rien d'identifiant n'est transmis — ni adresse, ni identifiant de suivi.
 * Le serveur n'apprend que « une page de plus a été vue aujourd'hui ».
 */
export function useFrequentation() {
  const chemin = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    // `sessionStorage` se vide à la fermeture de l'onglet : la même personne
    // qui revient demain est comptée comme une nouvelle visite, celle qui
    // navigue entre dix fiches ne l'est qu'une fois.
    let nouvelle = false;
    try {
      nouvelle = !sessionStorage.getItem(CLE);
      if (nouvelle) sessionStorage.setItem(CLE, "1");
    } catch {
      // Navigation privée stricte : on compte la page, pas la visite.
    }

    // `keepalive` pour que l'envoi survive si la personne quitte aussitôt.
    // L'échec est ignoré : un compteur ne doit jamais gêner la navigation.
    void fetch(`${API_URL}/visite/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nouvelle }),
      keepalive: true,
    }).catch(() => {});
  }, [chemin]);
}
