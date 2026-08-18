import { useMemo } from "react";

import { useProducts } from "@/lib/catalog";

/**
 * Bandeau des marques du catalogue, en défilement continu sous l'en-tête.
 *
 * La liste vient des produits réellement en base : ajouter une marque dans
 * l'admin la fait apparaître ici. Le contenu est doublé pour que la boucle
 * soit sans couture, et la moitié dupliquée est masquée aux lecteurs d'écran.
 */
export function RubanMarques() {
  const products = useProducts();
  const marques = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(),
    [products],
  );

  if (marques.length < 4) return null;

  return (
    <div className="overflow-hidden border-b border-border bg-muted/30 py-2.5">
      <div className="ruban-marques gap-12 px-6">
        {[...marques, ...marques].map((m, i) => (
          <span
            key={`${m}-${i}`}
            aria-hidden={i >= marques.length}
            className="shrink-0 font-display text-base tracking-[0.22em] text-muted-foreground/70 transition-colors duration-300 hover:text-gold"
          >
            {m.toUpperCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
