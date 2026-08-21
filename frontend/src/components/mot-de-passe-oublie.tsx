import { ArrowLeft, Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, requeteCompte, type SessionCompte } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Récupération d'un mot de passe oublié, par code envoyé à l'adresse e-mail
 * confirmée du compte.
 *
 * Le serveur répond la même chose que le numéro ait un compte ou non : sans
 * ça, ce formulaire dirait à qui veut l'entendre quels numéros sont clients.
 * Le message affiché reste donc volontairement au conditionnel.
 */
export function MotDePasseOublie({
  telephoneInitial,
  whatsapp,
  onSession,
  onRetour,
}: {
  telephoneInitial: string;
  /** Lien de secours : sans adresse confirmée, il n'y a pas d'autre porte. */
  whatsapp: string;
  onSession: (s: SessionCompte) => void;
  onRetour: () => void;
}) {
  const [identifiant, setIdentifiant] = useState(telephoneInitial);
  const [code, setCode] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [etape, setEtape] = useState<"numero" | "code">("numero");
  const [enCours, setEnCours] = useState(false);

  const demander = async () => {
    setEnCours(true);
    try {
      const r = await requeteCompte<{ detail: string }>("/compte/mot-de-passe/code/", {
        corps: { identifiant },
      });
      setEtape("code");
      toast.success("Demande envoyée", { description: r.detail });
    } catch (err) {
      toast.error("Demande impossible", {
        description: err instanceof ApiError ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setEnCours(false);
    }
  };

  const reinitialiser = async () => {
    setEnCours(true);
    try {
      const s = await requeteCompte<SessionCompte>("/compte/mot-de-passe/reinitialiser/", {
        corps: { identifiant, code, mot_de_passe: motDePasse },
      });
      toast.success("Mot de passe changé", { description: "Vous êtes connecté." });
      onSession(s);
    } catch (err) {
      toast.error("Réinitialisation impossible", {
        description: err instanceof ApiError ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
      <button
        onClick={onRetour}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Retour à la connexion
      </button>

      <p className="eyebrow mt-6 text-gold">Espace client</p>
      <h1 className="titre-section mt-3">Mot de passe oublié</h1>
      <div className="gold-rule mt-4" />

      {etape === "numero" ? (
        <>
          <p className="mt-6 rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Nous enverrons un code à l'adresse e-mail de votre compte. Si vous ne
            la retrouvez pas,{" "}
            <a
              href={whatsapp}
              target="_blank"
              rel="noreferrer"
              className="lien-souligne text-gold"
            >
              écrivez-nous sur WhatsApp
            </a>{" "}
            : nous vous débloquerons.
          </p>
          <div className="mt-6">
            <Label htmlFor="tel-oubli">Téléphone ou adresse e-mail</Label>
            <Input
              id="tel-oubli"
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && identifiant.trim().length >= 8 && !enCours && void demander()
              }
              placeholder="07 00 00 00 00  ou  vous@exemple.com"
              className="mt-2 h-12 rounded-xl"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              L'un ou l'autre, celui dont vous vous souvenez.
            </p>
          </div>
          <Button
            size="lg"
            disabled={identifiant.trim().length < 8 || enCours}
            onClick={() => void demander()}
            className="mt-5 h-13 w-full rounded-full py-3.5 text-base"
          >
            {enCours ? "…" : "Recevoir un code"}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-6 rounded-xl border border-gold/40 bg-gold-soft/50 p-4 text-sm text-muted-foreground">
            Si ce compte existe, un code de 6 chiffres vient d'être envoyé à son
            adresse e-mail. Il est valable 15 minutes.
          </p>

          {/* Mention detachee et non noyee en fin de phrase : l'expediteur est
              une adresse Gmail signee par un tiers, ce que les messageries
              classent volontiers en indesirables. C'est la premiere raison
              pour laquelle un client croit n'avoir rien recu. */}
          <p className="mt-3 flex items-start gap-2.5 rounded-xl bg-muted/60 p-4 text-sm">
            <Inbox className="mt-0.5 size-4 shrink-0 text-gold" />
            <span>
              <strong className="font-medium">Vous ne voyez rien arriver ?</strong>{" "}
              <span className="text-muted-foreground">
                Regardez dans vos courriers indésirables ou vos spams — c'est là
                que le message atterrit le plus souvent la première fois.
              </span>
            </span>
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="code-oubli">Code reçu par e-mail</Label>
              <Input
                id="code-oubli"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                className="prix mt-2 h-12 rounded-xl text-center text-lg tracking-[0.5em]"
              />
            </div>
            <div>
              <Label htmlFor="mdp-oubli">Nouveau mot de passe</Label>
              <Input
                id="mdp-oubli"
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  code.length === 6 &&
                  motDePasse.length >= 8 &&
                  !enCours &&
                  void reinitialiser()
                }
                placeholder="8 caractères minimum"
                className="mt-2 h-12 rounded-xl"
              />
            </div>
            <Button
              size="lg"
              disabled={code.length !== 6 || motDePasse.length < 8 || enCours}
              onClick={() => void reinitialiser()}
              className="h-13 w-full rounded-full py-3.5 text-base"
            >
              {enCours ? "…" : "Changer mon mot de passe"}
            </Button>
            <button
              onClick={() => void demander()}
              disabled={enCours}
              className="lien-souligne mx-auto block text-sm text-gold disabled:opacity-50"
            >
              Renvoyer un code
            </button>
          </div>
        </>
      )}
    </div>
  );
}
