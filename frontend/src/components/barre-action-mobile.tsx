import { MessageCircle, ShoppingBag } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { toast } from "sonner";

import type { Product } from "@/lib/api";
import { useSettings } from "@/lib/catalog";
import { useShop } from "@/lib/shop";
import { formatFcfa, waLink } from "@/lib/site";
import { Button } from "@/components/ui/button";

/**
 * Barre d'achat qui apparaît en bas d'écran dès que les boutons principaux
 * sortent du champ de vision. Sur mobile, la fiche est longue : sans elle, il
 * faut remonter pour commander.
 */
export function BarreActionMobile({
  product,
  zoneActions,
  message,
}: {
  product: Product;
  zoneActions: RefObject<HTMLDivElement | null>;
  message: string;
}) {
  const { addToCart } = useShop();
  const settings = useSettings();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const cible = zoneActions.current;
    if (!cible) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry?.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(cible);
    return () => observer.disconnect();
  }, [zoneActions]);

  return (
    <div
      // La classe `barre-achat-visible` sert de repère au bouton WhatsApp
      // flottant, qui s'efface pour ne pas doubler celui d'ici.
      className={[
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur",
        "px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:hidden",
        "transition-all duration-300",
        visible
          ? "barre-achat-visible translate-y-0 opacity-100"
          : "pointer-events-none translate-y-full opacity-0",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{product.name}</p>
          <p className="text-base font-semibold text-gold">
            {product.price === null ? "Prix sur demande" : formatFcfa(product.price)}
          </p>
        </div>

        {/* Une seule action ici. WhatsApp reste accessible par le bouton
            flottant, qui se décale au-dessus de cette barre. */}
        {product.canBuy ? (
          <Button
            className="h-12 shrink-0 rounded-full px-6"
            onClick={() => {
              addToCart(product.slug);
              toast.success("Ajouté au panier", { description: product.name });
            }}
          >
            <ShoppingBag className="mr-2 size-4" />
            Commander
          </Button>
        ) : (
          <Button
            asChild
            className="h-12 shrink-0 rounded-full bg-whatsapp px-6 text-whatsapp-foreground hover:bg-whatsapp/90"
          >
            <a href={waLink(settings.whatsapp, message)} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 size-4" />
              Demander le prix
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
