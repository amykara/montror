import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  ChevronRight,
  Handshake,
  Heart,
  MessageCircle,
  Package,
  Play,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { fetchProduct } from "@/lib/api";
import { useProducts, useSettings, useZones } from "@/lib/catalog";
import { formatFcfa, waLink } from "@/lib/site";
import { useShop } from "@/lib/shop";
import { ProductCard } from "@/components/product-card";
import { PaiementInfo } from "@/components/paiement-info";
import { BarreActionMobile } from "@/components/barre-action-mobile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/produit/$slug")({
  // Rechargé à chaque visite : le prix et le stock affichés sont ceux de Django.
  loader: async ({ params }) => {
    const product = await fetchProduct(params.slug);
    if (!product) throw notFound();
    return { product };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [{ title: "Montre indisponible — MONTR'OR" }, { name: "robots", content: "noindex" }],
      };
    }
    const { product } = loaderData;
    const prix = product.price === null ? "Prix sur demande" : formatFcfa(product.price);
    const title = `${product.name} — ${prix} | MONTR'OR`;
    return {
      meta: [
        { title },
        { name: "description", content: product.description },
        { property: "og:title", content: title },
        { property: "og:description", content: product.description },
      ],
    };
  },
  component: ProductPage,
});

function ProductPage() {
  const { product } = Route.useLoaderData();
  const { addToCart, favorites, toggleFavorite } = useShop();
  const products = useProducts();
  const settings = useSettings();
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const zoneActions = useRef<HTMLDivElement>(null);
  const isFav = favorites.includes(product.slug);

  const zones = useZones();

  // Galerie mixte. Pour une pièce filmée mais jamais photographiée, la vidéo
  // passe en premier : c'est le seul vrai visuel dont on dispose.
  const media: { type: "image" | "video"; src: string }[] = product.hasRealPhoto
    ? [
        ...product.images.map((src) => ({ type: "image" as const, src })),
        ...product.videos.map((src) => ({ type: "video" as const, src })),
      ]
    : [
        ...product.videos.map((src) => ({ type: "video" as const, src })),
        ...product.images.map((src) => ({ type: "image" as const, src })),
      ];
  const courant = media[active] ?? media[0]!;
  const similar = products
    .filter(
      (p) => p.id !== product.id && (p.style === product.style || p.category === product.category),
    )
    .slice(0, 4);

  const waMessage = product.priceOnRequest
    ? `Bonjour, je suis intéressé par la montre ${product.name} (Réf. ${product.ref}). Quel est son prix ?`
    : `Bonjour, je suis intéressé par la montre ${product.name} (Référence ${product.ref}). Est-elle disponible ?`;

  const messageNegociation =
    `Bonjour, je suis intéressé par la montre ${product.name} (${product.ref}) affichée à ` +
    `${product.price !== null ? formatFcfa(product.price) : "—"}. ` +
    `Est-il possible d'obtenir une meilleure offre ?`;

  const specs = product.specs;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/" className="hover:text-foreground">
          Accueil
        </Link>
        <ChevronRight className="size-3" />
        <Link to="/catalogue" className="hover:text-foreground">
          Catalogue
        </Link>
        <ChevronRight className="size-3" />
        <span className="truncate text-foreground">{product.name}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        {/* Galerie */}
        <div>
          {courant.type === "video" ? (
            <video
              key={courant.src}
              src={courant.src}
              controls
              muted
              autoPlay
              loop
              playsInline
              preload="metadata"
              className="aspect-square w-full border border-border bg-muted/40 object-cover"
            />
          ) : (
            <button
              onClick={() => setZoom(true)}
              className="block w-full cursor-zoom-in overflow-hidden border border-border bg-muted/40"
              aria-label="Agrandir l'image"
            >
              <motion.img
                key={active}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                src={courant.src}
                alt={product.name}
                width={1024}
                height={1024}
                className="aspect-square w-full object-cover transition-transform duration-700 hover:scale-105"
              />
            </button>
          )}

          {media.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-3">
              {media.map((m, i) => (
                <button
                  key={m.src}
                  onClick={() => setActive(i)}
                  aria-label={m.type === "video" ? "Voir la vidéo" : `Voir la photo ${i + 1}`}
                  className={cn(
                    "relative size-20 overflow-hidden border transition-colors",
                    i === active ? "border-gold" : "border-border hover:border-muted-foreground",
                  )}
                >
                  {m.type === "video" ? (
                    <>
                      {/* preload="metadata" : on ne télécharge que la première image */}
                      <video src={m.src} muted playsInline preload="metadata" className="size-full object-cover" />
                      <span className="absolute inset-0 grid place-items-center bg-black/30">
                        <Play className="size-5 fill-white text-white" />
                      </span>
                    </>
                  ) : (
                    <img
                      src={m.src}
                      alt=""
                      loading="lazy"
                      width={1024}
                      height={1024}
                      className="size-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Infos */}
        <div>
          <p className="eyebrow">{product.brand}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{product.name}</h1>

          <div className="mt-5 flex flex-wrap items-baseline gap-3">
            {product.price === null ? (
              <span className="text-2xl font-medium text-whatsapp">Prix sur demande</span>
            ) : (
              <>
                <span className="text-3xl font-semibold text-gold">{formatFcfa(product.price)}</span>
                {product.oldPrice && product.oldPrice > product.price && (
                  <>
                    <span className="text-base text-muted-foreground line-through">
                      {formatFcfa(product.oldPrice)}
                    </span>
                    <span className="bg-gold px-2 py-0.5 text-xs font-semibold text-gold-foreground">
                      −{Math.round((1 - product.price / product.oldPrice) * 100)}%
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          {product.price !== null && product.oldPrice && product.oldPrice > product.price && (
            <p className="mt-2 text-sm font-medium text-whatsapp">
              Économisez {formatFcfa(product.oldPrice - product.price)}
            </p>
          )}

          {product.inStock && product.stock > 0 && product.stock <= 3 && (
            <p className="mt-2 text-sm font-medium text-destructive">
              Plus que {product.stock} en stock — commandez vite
            </p>
          )}

          {/* Actions juste sous le prix : le visiteur ne doit pas parcourir la
              fiche entière pour trouver comment acheter. */}
          <div ref={zoneActions} className="mt-6">
            {product.priceOnRequest ? (
              <>
                <Button
                  asChild
                  size="lg"
                  className="h-14 w-full rounded-xl bg-whatsapp text-base text-whatsapp-foreground shadow-elegant transition-transform hover:scale-[1.01] hover:bg-whatsapp/90"
                >
                  <a href={waLink(settings.whatsapp, waMessage)} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-2 size-5" />
                    Nous contacter sur WhatsApp
                  </a>
                </Button>
                <p className="mt-3 text-sm text-muted-foreground">
                  Le prix de cette pièce se fixe avec nous, selon la quantité et le modèle exact.
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    size="lg"
                    disabled={!product.canBuy}
                    className="h-14 rounded-xl text-base shadow-elegant transition-transform hover:scale-[1.01]"
                    onClick={() => {
                      addToCart(product.slug);
                      toast.success("Ajouté au panier", { description: product.name });
                    }}
                  >
                    <ShoppingBag className="mr-2 size-5" />
                    Commander
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    className="h-14 rounded-xl bg-whatsapp text-base text-whatsapp-foreground shadow-elegant transition-transform hover:scale-[1.01] hover:bg-whatsapp/90"
                  >
                    <a href={waLink(settings.whatsapp, waMessage)} target="_blank" rel="noreferrer">
                      <MessageCircle className="mr-2 size-5" />
                      Discuter sur WhatsApp
                    </a>
                  </Button>
                </div>

                {product.negotiable && (
                  <Button
                    asChild
                    variant="outline"
                    size="lg"
                    className="mt-3 h-12 w-full rounded-xl border-gold text-base text-gold transition-colors hover:bg-gold-soft"
                  >
                    <a
                      href={waLink(settings.whatsapp, messageNegociation)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Handshake className="mr-2 size-5" />
                      Négocier le prix avec notre équipe
                    </a>
                  </Button>
                )}

                <PaiementInfo product={product} />
              </>
            )}

            <button
              onClick={() => toggleFavorite(product.slug)}
              className="mt-4 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Heart className={cn("size-4", isFav && "fill-gold text-gold")} />
              {isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>
              Réf. <span className="text-foreground">{product.ref}</span>
            </span>
            {!product.priceOnRequest && (
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  product.inStock ? "text-whatsapp" : "text-destructive",
                )}
              >
                {product.inStock ? <Check className="size-4" /> : <X className="size-4" />}
                {product.inStock ? "En stock" : "Rupture de stock"}
              </span>
            )}
          </div>

          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>

          {product.fonctions.length > 0 && (
            <div className="mt-8">
              <h2 className="eyebrow">Ce que fait cette montre</h2>
              <ul className="mt-4 space-y-2 text-sm">
                {product.fonctions.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-gold" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {product.livreAvec && (
                <p className="mt-4 flex items-start gap-2.5 text-sm text-muted-foreground">
                  <Package className="mt-0.5 size-4 shrink-0 text-gold" />
                  <span>Livrée avec : {product.livreAvec}</span>
                </p>
              )}
            </div>
          )}

          {specs.length > 0 && (
            <div className="mt-8">
              <h2 className="eyebrow">Caractéristiques</h2>
              <dl className="mt-4 divide-y divide-border border-y border-border">
                {specs.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-2 gap-4 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <div className="mt-8 space-y-3 border border-border bg-muted/40 p-5 text-sm">
            {zones.length > 0 && (
              <p className="flex items-start gap-2.5">
                <Truck className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  {zones.map((z) => (
                    <span key={z.id} className="block">
                      <strong className="font-medium">{z.commune} :</strong> {z.delai_estime} —{" "}
                      {formatFcfa(z.tarif_fcfa)}
                    </span>
                  ))}
                </span>
              </p>
            )}
            <p className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                Paiement à la livraison disponible
                {product.garantie && ` · Garantie ${product.garantie}`}
              </span>
            </p>
          </div>

        </div>
      </div>

      {similar.length > 0 && (
        <section className="mt-20">
          <p className="eyebrow">Vous aimerez aussi</p>
          <h2 className="mt-2 text-3xl">Produits similaires</h2>
          <div className="gold-rule mt-4" />
          <div className="mt-8 grid grid-cols-2 gap-5 lg:grid-cols-4">
            {similar.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {zoom && (
        <div
          className="fixed inset-0 z-[60] grid cursor-zoom-out place-items-center bg-black/90 p-4"
          onClick={() => setZoom(false)}
        >
          <img
            src={courant.src}
            alt={product.name}
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      <BarreActionMobile product={product} zoneActions={zoneActions} message={waMessage} />
    </div>
  );
}
