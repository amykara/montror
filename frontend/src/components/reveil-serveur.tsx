import { useRouter } from "@tanstack/react-router";
import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fetchSettings } from "@/lib/api";

/**
 * Bandeau affiché quand l'API n'a pas répondu au chargement de la page.
 *
 * La cause de loin la plus fréquente n'est pas une panne : l'hébergement
 * gratuit met le serveur en veille après 15 minutes sans visite, et le
 * premier visiteur attend son réveil. Annoncer « indisponible » serait donc
 * faux et ferait fuir un client qui n'avait qu'à patienter.
 *
 * On explique, on réessaie seul, et on recharge la page dès que ça répond —
 * sans que le visiteur ait à faire quoi que ce soit.
 */

/** Assez pour couvrir un réveil (≈ 50 s) sans marteler l'API indéfiniment. */
const TENTATIVES_MAX = 20;
const INTERVALLE = 4_000;

export function ReveilServeur() {
  const router = useRouter();
  const [tentatives, setTentatives] = useState(0);
  const [abandonne, setAbandonne] = useState(false);
  // Empêche deux vérifications simultanées si un rendu se déclenche entre-temps.
  const enCours = useRef(false);

  useEffect(() => {
    if (abandonne) return;

    const verifier = async () => {
      if (enCours.current) return;
      enCours.current = true;
      try {
        await fetchSettings();
        // L'API répond : on redemande les données de la page. Le bandeau
        // disparaît de lui-même puisque `apiIndisponible` repasse à faux.
        await router.invalidate();
      } catch {
        setTentatives((n) => {
          if (n + 1 >= TENTATIVES_MAX) setAbandonne(true);
          return n + 1;
        });
      } finally {
        enCours.current = false;
      }
    };

    const minuteur = setTimeout(verifier, INTERVALLE);
    return () => clearTimeout(minuteur);
  }, [tentatives, abandonne, router]);

  const reessayer = () => {
    setAbandonne(false);
    setTentatives(0);
  };

  if (abandonne) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 bg-muted px-4 py-3 text-center text-sm">
        <span className="text-muted-foreground">
          Le catalogue ne répond toujours pas. Écrivez-nous sur WhatsApp, nous prenons
          votre commande directement.
        </span>
        <button
          onClick={reessayer}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs transition-colors hover:border-gold hover:text-gold"
        >
          <RefreshCw className="size-3" />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2.5 bg-gold-soft px-4 py-2.5 text-center text-sm text-gold">
      <Loader2 className="size-4 shrink-0 animate-spin" />
      <span>
        Chargement du catalogue…{" "}
        <span className="text-muted-foreground">
          le serveur se réveille, quelques secondes.
        </span>
      </span>
    </div>
  );
}
