import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Mail, Package, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiError, requeteCompte, type TrackedOrder } from "@/lib/api";
import { useSettings } from "@/lib/catalog";
import { useCompte } from "@/lib/compte";
import { ORDER_STEPS } from "@/lib/shop";
import { formatDate, formatFcfa, waLink } from "@/lib/site";
import { CarteEmail } from "@/components/carte-email";
import { MotDePasseOublie } from "@/components/mot-de-passe-oublie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type SearchParams = {
  tel?: string | undefined;
  retour?: string | undefined;
};

/** Chemins internes acceptés pour la redirection après connexion.
 *  Liste blanche plutôt que motif : on ne redirige que vers des pages qu'on
 *  connaît, ce qu'aucune trouvaille d'encodage ne peut contourner. */
const RETOURS_AUTORISES = ["/suivi", "/panier", "/checkout", "/favoris", "/"];

function estCheminInterne(valeur: unknown): valeur is string {
  return typeof valeur === "string" && RETOURS_AUTORISES.includes(valeur);
}

export const Route = createFileRoute("/compte")({
  // `?tel=` et `?retour=` viennent du parcours « je viens de commander » :
  // on pré-remplit le numéro utilisé pour la commande et on renvoie le client
  // là où il allait, au lieu de le laisser sur sa page de profil.
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    tel: typeof search["tel"] === "string" ? search["tel"] : undefined,
    // Chemin interne uniquement : sans ce garde-fou, un lien
    // `?retour=https://…` transformerait le site en tremplin d'hameçonnage.
    // Le refus de `//` n'est pas un détail : `//exemple` est une URL
    // « relative au protocole », donc bel et bien externe, alors qu'elle
    // ressemble à un chemin local.
    retour: estCheminInterne(search["retour"]) ? (search["retour"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Mon compte — MONTR'OR" },
      {
        name: "description",
        content:
          "Retrouvez vos commandes MONTR'OR d'un appareil à l'autre. Le compte est facultatif : on peut commander sans s'inscrire.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PageCompte,
});

function PageCompte() {
  const { tel, retour } = Route.useSearch();
  const { session, pret, connecter, inscrire, ouvrirSession, deconnecter } = useCompte();
  const reglages = useSettings();
  const navigate = useNavigate();
  // Qui arrive avec le numéro de sa commande n'a par définition pas encore de
  // compte : on lui ouvre directement l'inscription.
  const [mode, setMode] = useState<"connexion" | "inscription" | "oubli">(
    tel ? "inscription" : "connexion",
  );
  const [form, setForm] = useState({
    nomComplet: "",
    telephone: tel ?? "",
    email: "",
    motDePasse: "",
  });
  const [enCours, setEnCours] = useState(false);
  const [commandes, setCommandes] = useState<TrackedOrder[] | null>(null);
  const [emailCompte, setEmailCompte] = useState("");

  useEffect(() => {
    if (!session) {
      setCommandes(null);
      return;
    }
    requeteCompte<{ commandes: TrackedOrder[]; email: string }>("/compte/moi/", {
      jeton: session.jeton,
    })
      .then((d) => {
        setCommandes(d.commandes);
        setEmailCompte(d.email ?? "");
      })
      .catch(() => setCommandes([]));
  }, [session]);

  // La longueur minimale ne vaut qu'à l'inscription : à la connexion, le mot
  // de passe existe déjà, le refuser d'avance n'empêcherait que son
  // propriétaire d'entrer. 8, comme le validateur de Django côté serveur —
  // en promettre 6 activait le bouton pour une saisie que l'API rejetait.
  const baseValide =
    form.telephone.trim().length >= 8 &&
    (mode === "connexion"
      ? form.motDePasse.length > 0
      : form.motDePasse.length >= 8 &&
        form.nomComplet.trim().length > 2 &&
        // Suffisant pour activer le bouton ; c'est Django qui valide vraiment
        // l'adresse et refuse un doublon.
        /.+@.+\..+/.test(form.email.trim()));

  const valide = baseValide;

  const vider = () =>
    setForm({ nomComplet: "", telephone: "", email: "", motDePasse: "" });

  const envoyer = async () => {
    setEnCours(true);
    try {
      if (mode === "connexion") {
        await connecter(form.telephone, form.motDePasse);
        toast.success("Bienvenue !");
      } else {
        await inscrire(form.nomComplet, form.telephone, form.email, form.motDePasse);
        toast.success("Compte créé", { description: "Vos anciennes commandes y sont rattachées." });
      }
      vider();
      if (retour) void navigate({ to: retour });
    } catch (err) {
      toast.error(mode === "connexion" ? "Connexion impossible" : "Inscription impossible", {
        description: err instanceof ApiError ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setEnCours(false);
    }
  };

  if (!pret) {
    return <div className="mx-auto max-w-md px-4 py-24 text-center text-sm text-muted-foreground">Chargement…</div>;
  }

  /* ---------------- Mot de passe oublié ---------------- */
  if (!session && mode === "oubli") {
    return (
      <MotDePasseOublie
        telephoneInitial={form.telephone}
        whatsapp={waLink(reglages.whatsapp, "Bonjour, j'ai oublié mon mot de passe.")}
        onSession={(s) => {
          ouvrirSession(s);
          if (retour) void navigate({ to: retour });
        }}
        onRetour={() => setMode("connexion")}
      />
    );
  }

  /* ---------------- Connecté ---------------- */
  if (session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <p className="eyebrow text-gold">Mon compte</p>
        <h1 className="titre-section mt-3">Bonjour {session.nom_complet.split(" ")[0]}</h1>
        <div className="gold-rule mt-4" />

        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 p-5">
          <UserRound className="size-5 text-gold" />
          <span className="text-sm">
            {session.nom_complet} · {session.telephone}
          </span>
          <Button
            variant="outline"
            className="ml-auto h-10 rounded-full"
            onClick={async () => {
              await deconnecter();
              toast.success("Vous êtes déconnecté");
              navigate({ to: "/" });
            }}
          >
            <LogOut className="mr-2 size-4" />
            Se déconnecter
          </Button>
        </div>

        <h2 className="mt-12 flex items-center gap-2 text-xl">
          <Mail className="size-5 text-gold" /> Adresse e-mail
        </h2>
        <CarteEmail
          jeton={session.jeton}
          email={emailCompte}
          onConfirme={setEmailCompte}
        />

        <h2 className="mt-12 flex items-center gap-2 text-xl">
          <Package className="size-5 text-gold" /> Mes commandes
        </h2>

        {commandes === null ? (
          <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>
        ) : commandes.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucune commande pour l'instant.</p>
            <Button asChild className="mt-5 h-12 rounded-full px-7">
              <Link to="/catalogue">Découvrir la collection</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {commandes.map((c) => (
              <li key={c.reference} className="rounded-xl border border-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{c.reference}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatDate(c.cree_le)} ·{" "}
                      {c.items.map((i) => `${i.quantite} × ${i.nom}`).join(", ")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs uppercase tracking-[0.1em]",
                      c.statut === "annulee"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-gold-soft text-gold",
                    )}
                  >
                    {c.statut_libelle}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
                  <span className="text-muted-foreground">
                    {c.statut === "annulee"
                      ? "Commande annulée"
                      : `Étape ${c.etape_index + 1} sur ${ORDER_STEPS.length} — ${ORDER_STEPS[c.etape_index]}`}
                  </span>
                  <span className="prix font-medium text-gold">{formatFcfa(c.total_fcfa)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  /* ---------------- Visiteur ---------------- */
  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <p className="eyebrow text-gold">Espace client</p>
      <h1 className="titre-section mt-3">
        {mode === "connexion" ? "Connexion" : "Créer un compte"}
      </h1>
      <div className="gold-rule mt-4" />

      <p className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        Le compte est <strong className="text-foreground">facultatif</strong>. Vous pouvez
        commander sans vous inscrire et suivre votre colis avec son numéro et votre téléphone.
        Le compte sert à retrouver vos commandes depuis n'importe quel appareil.
      </p>

      <div className="mt-8 space-y-4">
        {mode === "inscription" && (
          <div>
            <Label htmlFor="nom">Nom complet</Label>
            <Input
              id="nom"
              value={form.nomComplet}
              onChange={(e) => setForm({ ...form, nomComplet: e.target.value })}
              placeholder="Prénom et nom"
              className="mt-2 h-12 rounded-xl"
            />
          </div>
        )}
        <div>
          <Label htmlFor="tel">Téléphone</Label>
          <Input
            id="tel"
            inputMode="tel"
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            placeholder="07 00 00 00 00"
            className="mt-2 h-12 rounded-xl"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            C'est votre numéro qui sert d'identifiant, pas une adresse e-mail.
          </p>
        </div>

        {/* Demandée dès l'inscription : c'est le seul moyen de récupérer un
            mot de passe oublié, et on ne peut pas l'ajouter plus tard sans
            être connecté — précisément ce qu'on ne peut plus faire. */}
        {mode === "inscription" && (
          <div>
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="vous@exemple.com"
              className="mt-2 h-12 rounded-xl"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Sert uniquement à récupérer votre mot de passe si vous l'oubliez.
            </p>
          </div>
        )}
        <div>
          <Label htmlFor="mdp">Mot de passe</Label>
          <Input
            id="mdp"
            type="password"
            value={form.motDePasse}
            onChange={(e) => setForm({ ...form, motDePasse: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && valide && !enCours && void envoyer()}
            placeholder="8 caractères minimum"
            className="mt-2 h-12 rounded-xl"
          />
        </div>

        <Button
          size="lg"
          disabled={!valide || enCours}
          onClick={() => void envoyer()}
          className="h-13 w-full rounded-full py-3.5 text-base"
        >
          {enCours ? "…" : mode === "connexion" ? "Se connecter" : "Créer mon compte"}
        </Button>

        {mode === "connexion" && (
          <button
            onClick={() => setMode("oubli")}
            className="lien-souligne mx-auto block text-sm text-muted-foreground"
          >
            Mot de passe oublié ?
          </button>
        )}

        <button
          onClick={() => {
            setMode(mode === "connexion" ? "inscription" : "connexion");
          }}
          className="lien-souligne mx-auto block text-sm text-gold"
        >
          {mode === "connexion"
            ? "Pas encore de compte ? En créer un"
            : "J'ai déjà un compte — me connecter"}
        </button>
      </div>
    </div>
  );
}
