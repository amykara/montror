import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { fetchFaqs, fetchProducts, fetchReviews, fetchSettings, fetchDeliveryZones } from "@/lib/api";
import { SETTINGS_FALLBACK, SiteDataProvider, type SiteData } from "@/lib/catalog";
import { CompteProvider } from "@/lib/compte";
import { ShopProvider } from "@/lib/shop";
import { useFrequentation } from "@/lib/frequentation";
import { SiteHeader } from "@/components/site-header";
import { ReveilServeur } from "@/components/reveil-serveur";
import { RubanMarques } from "@/components/ruban-marques";
import { SiteFooter } from "@/components/site-footer";
import { WhatsAppFab } from "@/components/whatsapp-fab";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page introuvable</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Cette page n'existe pas ou a été déplacée.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Cette page n'a pas pu se charger
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Une erreur est survenue. Réessayez ou revenez à l'accueil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Accueil
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * Charge en une passe tout ce qui est commun au site. Exécuté côté serveur au
 * premier rendu puis côté client à la navigation : le contenu suit l'admin
 * Django sans redémarrage. Si l'API tombe, on sert une version dégradée
 * plutôt qu'une page blanche.
 */
async function chargerDonneesSite(): Promise<SiteData> {
  const [products, zones, settings, reviews, faqs] = await Promise.all([
    fetchProducts().catch(() => null),
    fetchDeliveryZones().catch(() => null),
    fetchSettings().catch(() => null),
    fetchReviews().catch(() => []),
    fetchFaqs().catch(() => []),
  ]);

  const apiIndisponible = products === null || zones === null || settings === null;
  if (apiIndisponible) {
    console.error("API Django injoignable : le site s'affiche en mode dégradé.");
  }

  return {
    products: products ?? [],
    zones: zones ?? [],
    settings: settings ?? SETTINGS_FALLBACK,
    reviews: reviews ?? [],
    faqs: faqs ?? [],
    apiIndisponible,
  };
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: chargerDonneesSite,
  // Les données restent fraîches 30 s : on évite de rappeler l'API à chaque
  // clic tout en reflétant vite un changement fait dans l'admin.
  staleTime: 30_000,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "author", content: "MONTR'OR" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "MONTR'OR" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500;600&family=Jost:wght@300;400;500;600&display=swap",
      },
      // Le SVG d'abord : net a toutes les tailles, et il s'adapte au futur
      // sans qu'on ait a regenerer des images. Le .ico reste en second pour
      // les navigateurs qui l'ignorent — sans lui, certains iraient chercher
      // /favicon.ico tout seuls et ressortiraient l'ancienne icone du cache.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const siteData = Route.useLoaderData();

  // Compteur de fréquentation, lu depuis l'administration. Placé ici plutôt
  // que dans chaque page : une seule ligne couvre tout le site, y compris les
  // pages ajoutées plus tard.
  useFrequentation();

  return (
    <QueryClientProvider client={queryClient}>
      <SiteDataProvider value={siteData}>
        <CompteProvider>
          <ShopProvider>
            <div className="flex min-h-screen flex-col">
              <SiteHeader />
              <RubanMarques />
              {siteData.apiIndisponible && <ReveilServeur />}
              <main className="flex-1">
                {/* Required: nested routes render here. */}
                <Outlet />
              </main>
              <SiteFooter />
            </div>
            <WhatsAppFab />
            <Toaster position="top-center" />
          </ShopProvider>
        </CompteProvider>
      </SiteDataProvider>
    </QueryClientProvider>
  );
}
