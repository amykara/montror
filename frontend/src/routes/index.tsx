import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  MessageCircle,
  Quote,
  Star,
  Truck,
} from "lucide-react";
import heroWatch from "@/assets/hero-watch.jpg";
import {
  useCategoryTiles,
  useFaqs,
  useProducts,
  useReviews,
  useSettings,
  useZones,
} from "@/lib/catalog";
import { formatFcfa, waLink } from "@/lib/site";
import { ProductCard } from "@/components/product-card";
import { Reveal, RevealGroup, RevealItem } from "@/components/reveal";
import { VitrineVideo } from "@/components/video-tile";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MONTR'OR — Montres élégantes livrées en Côte d'Ivoire" },
      {
        name: "description",
        content:
          "Montres homme et femme sélectionnées, livrées en 24-48h à Abidjan. Paiement à la livraison, Wave, Orange Money, MTN Money.",
      },
      { property: "og:title", content: "MONTR'OR — Le temps révèle votre élégance" },
      {
        property: "og:description",
        content:
          "Collection de montres premium à prix juste, livrées partout en Côte d'Ivoire avec paiement à la livraison.",
      },
    ],
  }),
  component: Home,
});

/** Le délai affiché vient des zones de livraison réglées dans l'admin. */
function useAdvantages() {
  const zones = useZones();
  const principale = zones[0];

  return [
    {
      icon: Truck,
      title: principale ? `Livraison ${principale.delai_estime}` : "Livraison rapide",
      text: principale
        ? `${principale.commune} — ${formatFcfa(principale.tarif_fcfa)}`
        : "Partout en Côte d'Ivoire",
    },
    { icon: CreditCard, title: "Plusieurs façons de payer", text: "À la livraison, d'avance ou en deux fois" },
    { icon: BadgeCheck, title: "Produits sélectionnés", text: "Contrôlés pièce par pièce" },
    { icon: MessageCircle, title: "Service client WhatsApp", text: "Réponse en quelques minutes" },
  ];
}

function Section({
  eyebrow,
  title,
  children,
  action,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
      <Reveal>
        <div className="mb-11 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-3 text-gold">
              <span className="h-px w-7 bg-gold/60" />
              {eyebrow}
            </p>
            <h2 className="titre-section mt-3">{title}</h2>
          </div>
          {action}
        </div>
      </Reveal>
      {children}
    </section>
  );
}

