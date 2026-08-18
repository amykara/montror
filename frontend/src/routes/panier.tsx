import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useZones } from "@/lib/catalog";
import { useShop } from "@/lib/shop";
import { formatFcfa } from "@/lib/site";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/panier")({
  head: () => ({
    meta: [
      { title: "Mon panier — MONTR'OR" },
      {
        name: "description",
        content: "Vérifiez votre sélection de montres, ajustez les quantités et passez commande.",
      },
      { property: "og:title", content: "Mon panier — MONTR'OR" },
      {
        property: "og:description",
        content: "Votre sélection de montres, prête à être commandée.",
      },
    ],
  }),
  component: Panier,
});

function Panier() {
  const { detailed, setQty, remove, subtotal } = useShop();
  const zones = useZones();
  // Estimation avec la zone la moins chère ; le tarif exact est choisi au checkout.
  const zoneEstimee = zones.length
    ? zones.reduce((min, z) => (z.tarif_fcfa < min.tarif_fcfa ? z : min))
    : null;
  const shipping = detailed.length && zoneEstimee ? zoneEstimee.tarif_fcfa : 0;

  if (detailed.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <ShoppingBag className="mx-auto size-10 text-muted-foreground" />
        <h1 className="mt-6 text-3xl">Votre panier est vide</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Parcourez la collection et trouvez la montre qui vous ressemble.
        </p>
        <Button asChild size="lg" className="mt-8 rounded-xl">
          <Link to="/catalogue">Découvrir la collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Étape 1 / 3</p>
      <h1 className="mt-2 text-4xl">Mon panier</h1>
      <div className="gold-rule mt-4" />

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="divide-y divide-border border-y border-border">
          {detailed.map(({ product, qty, price }) => (
            <li key={product.slug} className="grid grid-cols-[88px_minmax(0,1fr)] gap-4 py-5">
              <Link to="/produit/$slug" params={{ slug: product.slug }} className="shrink-0">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className="size-22 aspect-square w-full border border-border object-cover"
                />
              </Link>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="eyebrow">{product.brand}</p>
                    <Link
                      to="/produit/$slug"
                      params={{ slug: product.slug }}
                      className="block truncate text-base hover:text-gold"
                    >
                      {product.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">Réf. {product.ref}</p>
                  </div>
                  <button
                    onClick={() => remove(product.slug)}
                    aria-label="Supprimer"
                    className="grid size-8 shrink-0 place-items-center text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center border border-border">
                    <button
                      onClick={() => setQty(product.slug, qty - 1)}
                      aria-label="Diminuer"
                      className="grid size-9 place-items-center hover:bg-muted"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-9 text-center text-sm">{qty}</span>
                    <button
                      onClick={() => setQty(product.slug, qty + 1)}
                      aria-label="Augmenter"
                      className="grid size-9 place-items-center hover:bg-muted"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <span className="text-sm font-medium">{formatFcfa(price * qty)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <aside className="h-fit border border-border bg-muted/40 p-6">
          <h2 className="text-xl">Résumé</h2>
          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Sous-total</dt>
              <dd>{formatFcfa(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">
                Livraison{zoneEstimee ? ` (${zoneEstimee.commune})` : ""}
              </dt>
              <dd>{formatFcfa(shipping)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-3 text-base font-medium">
              <dt>Total</dt>
              <dd className="text-gold">{formatFcfa(subtotal + shipping)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Les frais définitifs sont calculés selon votre zone à l'étape suivante.
          </p>
          <Button asChild size="lg" className="mt-6 h-12 w-full rounded-xl">
            <Link to="/checkout">Commander</Link>
          </Button>
          <Button asChild variant="outline" className="mt-3 h-12 w-full rounded-xl">
            <Link to="/catalogue">Continuer les achats</Link>
          </Button>
        </aside>
      </div>
    </div>
  );
}
