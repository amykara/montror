import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useFacets, useProducts } from "@/lib/catalog";
import { formatFcfa } from "@/lib/site";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SearchParams = { filtre?: string | undefined; genre?: string | undefined; q?: string | undefined };

export const Route = createFileRoute("/catalogue")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    filtre: typeof search["filtre"] === "string" ? search["filtre"] : undefined,
    genre: typeof search["genre"] === "string" ? search["genre"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Catalogue de montres homme & femme — MONTR'OR" },
      {
        name: "description",
        content:
          "Filtrez notre collection de montres : homme, femme, luxe, sport, classique. Prix, marque, bracelet, couleur et disponibilité.",
      },
      { property: "og:title", content: "Catalogue de montres — MONTR'OR" },
      {
        property: "og:description",
        content: "Toutes nos montres, filtrables par style, marque, prix et disponibilité.",
      },
    ],
  }),
  component: Catalogue,
});

/**
 * Groupe de cases à cocher. Les valeurs viennent du catalogue réel et peuvent
 * être nombreuses (une quarantaine de nuances de couleur) : on n'en montre
 * qu'un extrait, dépliable, plus les valeurs déjà cochées.
 */
function Group({
  title,
  options,
  selected,
  onToggle,
  apercu = 8,
}: {
  title: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  apercu?: number;
}) {
  const [deplie, setDeplie] = useState(false);
  if (options.length === 0) return null;

  const visibles =
    deplie || options.length <= apercu
      ? options
      : [...new Set([...options.slice(0, apercu), ...selected.filter((s) => options.includes(s))])];

  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <div className="mt-3 space-y-2.5">
        {visibles.map((o) => (
          <div key={o} className="flex items-start gap-2.5">
            <Checkbox
              id={`${title}-${o}`}
              className="mt-0.5 shrink-0"
              checked={selected.includes(o)}
              onCheckedChange={() => onToggle(o)}
            />
            <Label htmlFor={`${title}-${o}`} className="text-sm font-normal leading-snug">
              {o}
            </Label>
          </div>
        ))}
      </div>
      {options.length > apercu && (
        <button
          type="button"
          onClick={() => setDeplie((v) => !v)}
          className="mt-3 text-xs uppercase tracking-[0.12em] text-gold hover:underline"
        >
          {deplie ? "Voir moins" : `+ ${options.length - visibles.length} autres`}
        </button>
      )}
    </div>
  );
}

/** Plafond du curseur de prix : arrondi au millier au-dessus de la montre la plus chère. */
function plafondPrix(prix: (number | null)[]) {
  const connus = prix.filter((p): p is number => p !== null);
  if (connus.length === 0) return 150000;
  return Math.ceil(Math.max(...connus) / 1000) * 1000;
}

