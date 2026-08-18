import type { ReactNode } from "react";
import { Children, isValidElement } from "react";

import { cn } from "@/lib/utils";

/**
 * Révélation au défilement, en CSS pur (`animation-timeline: view()`).
 *
 * Aucun JavaScript : le contenu part visible et l'animation ne fait que
 * l'accompagner. C'est volontaire — une version pilotée par `motion` sortait
 * du rendu serveur en `opacity: 0`, donc invisible tant que le script n'avait
 * pas tourné. Sur une connexion mobile lente, ça donnait une page blanche.
 *
 * `Reveal` pour un bloc, `RevealGroup` + `RevealItem` pour une grille dont les
 * enfants s'enchaînent légèrement en cascade.
 */

const CASCADE = ["", "revele-1", "revele-2", "revele-3"];

export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("revele", className)}>{children}</div>;
}

export function RevealGroup({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}

export function RevealItem({
  children,
  className,
  rang,
}: {
  children: ReactNode;
  className?: string;
  /** Position dans la grille : décale légèrement le départ de l'animation. */
  rang?: number;
}) {
  const decalage = CASCADE[(rang ?? 0) % CASCADE.length];
  return <div className={cn("revele", decalage, className)}>{children}</div>;
}

/** Applique la cascade automatiquement aux enfants d'une grille. */
export function enCascade(enfants: ReactNode) {
  return Children.map(enfants, (enfant, i) =>
    isValidElement(enfant) ? <RevealItem rang={i}>{enfant}</RevealItem> : enfant,
  );
}
