import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { DeliveryZone, Faq, Product, Review, SiteSettings } from "@/lib/api";

/**
 * Données partagées par tout le site, chargées par le loader de la route racine
 * à chaque requête. Rien n'est figé au démarrage du serveur : une montre ajoutée
 * dans l'admin Django apparaît au rechargement de la page.
 */
export type SiteData = {
  products: Product[];
  zones: DeliveryZone[];
  settings: SiteSettings;
  reviews: Review[];
  faqs: Faq[];
  /** Vrai si l'API Django n'a pas répondu : le site s'affiche en mode dégradé. */
  apiIndisponible: boolean;
};

const SiteDataContext = createContext<SiteData | null>(null);

export function SiteDataProvider({ value, children }: { value: SiteData; children: ReactNode }) {
  return <SiteDataContext.Provider value={value}>{children}</SiteDataContext.Provider>;
}

function useSiteData() {
  const ctx = useContext(SiteDataContext);
  if (!ctx) throw new Error("useSiteData doit être utilisé dans <SiteDataProvider>");
  return ctx;
}

export function useProducts() {
  return useSiteData().products;
}

export function useSettings() {
  return useSiteData().settings;
}

export function useZones() {
  return useSiteData().zones;
}

export function useReviews() {
  return useSiteData().reviews;
}

export function useFaqs() {
  return useSiteData().faqs;
}

export function useApiIndisponible() {
  return useSiteData().apiIndisponible;
}

export function useProduct(slug: string) {
  const products = useProducts();
  return useMemo(() => products.find((p) => p.slug === slug), [products, slug]);
}

/** Valeurs distinctes triées par nombre d'occurrences décroissant, puis alphabétiquement. */
function parFrequence(valeurs: string[]) {
  const comptes = new Map<string, number>();
  for (const v of valeurs) {
    if (v) comptes.set(v, (comptes.get(v) ?? 0) + 1);
  }
  return [...comptes.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([v]) => v);
}

/** Valeurs de filtres déduites du catalogue réel, jamais d'une liste en dur. */
export function useFacets() {
  const products = useProducts();
  return useMemo(
    () => ({
      categories: [...new Set(products.map((p) => p.category).filter(Boolean))].sort(),
      styles: [...new Set(products.map((p) => p.style).filter(Boolean))].sort(),
      brands: [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(),
      straps: [...new Set(products.map((p) => p.strap).filter(Boolean))].sort(),
      // Les couleurs du catalogue réel sont très descriptives (« Acier argenté /
      // cadran noir, touches rouges ») : on remonte les plus fréquentes d'abord.
      colors: parFrequence(products.map((p) => p.color)),
    }),
    [products],
  );
}

/**
 * Vignettes de l'accueil : une par catégorie réellement présente en base,
 * illustrée par la première photo trouvée. Ajouter une catégorie dans
 * l'admin ajoute sa vignette, sans toucher au code.
 */
export function useCategoryTiles(limite = 4) {
  const products = useProducts();
  return useMemo(() => {
    const parCategorie = new Map<string, string>();
    for (const p of products) {
      if (p.category && !parCategorie.has(p.category)) {
        parCategorie.set(p.category, p.images[0]!);
      }
    }
    return [...parCategorie.entries()]
      .slice(0, limite)
      .map(([label, image]) => ({ label, value: label, image }));
  }, [products, limite]);
}

/** Réglages de repli si Django est injoignable : le site reste affichable. */
export const SETTINGS_FALLBACK: SiteSettings = {
  nom: "MONTR'OR",
  slogan: "L'élégance accessible",
  telephone_affichage: "",
  telephone_tel: "",
  whatsapp: "",
  email: "",
  adresse: "",
  horaires: "",
  tarif_point_relais_fcfa: 800,
};
