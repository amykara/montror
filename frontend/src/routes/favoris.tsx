import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { useProducts } from "@/lib/catalog";
import { useShop } from "@/lib/shop";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/favoris")({
  head: () => ({
    meta: [
      { title: "Mes montres favorites — MONTR'OR" },
      {
        name: "description",
        content: "Retrouvez les montres que vous avez mises de côté chez MONTR'OR.",
      },
      { property: "og:title", content: "Mes favoris — MONTR'OR" },
      { property: "og:description", content: "Vos montres mises de côté, prêtes à commander." },
    ],
  }),
  component: Favoris,
});

function Favoris() {
  const { favorites } = useShop();
  const products = useProducts();
  const list = products.filter((p) => favorites.includes(p.slug));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Votre sélection</p>
      <h1 className="mt-2 text-4xl">Favoris</h1>
      <div className="gold-rule mt-4" />

      {list.length === 0 ? (
        <div className="mt-16 text-center">
          <Heart className="mx-auto size-10 text-muted-foreground" />
          <p className="mt-6 text-sm text-muted-foreground">
            Aucun favori pour l'instant. Touchez le cœur sur une montre pour la retrouver ici.
          </p>
          <Button asChild size="lg" className="mt-8 rounded-xl">
            <Link to="/catalogue">Voir la collection</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {list.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
