import { Link, useNavigate } from "@tanstack/react-router";
import { Heart, LogOut, Menu, Moon, Package, Phone, Search, ShoppingBag, Sun, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSettings } from "@/lib/catalog";
import { useCompte } from "@/lib/compte";
import { useShop, useTheme } from "@/lib/shop";
import { formatFcfa } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Accueil" },
  { to: "/catalogue", label: "Catalogue" },
  { to: "/suivi", label: "Suivi commande" },
  { to: "/a-propos", label: "À propos" },
  { to: "/contact", label: "Contact" },
] as const;

/** « Awa Traore » → « AT ». Sert de pastille quand la session est ouverte. */
function initiales(nom: string) {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "") + (mots[1]?.[0] ?? "")).toUpperCase() || "?";
}

/** Champ de recherche : envoie vers le catalogue, qui lit `?q=`. */
function ChampRecherche({
  className,
  onValider,
}: {
  className?: string;
  onValider?: () => void;
}) {
  const navigate = useNavigate();
  const [terme, setTerme] = useState("");

  const chercher = () => {
    const q = terme.trim();
    onValider?.();
    void navigate({ to: "/catalogue", search: q ? { q } : {} });
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={terme}
        onChange={(e) => setTerme(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && chercher()}
        placeholder="Rechercher une montre, une marque…"
        aria-label="Rechercher une montre"
        className="champ-recherche h-11 w-full border border-border bg-muted/50 pl-11 pr-4 text-sm placeholder:text-muted-foreground"
      />
    </div>
  );
}

export function SiteHeader() {
  const { count, subtotal, favorites } = useShop();
  const { theme, toggle } = useTheme();
  const settings = useSettings();
  const { session, deconnecter } = useCompte();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuCompte, setMenuCompte] = useState(false);
  const [defile, setDefile] = useState(false);
  const zoneCompte = useRef<HTMLDivElement>(null);

  // Au-delà de quelques pixels, l'en-tête se resserre et la rangée de
  // navigation se replie : plus de place pour le contenu.
  useEffect(() => {
    const surDefilement = () => setDefile(window.scrollY > 24);
    surDefilement();
    window.addEventListener("scroll", surDefilement, { passive: true });
    return () => window.removeEventListener("scroll", surDefilement);
  }, []);

  // Le menu du compte se referme au clic ailleurs et à l'échappement.
  useEffect(() => {
    if (!menuCompte) return;
    const dehors = (e: MouseEvent) => {
      if (!zoneCompte.current?.contains(e.target as Node)) setMenuCompte(false);
    };
    const echap = (e: KeyboardEvent) => e.key === "Escape" && setMenuCompte(false);
    document.addEventListener("mousedown", dehors);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("mousedown", dehors);
      document.removeEventListener("keydown", echap);
    };
  }, [menuCompte]);

  const iconeAction =
    "relative grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-500",
        defile
          ? "border-b border-border/70 bg-background/90 shadow-[0_1px_20px_-12px_rgb(0_0_0/0.4)] backdrop-blur-xl"
          : "border-b border-transparent bg-background/70 backdrop-blur-md",
      )}
    >
      {/* ---------- Rangée principale ---------- */}
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-4 px-4 transition-all duration-500 sm:px-6 lg:gap-8",
          defile ? "py-2.5" : "py-3.5",
        )}
      >
        <Link to="/" className="flex shrink-0 items-center">
          <span
            className={cn(
              "font-display tracking-[0.28em] transition-all duration-500",
              defile ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
            )}
          >
            {settings.nom}
          </span>
        </Link>

        {/* La recherche occupe le centre sur grand écran : c'est le geste le
            plus fréquent sur une boutique, il mérite mieux qu'une loupe. */}
        <ChampRecherche className="hidden min-w-0 flex-1 lg:block" />

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          {/* Compte : bouton nommé quand on est déconnecté, pastille aux
              initiales quand la session est ouverte. Les deux états ne peuvent
              plus être confondus. */}
          <div ref={zoneCompte} className="relative">
            {session ? (
              <>
                <button
                  onClick={() => setMenuCompte((v) => !v)}
                  aria-label="Mon compte"
                  aria-expanded={menuCompte}
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-muted lg:pr-3"
                >
                  {/* Contour doré, pas de remplissage : l'or plein reste
                      réservé au panier, la seule action à pousser. */}
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold-soft text-[0.7rem] font-semibold tracking-wide text-gold">
                    {initiales(session.nom_complet)}
                  </span>
                  <span className="hidden max-w-24 truncate text-sm lg:block">
                    {session.nom_complet.split(" ")[0]}
                  </span>
                </button>

                {menuCompte && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-background p-1.5 shadow-lg">
                    <p className="px-3 py-2 text-xs text-muted-foreground">{session.telephone}</p>
                    <Link
                      to="/compte"
                      onClick={() => setMenuCompte(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      <Package className="size-4 text-gold" />
                      Mes commandes
                    </Link>
                    <button
                      onClick={async () => {
                        setMenuCompte(false);
                        await deconnecter();
                        void navigate({ to: "/" });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <LogOut className="size-4" />
                      Se déconnecter
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Rien dans la barre tant qu'on n'est pas connecté sur petit
                 écran : une silhouette seule dans un rond se lit comme un
                 avatar, donc comme une session ouverte. L'entrée « Connexion »
                 est dans le menu, en toutes lettres. */
              <Link
                to="/compte"
                className="hidden h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground transition-colors hover:border-gold hover:text-foreground lg:flex"
              >
                <UserRound className="size-[1.05rem]" />
                <span>Connexion</span>
              </Link>
            )}
          </div>

          {/* Le filet separe l'identite (compte) des actions repetees :
              theme, favoris, panier. */}
          <span className="mx-1 h-6 w-px bg-border" aria-hidden />

          <button onClick={toggle} aria-label="Changer de thème" className={iconeAction}>
            {theme === "dark" ? <Sun className="size-[1.15rem]" /> : <Moon className="size-[1.15rem]" />}
          </button>

          <Link to="/favoris" aria-label="Mes favoris" className={iconeAction}>
            <Heart className="size-[1.15rem]" />
            {favorites.length > 0 && (
              <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-foreground text-[0.6rem] font-medium text-background">
                {favorites.length}
              </span>
            )}
          </Link>

          {/* Le panier est l'action qui compte : pastille pleine, et le montant
              rappelé dès qu'il y a la place. */}
          <Link
            to="/panier"
            aria-label="Mon panier"
            className={cn(
              "flex h-10 items-center gap-2 rounded-full px-2.5 transition-colors lg:px-4",
              count > 0
                ? "bg-gold text-gold-foreground hover:bg-gold/90"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <span className="relative grid place-items-center">
              <ShoppingBag className="size-[1.15rem]" />
              {count > 0 && (
                <span className="absolute -right-2 -top-2 grid size-4 place-items-center rounded-full bg-foreground text-[0.6rem] font-medium text-background">
                  {count}
                </span>
              )}
            </span>
            {count > 0 && (
              <span className="prix ml-1 hidden text-sm font-medium xl:block">
                {formatFcfa(subtotal)}
              </span>
            )}
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="ml-0.5 size-10 lg:hidden"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {/* ---------- Recherche mobile ---------- */}
      <div className="px-4 pb-3 sm:px-6 lg:hidden">
        <ChampRecherche />
      </div>

      {/* ---------- Navigation ---------- */}
      {/* Se replie au défilement plutôt que de disparaître d'un coup. */}
      <nav
        className={cn(
          "hidden overflow-hidden transition-all duration-500 lg:block",
          defile ? "max-h-0 opacity-0" : "max-h-14 opacity-100",
        )}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-9 px-4 pb-3 sm:px-6">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="lien-souligne text-[0.78rem] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* ---------- Menu mobile ---------- */}
      {open && (
        <nav className="border-t border-border bg-background px-4 pb-4 pt-2 sm:px-6 lg:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className="block py-3 text-sm uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}

          <div className="mt-2 flex items-center justify-between border-t border-border pt-3">
            {session ? (
              <button
                onClick={async () => {
                  setOpen(false);
                  await deconnecter();
                  void navigate({ to: "/" });
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <LogOut className="size-4" />
                Se déconnecter
              </button>
            ) : (
              <Link
                to="/compte"
                onClick={() => setOpen(false)}
                className="flex h-11 items-center gap-2 rounded-full border border-gold/40 bg-gold-soft px-5 text-sm font-medium text-gold"
              >
                <UserRound className="size-4" />
                Connexion / créer un compte
              </Link>
            )}
          </div>

          {/* Numéro de la boutique. Il est nommé : sans son libellé, juste
              sous « Connexion », on le prend pour son propre numéro. */}
          {settings.telephone_affichage && (
            <a
              href={`tel:${settings.telephone_tel}`}
              className="mt-2 flex items-center gap-2.5 border-t border-border py-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="size-4 shrink-0 text-gold" />
              <span>
                Appeler la boutique
                <span className="ml-1.5 tracking-[0.1em] text-gold">
                  {settings.telephone_affichage}
                </span>
              </span>
            </a>
          )}
        </nav>
      )}
    </header>
  );
}
