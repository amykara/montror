import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";

import type { Product } from "@/lib/api";
import { formatFcfa } from "@/lib/site";
import { useShop } from "@/lib/shop";
import { cn } from "@/lib/utils";

/** En dessous de ce seuil, on signale que le stock file. */
const STOCK_FAIBLE = 3;

/** Léger décalage d'entrée d'une carte à l'autre dans une grille. */
const CASCADE = ["", "revele-1", "revele-2", "revele-3"];

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { favorites, toggleFavorite } = useShop();
  const isFav = favorites.includes(product.slug);

  const remise =
    product.price !== null && product.oldPrice && product.oldPrice > product.price
      ? { pourcent: Math.round((1 - product.price / product.oldPrice) * 100), gain: product.oldPrice - product.price }
      : null;

  const stockFaible = product.inStock && product.stock > 0 && product.stock <= STOCK_FAIBLE;

  return (
    <article
      // La révélation est portée par le CSS : la carte reste visible même
      // avant l'exécution du JavaScript.
      className={cn("revele group relative flex flex-col", CASCADE[index % CASCADE.length])}
    >
      <Link
        to="/produit/$slug"
        params={{ slug: product.slug }}
        className="carte-produit flex flex-1 flex-col border border-border bg-card"
      >
        <div className="relative aspect-square overflow-hidden bg-muted/40">
          <img
            src={product.images[0]}
            alt={product.name}
            loading="lazy"
            width={1024}
            height={1024}
            className="size-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.07]"
          />
          {/* Voile qui se lève au survol : donne du relief sans masquer. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/12 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          />
          {product.images[1] && (
            <img
              src={product.images[1]}
              alt=""
              loading="lazy"
              width={1024}
              height={1024}
              className="absolute inset-0 size-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          )}

          <div className="absolute left-0 top-3 flex flex-col items-start gap-1.5">
            {remise && (
              <span className="bg-gold px-2.5 py-1 text-[0.68rem] font-semibold tracking-[0.08em] text-gold-foreground">
                −{remise.pourcent}%
              </span>
            )}
            {!product.inStock && !product.priceOnRequest && (
              <span className="bg-foreground px-2.5 py-1 text-[0.62rem] font-medium uppercase tracking-[0.12em] text-background">
                Rupture
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-1 p-5">
          <p className="eyebrow truncate">{product.brand || "Montre"}</p>
          <h3 className="line-clamp-2 text-[0.98rem] leading-snug transition-colors duration-300 group-hover:text-gold">
            {product.name}
          </h3>

          {/* Sans prix fixé, la carte n'affiche rien de plus : le visiteur
              découvre les modalités en ouvrant la fiche. */}
          <div className="mt-auto pt-2.5">
            {product.price !== null && (
              <>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="prix text-lg font-semibold text-gold">
                    {formatFcfa(product.price)}
                  </span>
                  {remise && (
                    <span className="text-xs text-muted-foreground line-through">
                      {formatFcfa(product.oldPrice!)}
                    </span>
                  )}
                </div>
                {remise && (
                  <p className="mt-0.5 text-xs font-medium text-whatsapp">
                    Économisez {formatFcfa(remise.gain)}
                  </p>
                )}
              </>
            )}

            {stockFaible && (
              <p className="mt-1.5 text-xs font-medium text-destructive">
                Plus que {product.stock} en stock
              </p>
            )}
          </div>
        </div>
      </Link>

      {/* Hors du <Link> : un bouton ne s'imbrique pas dans un lien. */}
      <button
        onClick={() => toggleFavorite(product.slug)}
        aria-label={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
        className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-background/85 backdrop-blur transition-colors hover:bg-background"
      >
        <Heart className={cn("size-4", isFav && "fill-gold text-gold")} />
      </button>

    </article>
  );
}
