import { Banknote, HandCoins, Smartphone } from "lucide-react";

import type { Product } from "@/lib/api";
import { formatFcfa } from "@/lib/site";

/**
 * Modes de règlement possibles pour une pièce. Trois cas :
 * tout à la réception, tout d'avance en Mobile Money, ou un acompte avant
 * expédition quand la boutique en exige un (champ `acompte_pourcent`).
 */
export function PaiementInfo({ product }: { product: Product }) {
  if (product.price === null) return null;

  const acompte =
    product.acomptePourcent > 0
      ? Math.round((product.price * product.acomptePourcent) / 100)
      : 0;

  return (
    <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4">
      <p className="eyebrow">Comment payer</p>
      <ul className="mt-3 space-y-2.5 text-sm">
        {acompte > 0 ? (
          <li className="flex items-start gap-2.5">
            <HandCoins className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              <strong className="font-medium">Acompte de {product.acomptePourcent} %</strong> —{" "}
              {formatFcfa(acompte)} à la commande, le solde de{" "}
              {formatFcfa(product.price - acompte)} à la réception.
            </span>
          </li>
        ) : (
          <li className="flex items-start gap-2.5">
            <Banknote className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              <strong className="font-medium">À la livraison</strong> — vous réglez le livreur
              après avoir vérifié la montre.
            </span>
          </li>
        )}
        <li className="flex items-start gap-2.5">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-gold" />
          <span>
            <strong className="font-medium">D'avance</strong> — Wave, Orange Money ou MTN Money,
            si vous préférez régler tout de suite.
          </span>
        </li>
      </ul>
    </div>
  );
}
