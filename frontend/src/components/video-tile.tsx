import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import type { Product } from "@/lib/api";
import { formatFcfa } from "@/lib/site";

const CASCADE = ["", "revele-1", "revele-2", "revele-3"];

/**
 * Vignette vidéo de la vitrine animée.
 *
 * Les vidéos sont filmées au téléphone et pèsent 1 à 2 Mo : on ne charge que
 * la première image (`preload="metadata"`) et on ne lance la lecture que
 * lorsque la vignette entre à l'écran. Sur une connexion mobile ivoirienne,
 * lancer six vidéos d'un coup coûterait cher au visiteur pour rien.
 */
export function VitrineVideo({ product, index = 0 }: { product: Product; index?: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        setVisible(entry.isIntersecting);
        if (entry.isIntersecting) void el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const video = product.videos[0];
  if (!video) return null;

  return (
    <article className={["revele group", CASCADE[index % CASCADE.length]].join(" ")}>
      <Link
        to="/produit/$slug"
        params={{ slug: product.slug }}
        className="block overflow-hidden border border-border bg-card transition-colors hover:border-gold/60"
      >
        <div className="relative aspect-square overflow-hidden bg-muted/50">
          <video
            ref={ref}
            src={video}
            muted
            loop
            playsInline
            preload="metadata"
            aria-label={`Vidéo de la montre ${product.name}`}
            className="size-full object-cover"
          />
          {!visible && (
            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          )}
        </div>
        <div className="space-y-1.5 p-4">
          <p className="eyebrow">{product.brand || "Montre"}</p>
          <h3 className="truncate text-base">{product.name}</h3>
          {product.price !== null && (
            <p className="text-sm font-medium text-gold">{formatFcfa(product.price)}</p>
          )}
        </div>
      </Link>
    </article>
  );
}
