import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck, HeartHandshake, Target, Truck } from "lucide-react";
import heroWatch from "@/assets/hero-watch.jpg";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/a-propos")({
  head: () => ({
    meta: [
      { title: "À propos de MONTR'OR — Montres premium en Côte d'Ivoire" },
      {
        name: "description",
        content:
          "Notre histoire, nos engagements et notre mission : rendre la belle horlogerie accessible en Côte d'Ivoire, avec un service de confiance.",
      },
      { property: "og:title", content: "À propos de MONTR'OR" },
      {
        property: "og:description",
        content: "Rendre la belle horlogerie accessible en Côte d'Ivoire, sans compromis.",
      },
    ],
  }),
  component: APropos,
});

const ENGAGEMENTS = [
  {
    icon: BadgeCheck,
    title: "Sélection rigoureuse",
    text: "Chaque modèle est testé et contrôlé avant d'entrer au catalogue. Aucune pièce approximative.",
  },
  {
    icon: Truck,
    title: "Livraison maîtrisée",
    text: "Yango Next Day dans le Grand Abidjan, Jumia Delivery partout ailleurs, avec suivi.",
  },
  {
    icon: HeartHandshake,
    title: "Confiance d'abord",
    // Ne promettre que ce qui est tenu : le fournisseur n'accorde aucune
    // garantie, la boutique n'en annonce donc aucune. Les moyens de paiement,
    // eux, sont réellement proposés au checkout.
    text: "Payez à la livraison, en Mobile Money ou en deux fois. C'est vous qui choisissez.",
  },
];

function APropos() {
  return (
    <div>
      <section className="border-b border-border bg-muted/40">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Notre histoire</p>
            <h1 className="mt-3 text-4xl sm:text-5xl">
              La belle horlogerie, <span className="text-gold">au juste prix.</span>
            </h1>
            <div className="gold-rule mt-5" />
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
              MONTR'OR est née d'un constat simple à Abidjan : trop de belles montres restaient
              inaccessibles, et trop de montres accessibles étaient décevantes. Nous avons donc
              choisi une voie étroite — sélectionner peu de modèles, mais les bons, et les proposer
              à un prix que l'on assume à voix haute.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Aujourd'hui, nous livrons dans les 24 à 48h dans le Grand Abidjan et partout en Côte
              d'Ivoire en quelques jours, avec le paiement à la livraison comme preuve de confiance.
            </p>
          </div>
          <img
            src={heroWatch}
            alt="Montre automatique MONTR'OR en gros plan"
            loading="lazy"
            width={1600}
            height={1200}
            className="w-full object-cover shadow-elegant"
          />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <p className="eyebrow">Notre façon de travailler</p>
        <h2 className="mt-2 text-3xl sm:text-4xl">Nos engagements</h2>
        <div className="gold-rule mt-4" />
        <div className="mt-10 grid gap-px bg-border sm:grid-cols-3">
          {ENGAGEMENTS.map((e) => (
            <div key={e.title} className="bg-background p-7">
              <e.icon className="size-6 text-gold" />
              <h3 className="mt-4 text-xl">{e.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{e.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-muted/40">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <Target className="mx-auto size-6 text-gold" />
          <h2 className="mt-5 text-3xl sm:text-4xl">Notre mission</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Permettre à chaque Ivoirien et chaque Ivoirienne de porter une montre dont il est fier,
            en moins de deux minutes d'achat et sans jamais avoir à payer avant d'avoir vu la
            pièce.
          </p>
          <Button asChild size="lg" className="mt-8 rounded-xl px-8">
            <Link to="/catalogue">Découvrir la collection</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