function Catalogue() {
  const { filtre, genre, q } = Route.useSearch();
  const products = useProducts();
  const { categories, styles, brands, straps, colors } = useFacets();
  // Les catégories et styles viennent de la base : ajouter « Chronographes »
  // dans l'admin l'ajoute ici, sans toucher au code.
  const CATEGORIES = useMemo(() => [...categories, ...styles], [categories, styles]);
  const initial = [filtre, genre].filter(Boolean) as string[];

  const [query, setQuery] = useState(q ?? "");
  const [cats, setCats] = useState<string[]>(initial);
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [strapSel, setStrapSel] = useState<string[]>([]);
  const [colorSel, setColorSel] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const plafond = useMemo(() => plafondPrix(products.map((p) => p.price)), [products]);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const prixMax = maxPrice ?? plafond;
  const [sort, setSort] = useState("popularite");
  const [showFilters, setShowFilters] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    let list = products.filter((p) => {
      if (term) {
        const haystack =
          `${p.name} ${p.brand} ${p.ref} ${p.style} ${p.category} ${p.color}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (cats.length && !cats.some((c) => p.category === c || p.style === c)) return false;
      if (brandSel.length && !brandSel.includes(p.brand)) return false;
      if (strapSel.length && !strapSel.includes(p.strap)) return false;
      if (colorSel.length && !colorSel.includes(p.color)) return false;
      if (inStockOnly && !p.inStock) return false;
      // Un produit sans prix reste visible quel que soit le curseur : il n'a
      // pas de prix à comparer.
      if (p.price !== null && p.price > prixMax) return false;
      return true;
    });

    // Les produits « prix sur demande » sont renvoyés en fin de tri par prix.
    const parPrix = (a: number | null, b: number | null, croissant: boolean) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return croissant ? a - b : b - a;
    };

    list = [...list];
    if (sort === "prix-asc") list.sort((a, b) => parPrix(a.price, b.price, true));
    else if (sort === "prix-desc") list.sort((a, b) => parPrix(a.price, b.price, false));
    else if (sort === "nouveautes") list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else {
      // Vitrine par défaut : les pièces prêtes à vendre (photo + prix) d'abord,
      // les « prix sur demande » et les fiches sans visuel en fin de liste.
      const vendable = (p: (typeof list)[number]) =>
        (p.price !== null ? 2 : 0) + (p.images[0]?.startsWith("data:") ? 0 : 1);
      list.sort((a, b) => vendable(b) - vendable(a) || b.popularity - a.popularity);
    }
    return list;
  }, [products, query, cats, brandSel, strapSel, colorSel, inStockOnly, prixMax, sort]);

  const activeCount =
    cats.length + brandSel.length + strapSel.length + colorSel.length + (inStockOnly ? 1 : 0);

  const reset = () => {
    setCats([]);
    setBrandSel([]);
    setStrapSel([]);
    setColorSel([]);
    setInStockOnly(false);
    setMaxPrice(null);
    setQuery("");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <p className="eyebrow">Collection complète</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Catalogue</h1>
      <div className="gold-rule mt-4" />

      <div className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground transition-colors" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une montre, une marque, une référence…"
            // `rounded-full` explicite : twMerge ne sait pas que l'utilitaire
            // maison porte un rayon, il garderait celui d'origine.
            className="champ-recherche h-12 rounded-full border-border pl-11 pr-10 text-base shadow-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              aria-label="Effacer la recherche"
              className="absolute right-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-12 min-w-[190px] rounded-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="popularite">Popularité</SelectItem>
            <SelectItem value="nouveautes">Nouveautés</SelectItem>
            <SelectItem value="prix-asc">Prix croissant</SelectItem>
            <SelectItem value="prix-desc">Prix décroissant</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-11 rounded-xl lg:hidden"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal className="mr-2 size-4" />
          Filtres {activeCount > 0 && `(${activeCount})`}
        </Button>
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[248px_minmax(0,1fr)]">
        {/* Les filtres restent à l'écran pendant qu'on parcourt la grille. */}
        <aside
          className={`${showFilters ? "block" : "hidden"} space-y-8 lg:sticky lg:top-28 lg:block lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto lg:pr-3`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filtres</span>
            {activeCount > 0 && (
              <button
                onClick={reset}
                className="flex items-center gap-1 rounded-full border border-gold/40 px-2.5 py-1 text-xs text-gold transition-colors hover:bg-gold-soft"
              >
                <X className="size-3" /> Réinitialiser
              </button>
            )}
          </div>
          <Group
            title="Catégorie"
            options={CATEGORIES}
            selected={cats}
            onToggle={(v) => toggle(cats, setCats, v)}
            apercu={12}
          />
          <div>
            <h3 className="eyebrow">Prix maximum</h3>
            <Slider
              className="mt-4"
              value={[prixMax]}
              min={Math.min(5000, plafond)}
              max={plafond}
              step={5000}
              onValueChange={([v]) => setMaxPrice(v ?? plafond)}
            />
            <p className="mt-2 text-sm text-muted-foreground">{formatFcfa(prixMax)}</p>
          </div>
          <Group
            title="Marque"
            options={brands}
            selected={brandSel}
            onToggle={(v) => toggle(brandSel, setBrandSel, v)}
          />
          <Group
            title="Bracelet"
            options={straps}
            selected={strapSel}
            onToggle={(v) => toggle(strapSel, setStrapSel, v)}
          />
          <Group
            title="Couleur"
            options={colors}
            selected={colorSel}
            onToggle={(v) => toggle(colorSel, setColorSel, v)}
            apercu={6}
          />
          <div>
            <h3 className="eyebrow">Disponibilité</h3>
            <div className="mt-3 flex items-center gap-2.5">
              <Checkbox
                id="stock"
                checked={inStockOnly}
                onCheckedChange={(v) => setInStockOnly(Boolean(v))}
              />
              <Label htmlFor="stock" className="text-sm font-normal">
                En stock uniquement
              </Label>
            </div>
          </div>
        </aside>

        <div>
          <p className="mb-5 text-sm text-muted-foreground">
            {results.length} montre{results.length > 1 ? "s" : ""}
          </p>
          {results.length === 0 ? (
            <div className="border border-border p-12 text-center">
              <p className="text-sm text-muted-foreground">
                Aucune montre ne correspond à votre recherche.
              </p>
              <Button variant="outline" className="mt-4 rounded-xl" onClick={reset}>
                Réinitialiser les filtres
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