function Home() {
  const products = useProducts();
  const reviews = useReviews();
  const faqs = useFaqs();
  const categories = useCategoryTiles();
  const settings = useSettings();
  const advantages = useAdvantages();

  // Pièces filmées : on limite à 4 pour ne pas alourdir la page d'accueil.
  const enVideo = products.filter((p) => p.videos.length > 0).slice(0, 4);

  // La vitrine ne met en avant que des pièces vendables : photo réelle, prix
  // affiché, et autorisées à la mise en avant (certaines photos montrent des
  // écrins de marque déposée — elles restent au catalogue, pas à l'accueil).
  const vitrine = products.filter((p) => p.hasRealPhoto && p.price !== null && p.enVitrine);

  /**
   * Sélection de vitrine. Deux garde-fous, parce que les popularités valent
   * toutes 0 tant qu'elles ne sont pas saisies :
   *  — une seule pièce par marque, sinon la rangée entière est de la même ;
   *  — au plus une pièce d'entrée de gamme, sinon l'accueil vend des montres
   *    à 3 000 F alors que le catalogue monte à 23 900 F.
   */
  // Diaporama du hero : quelques visuels du catalogue, complétés par l'image
  // studio du template pour garantir une vue nette même si la base est vide.
  const vuesHero = [
    ...vitrine.filter((p) => p.hasRealPhoto).slice(0, 3).map((p) => p.images[0]!),
    heroWatch,
  ].slice(0, 4);

  const SEUIL_ENTREE_DE_GAMME = 8000;

  const selectionVitrine = (liste: typeof vitrine, combien: number) => {
    const marquesVues = new Set<string>();
    const choisies: typeof vitrine = [];
    let entreeDeGamme = 0;

    const essayer = (p: (typeof vitrine)[number], strict: boolean) => {
      if (choisies.length === combien || choisies.includes(p)) return;
      const marque = p.brand || p.category;
      if (strict && marquesVues.has(marque)) return;
      const bonMarche = (p.price ?? 0) < SEUIL_ENTREE_DE_GAMME;
      if (strict && bonMarche && entreeDeGamme >= 1) return;
      marquesVues.add(marque);
      if (bonMarche) entreeDeGamme += 1;
      choisies.push(p);
    };

    for (const p of liste) essayer(p, true);
    // Catalogue trop étroit pour respecter les deux règles : on complète.
    for (const p of liste) essayer(p, false);
    return choisies;
  };

  const populaires = selectionVitrine(
    [...vitrine].sort((a, b) => b.popularity - a.popularity || (b.price ?? 0) - (a.price ?? 0)),
    4,
  );
  const nouveautes = selectionVitrine(
    [...vitrine]
      .filter((p) => !populaires.includes(p))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    4,
  );

  return (
    <>
      {/* Hero : diaporama en fond, voile sombre, texte et boutons devant.
          Une hauteur minimale évite que le fond se réduise à un bandeau sur
          les écrans larges et peu hauts — la montre y devenait énorme et le
          texte tombait en plein sur le cadran. */}
      <section className="relative isolate flex min-h-[30rem] items-center overflow-hidden lg:min-h-[36rem]">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          {vuesHero.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              width={1600}
              height={1200}
              // Délais négatifs : les vues sont déjà décalées au chargement.
              style={{ animationDelay: `${-21 + i * 5.25}s` }}
              // Sujet décalé à droite : la colonne de texte reste sur une zone
              // calme plutôt que sur le cadran.
              className="vue-hero object-[62%_center] lg:object-[72%_center]"
            />
          ))}
        </div>
        {/* Deux voiles : un dégradé pour la lisibilité, un aplat pour la profondeur. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/92 via-black/70 to-black/20" />
        <div className="absolute inset-0 -z-10 bg-black/20" />

        <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20">
          {/* Animation d'entrée en CSS : le titre est présent dans le HTML du
              serveur, il ne dépend pas du JavaScript pour être visible. */}
          <div className="max-w-2xl [animation:monter_0.9s_var(--ease-douce)_both]">
            <p className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-gold">
              <span className="h-px w-10 bg-gold" />
              Collection 2026 · Côte d'Ivoire
            </p>

            <h1 className="mt-6 text-[clamp(2.6rem,1.4rem+3.6vw,5.5rem)] leading-[0.98] text-white">
              Le temps révèle
              <br />
              votre <span className="italic text-gold">élégance.</span>
            </h1>

            <p className="mt-6 max-w-lg text-base leading-relaxed text-white/75 sm:text-lg">
              Montres homme et femme sélectionnées pièce par pièce, livrées chez vous
              dans Abidjan en 24 à 48h.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button
                asChild
                size="lg"
                className="h-14 rounded-full bg-gold px-9 text-base tracking-wide text-gold-foreground shadow-elegant transition-transform duration-300 hover:scale-[1.03] hover:bg-gold/90"
              >
                <Link to="/catalogue">
                  Découvrir la collection
                  <ArrowRight className="ml-2.5 size-5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-14 rounded-full border-2 border-white/40 bg-white/5 px-10 text-base text-white backdrop-blur transition-all duration-300 hover:scale-[1.03] hover:border-whatsapp hover:bg-whatsapp hover:text-whatsapp-foreground"
              >
                <a
                  href={waLink(
                    settings.whatsapp,
                    `Bonjour ${settings.nom}, je souhaite être conseillé sur une montre.`,
                  )}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="mr-2.5 size-5" />
                  Être conseillé
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Avantages */}
      <section className="border-b border-border">
        <RevealGroup className="mx-auto grid max-w-7xl gap-px bg-border px-0 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map((a) => (
            <RevealItem key={a.title}>
              <div className="group h-full bg-background px-7 py-9 transition-colors duration-500 hover:bg-gold-soft/30">
                <a.icon className="size-6 text-gold transition-transform duration-500 group-hover:-translate-y-0.5 group-hover:scale-110" />
                <h3 className="mt-5 text-lg">{a.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{a.text}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      <Section
        eyebrow="Les plus demandées"
        title="Produits populaires"
        action={
          <Link
            to="/catalogue"
            className="group hidden shrink-0 items-center gap-1.5 text-sm text-gold sm:flex"
          >
            Tout voir
            <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {populaires.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </Section>

      <Section eyebrow="Fraîchement arrivées" title="Nouveautés">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {nouveautes.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </Section>

      {/* Vitrine animée : les pièces filmées, en mouvement au poignet. */}
      {enVideo.length > 0 && (
        <Section
          eyebrow="En mouvement"
          title="Vues de près"
          action={
            <Link
              to="/catalogue"
              className="group hidden shrink-0 items-center gap-1.5 text-sm text-gold sm:flex"
            >
              Tout voir
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {enVideo.map((p, i) => (
              <VitrineVideo key={p.id} product={p} index={i} />
            ))}
          </div>
        </Section>
      )}

      <Section eyebrow="Trouvez votre style" title="Catégories">
        <RevealGroup className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {categories.map((c) => (
            <RevealItem key={c.value}>
              <Link
                to="/catalogue"
                search={{ filtre: c.value }}
                className="group relative block aspect-[4/5] overflow-hidden rounded-2xl border border-border"
              >
                <img
                  src={c.image}
                  alt={`Montres ${c.label}`}
                  loading="lazy"
                  width={1024}
                  height={1024}
                  className="size-full object-cover transition-transform duration-[900ms] ease-out group-hover:scale-[1.08]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent transition-opacity duration-500 group-hover:from-black/85" />
                <div className="absolute inset-x-5 bottom-5">
                  <span className="font-display text-2xl text-white">{c.label}</span>
                  <span className="mt-2 flex translate-y-2 items-center gap-1.5 text-xs uppercase tracking-[0.16em] text-gold opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
                    Découvrir <ArrowRight className="size-3.5" />
                  </span>
                </div>
              </Link>
            </RevealItem>
          ))}
        </RevealGroup>
      </Section>

      {/* Avis — gérés depuis l'admin Django */}
      {reviews.length > 0 && (
        <section className="relative overflow-hidden border-y border-border bg-muted/40">
          {/* Halo doré très diffus, pour que la bande ne soit pas un aplat mort. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -left-32 top-1/2 size-[28rem] -translate-y-1/2 rounded-full bg-gold/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28">
            <Reveal>
              <p className="eyebrow flex items-center gap-3 text-gold">
                <span className="h-px w-7 bg-gold/60" />
                Ils nous font confiance
              </p>
              <h2 className="titre-section mt-3">Avis clients</h2>
            </Reveal>
            <RevealGroup className="mt-12 grid gap-5 md:grid-cols-3">
              {reviews.map((r) => (
                <RevealItem key={r.id}>
                  <figure className="hover-lift h-full rounded-2xl border border-border bg-background p-7">
                    <Quote className="size-6 text-gold" />
                    <blockquote className="mt-5 text-[0.95rem] leading-relaxed text-muted-foreground">
                      {r.texte}
                    </blockquote>
                    <figcaption className="mt-6 flex items-center justify-between border-t border-border pt-4">
                      <span className="text-sm">
                        {r.nom}
                        {r.ville && <span className="text-muted-foreground"> · {r.ville}</span>}
                      </span>
                      <span className="flex gap-0.5">
                        {Array.from({ length: r.note }).map((_, i) => (
                          <Star key={i} className="size-3.5 fill-gold text-gold" />
                        ))}
                      </span>
                    </figcaption>
                  </figure>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>
      )}

      {/* FAQ — gérée depuis l'admin Django */}
      {faqs.length > 0 && (
        <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6 sm:py-28">
          <Reveal className="text-center">
            <p className="eyebrow text-gold">Questions fréquentes</p>
            <h2 className="titre-section mt-3">FAQ</h2>
            <div className="gold-rule mx-auto mt-5 bg-gradient-to-r from-transparent via-gold to-transparent" />
          </Reveal>
          <Accordion type="single" collapsible className="mt-12">
            {faqs.map((f) => (
              <AccordionItem
                key={f.id}
                value={String(f.id)}
                className="border-border transition-colors data-[state=open]:border-gold/50"
              >
                <AccordionTrigger className="text-left text-base hover:text-gold">
                  {f.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {f.reponse}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      )}
    </>
  );
}
