import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronDown, MapPin, Search, Store, UserRound, X } from "lucide-react";

import { ApiError, requeteCompte, suivreCommande, type TrackedOrder } from "@/lib/api";
import { useCompte } from "@/lib/compte";
import { ORDER_STEPS, useShop } from "@/lib/shop";
import { formatDate, formatFcfa } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SearchParams = { ref?: string | undefined };

export const Route = createFileRoute("/suivi")({
  // `?ref=` vient de l'écran de confirmation : on ne fait pas retaper au
  // client la référence qu'il vient d'obtenir. Le téléphone, lui, reste à
  // saisir — c'est ce qui protège la commande, il n'a rien à faire dans l'URL.
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    ref: typeof search["ref"] === "string" ? search["ref"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Suivre ma commande — MONTR'OR" },
      {
        name: "description",
        content:
          "Suivez votre commande de montre avec votre numéro de commande et votre téléphone : confirmation, expédition, livraison.",
      },
      { property: "og:title", content: "Suivi de commande — MONTR'OR" },
      {
        property: "og:description",
        content: "Où en est votre montre ? Suivez chaque étape jusqu'à votre porte.",
      },
    ],
  }),
  component: Suivi,
});

function Suivi() {
  const { ref: refUrl } = Route.useSearch();
  const { session } = useCompte();
  // Sert uniquement à retrouver le téléphone de la commande qu'on vient de
  // passer, pour le pré-remplir à l'inscription. Aucune liste n'en sort :
  // lister des commandes est réservé au compte.
  const { orders } = useShop();

  const [mesCommandes, setMesCommandes] = useState<TrackedOrder[]>([]);
  const [reference, setReference] = useState(refUrl ?? "");
  const [telephone, setTelephone] = useState("");
  const [commande, setCommande] = useState<TrackedOrder | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);
  const autoFait = useRef(false);

  // La liste des commandes est réservée au compte : c'est le serveur qui la
  // tient, donc elle suit le client d'un appareil à l'autre. Sans compte, on
  // ne peut rien lister — d'où le formulaire.
  useEffect(() => {
    if (!session) {
      setMesCommandes([]);
      setCommande(null);
      autoFait.current = false;
      return;
    }
    requeteCompte<{ commandes: TrackedOrder[] }>("/compte/moi/", { jeton: session.jeton })
      .then((d) => setMesCommandes(d.commandes))
      .catch(() => setMesCommandes([]));
  }, [session]);

  const rechercher = async (ref: string, tel: string) => {
    if (!ref.trim() || !tel.trim()) {
      setErreur("Indiquez votre numéro de commande et le téléphone utilisé lors de l'achat.");
      setCommande(null);
      return;
    }
    setChargement(true);
    setErreur("");
    try {
      // Le statut fait autorité côté Django : ce qui est affiché ici est
      // exactement ce que tu vois dans l'admin.
      setCommande(await suivreCommande(ref, tel));
    } catch (err) {
      setCommande(null);
      setErreur(
        err instanceof ApiError
          ? err.message
          : "Impossible de récupérer la commande pour le moment.",
      );
    } finally {
      setChargement(false);
    }
  };

  // Un client connecté vient voir où en est sa dernière commande : on la lui
  // montre sans qu'il ait à cliquer.
  useEffect(() => {
    if (autoFait.current || mesCommandes.length === 0) return;
    autoFait.current = true;
    setErreur("");
    setCommande(mesCommandes[0]!);
  }, [mesCommandes]);

  const annulee = commande?.statut === "annulee";
  const listeVisible = !!session && mesCommandes.length > 0;
  // Le client sort tout juste du tunnel de commande : c'est le moment où
  // créer un compte lui rapporte quelque chose d'immédiat et de concret.
  const sortieDeCommande = !session && !!refUrl;
  const telCommande = refUrl ? orders.find((o) => o.reference === refUrl)?.phone : undefined;
  const formulaireVisible = formulaireOuvert || (!listeVisible && !sortieDeCommande);

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Service client</p>
      <h1 className="mt-2 text-4xl">Suivi de commande</h1>
      <div className="gold-rule mt-4" />

      {/* ---------- Sortie du tunnel de commande ---------- */}
      {sortieDeCommande ? (
        <div className="mt-7 rounded-xl border border-gold/40 bg-gold-soft/60 p-6 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-gold text-gold-foreground">
            <Check className="size-6" />
          </span>
          <h2 className="mt-4 text-xl">Commande {refUrl} enregistrée</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Connectez-vous pour la suivre. Vos commandes s'affichent alors toutes seules, ici
            et sur n'importe quel appareil — plus rien à retenir.
          </p>
          <Button asChild size="lg" className="mt-6 h-12 rounded-full px-8">
            <Link
              to="/compte"
              search={{ ...(telCommande ? { tel: telCommande } : {}), retour: "/suivi" }}
            >
              <UserRound className="mr-2 size-4" />
              Connexion / créer un compte
            </Link>
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Le compte reste facultatif — 30 secondes, votre numéro et un mot de passe.
          </p>
        </div>
      ) : (
        !session && (
          <div className="mt-7 flex flex-wrap items-center gap-4 rounded-xl border border-gold/30 bg-gold-soft/60 p-5">
            <UserRound className="size-5 shrink-0 text-gold" />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              Avec un compte, vos commandes vous suivent d'un appareil à l'autre — plus besoin
              de retrouver le numéro. Sans compte, il faut le saisir à chaque fois.
            </p>
            <Button
              asChild
              variant="outline"
              className="h-11 shrink-0 rounded-full border-gold/50 px-5"
            >
              <Link to="/compte" search={{ retour: "/suivi" }}>
                Connexion / créer un compte
              </Link>
            </Button>
          </div>
        )
      )}

      {/* ---------- Client connecté : ses commandes ---------- */}
      {listeVisible && (
        <div className="mt-7">
          <p className="text-sm text-muted-foreground">
            {mesCommandes.length === 1
              ? "Votre commande :"
              : "Vos commandes — touchez celle à suivre :"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {mesCommandes.map((c) => {
              const actif = commande?.reference === c.reference;
              return (
                <button
                  key={c.reference}
                  onClick={() => {
                    setErreur("");
                    setCommande(c);
                  }}
                  className={cn(
                    "rounded-full border px-4 py-2.5 text-left text-sm transition-colors",
                    actif
                      ? "border-gold bg-gold-soft text-gold"
                      : "border-border text-muted-foreground hover:border-gold/50 hover:text-foreground",
                  )}
                >
                  <span className="font-medium">{c.reference}</span>
                  <span className="ml-2 text-xs opacity-80">
                    {formatDate(c.cree_le)} · {formatFcfa(c.total_fcfa)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {session && mesCommandes.length === 0 && (
        <p className="mt-7 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          Aucune commande rattachée à votre compte pour l'instant. Si vous avez commandé sans
          être connecté, retrouvez-la ci-dessous avec son numéro.
        </p>
      )}

      {/* ---------- Recherche ---------- */}
      {!formulaireVisible && (
        <button
          onClick={() => setFormulaireOuvert(true)}
          className={cn(
            "flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
            sortieDeCommande ? "mx-auto mt-5" : "mt-6",
          )}
        >
          <ChevronDown className="size-4" />
          {sortieDeCommande
            ? "Suivre sans compte, avec mon numéro de commande"
            : "Suivre une autre commande"}
        </button>
      )}

      {formulaireVisible && (
        <div
          className={cn(
            listeVisible || sortieDeCommande ? "mt-6 border-t border-border pt-6" : "mt-7",
          )}
        >
          <p className="text-sm text-muted-foreground">
            Renseignez le numéro reçu à la validation (ex. MO-4F82K1) et le téléphone utilisé
            lors de l'achat.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="reference">Numéro de commande</Label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && void rechercher(reference, telephone)}
                  placeholder="MO-4F82K1"
                  className="h-12 rounded-xl pl-9"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="telephone">Téléphone</Label>
              <Input
                id="telephone"
                inputMode="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void rechercher(reference, telephone)}
                placeholder="07 01 85 07 08"
                className="mt-2 h-12 rounded-xl"
              />
            </div>
          </div>

          <Button
            size="lg"
            className="mt-4 h-12 rounded-xl px-8"
            onClick={() => void rechercher(reference, telephone)}
            disabled={chargement}
          >
            {chargement ? "Recherche…" : "Rechercher"}
          </Button>
        </div>
      )}

      {erreur && (
        <p className="mt-8 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
          {erreur}
        </p>
      )}

      {/* ---------- Suivi ---------- */}
      {commande && (
        <motion.div
          key={commande.reference}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-10 rounded-xl border border-border p-6"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
            <div className="min-w-0">
              <p className="eyebrow">Commande</p>
              <h2 className="mt-1 text-2xl">{commande.reference}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{formatDate(commande.cree_le)}</p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.12em]",
                annulee ? "bg-destructive/10 text-destructive" : "bg-gold-soft text-gold",
              )}
            >
              {commande.statut_libelle}
            </span>
          </div>

          {/* Où va la montre. L'un des deux champs est nul selon le mode. */}
          {commande.point_relais ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <Store className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                Retrait au point relais {commande.point_relais.nom} ·{" "}
                {commande.point_relais.commune}
                {/* Certains points relais n'ont que leur commune comme
                    adresse : inutile de la répéter sur deux lignes. */}
                {commande.point_relais.adresse &&
                  commande.point_relais.adresse !== commande.point_relais.commune && (
                    <span className="block text-xs">{commande.point_relais.adresse}</span>
                  )}
              </span>
            </p>
          ) : commande.zone_livraison ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
              <span>
                Livraison à domicile · {commande.zone_livraison.commune}
                {commande.zone_livraison.delai_estime && (
                  <span className="block text-xs">{commande.zone_livraison.delai_estime}</span>
                )}
              </span>
            </p>
          ) : null}

          {annulee ? (
            <p className="mt-8 flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <X className="size-4 shrink-0" />
              Cette commande a été annulée. Contactez-nous si c'est une erreur.
            </p>
          ) : (
            <ol className="mt-8 space-y-0">
              {ORDER_STEPS.map((label, i) => {
                const done = i <= commande.etape_index;
                return (
                  <li key={label} className="grid grid-cols-[28px_minmax(0,1fr)] gap-4">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-full border",
                          done ? "border-gold bg-gold text-gold-foreground" : "border-border",
                        )}
                      >
                        {done ? (
                          <Check className="size-3.5" />
                        ) : (
                          <span className="text-xs">{i + 1}</span>
                        )}
                      </span>
                      {i < ORDER_STEPS.length - 1 && (
                        <span className={cn("w-px flex-1", done ? "bg-gold" : "bg-border")} />
                      )}
                    </div>
                    <div className="pb-6">
                      <p className={cn("text-sm", !done && "text-muted-foreground")}>{label}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="border-t border-border pt-5 text-sm">
            {commande.items.map((it) => (
              <p key={it.id} className="flex justify-between gap-3 py-1">
                <span className="min-w-0 truncate text-muted-foreground">
                  {it.quantite} × {it.nom}
                </span>
                <span className="shrink-0">{formatFcfa(it.sous_total)}</span>
              </p>
            ))}
            <p className="flex justify-between gap-3 py-1">
              <span className="text-muted-foreground">
                {commande.point_relais ? "Point relais" : "Livraison"}
              </span>
              <span>{formatFcfa(commande.frais_livraison_fcfa)}</span>
            </p>
            <p className="mt-3 flex justify-between border-t border-border pt-3 font-medium">
              <span>Total ({commande.mode_paiement_libelle})</span>
              <span className="prix text-gold">{formatFcfa(commande.total_fcfa)}</span>
            </p>
            {commande.acompte_fcfa > 0 && (
              <p className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>Acompte versé {formatFcfa(commande.acompte_fcfa)}</span>
                <span>Reste à payer {formatFcfa(commande.reste_a_payer_fcfa)}</span>
              </p>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
