import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product } from "@/lib/api";
import { useProducts } from "@/lib/catalog";

/* ---------------- Theme ---------------- */

type ThemeCtx = { theme: "light" | "dark"; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ theme: "light", toggle: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

/* ---------------- Cart / Favorites / Orders ---------------- */

export type CartLine = { slug: string; qty: number };

/**
 * Trace locale d'une commande : uniquement de quoi la retrouver en un clic
 * sur la page Suivi. Le contenu et le statut font autorité côté Django.
 */
export type Order = {
  reference: string;
  phone: string;
  createdAt: string;
  total: number;
};

type ShopCtx = {
  cart: CartLine[];
  addToCart: (slug: string, qty?: number) => void;
  setQty: (slug: string, qty: number) => void;
  remove: (slug: string) => void;
  clearCart: () => void;
  count: number;
  subtotal: number;
  /** `price` est le prix unitaire figé de la ligne : jamais null, un produit
   *  « prix sur demande » ne peut pas entrer au panier. */
  detailed: { product: Product; qty: number; price: number }[];
  favorites: string[];
  toggleFavorite: (slug: string) => void;
  orders: Order[];
  addOrder: (order: Order) => void;
};

const ShopContext = createContext<ShopCtx | null>(null);

export function useShop() {
  const ctx = useContext(ShopContext);
  if (!ctx) throw new Error("useShop must be used inside ShopProvider");
  return ctx;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ShopProvider({ children }: { children: ReactNode }) {
  const products = useProducts();
  const [hydrated, setHydrated] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setCart(read<CartLine[]>("mo_cart", []));
    setFavorites(read<string[]>("mo_fav", []));
    setOrders(read<Order[]>("mo_orders", []));
    const stored = localStorage.getItem("mo_theme");
    const prefersDark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setTheme(prefersDark ? "dark" : "light");
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (hydrated) localStorage.setItem("mo_theme", theme);
  }, [theme, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem("mo_cart", JSON.stringify(cart));
  }, [cart, hydrated]);

  // Purge les lignes qui ne correspondent plus à rien (montre retirée du
  // catalogue, passée en « prix sur demande »). Le garde-fou `products.length`
  // évite de vider le panier quand l'API n'a simplement pas répondu.
  useEffect(() => {
    if (!hydrated || products.length === 0) return;
    setCart((prev) => {
      const valides = prev.filter((l) => {
        const p = products.find((x) => x.slug === l.slug);
        return p && p.price !== null;
      });
      return valides.length === prev.length ? prev : valides;
    });
  }, [hydrated, products]);
  useEffect(() => {
    if (hydrated) localStorage.setItem("mo_fav", JSON.stringify(favorites));
  }, [favorites, hydrated]);
  useEffect(() => {
    if (hydrated) localStorage.setItem("mo_orders", JSON.stringify(orders));
  }, [orders, hydrated]);

  const value = useMemo<ShopCtx>(() => {
    // Un produit disparu du catalogue ou passé en « prix sur demande » est
    // ignoré : il ne peut plus être commandé via le panier.
    const detailed = cart.flatMap((line) => {
      const product = products.find((p) => p.slug === line.slug);
      if (!product || product.price === null) return [];
      return [{ product, qty: line.qty, price: product.price }];
    });

    return {
      cart,
      detailed,
      // Compté sur `detailed`, pas sur `cart` : sinon la pastille annonce des
      // articles que la page panier n'affiche pas (produit retiré du catalogue).
      count: detailed.reduce((n, l) => n + l.qty, 0),
      subtotal: detailed.reduce((s, l) => s + l.price * l.qty, 0),
      addToCart: (slug, qty = 1) =>
        setCart((prev) => {
          const found = prev.find((l) => l.slug === slug);
          return found
            ? prev.map((l) => (l.slug === slug ? { ...l, qty: l.qty + qty } : l))
            : [...prev, { slug, qty }];
        }),
      setQty: (slug, qty) =>
        setCart((prev) =>
          qty <= 0
            ? prev.filter((l) => l.slug !== slug)
            : prev.map((l) => (l.slug === slug ? { ...l, qty } : l)),
        ),
      remove: (slug) => setCart((prev) => prev.filter((l) => l.slug !== slug)),
      clearCart: () => setCart([]),
      favorites,
      toggleFavorite: (slug) =>
        setFavorites((prev) =>
          prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
        ),
      orders,
      addOrder: (order) => setOrders((prev) => [order, ...prev]),
    };
  }, [cart, favorites, orders, products]);

  return (
    <ThemeContext.Provider
      value={{ theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) }}
    >
      <ShopContext.Provider value={value}>{children}</ShopContext.Provider>
    </ThemeContext.Provider>
  );
}

/** Miroir exact de Order.ETAPES_SUIVI côté Django ; `etape_index` pointe dedans. */
export const ORDER_STEPS = [
  "Commande reçue",
  "Confirmée",
  "Expédiée",
  "Livrée",
];
