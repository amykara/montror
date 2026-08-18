import { Mail, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ApiError, requeteCompte } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Adresse e-mail du compte — facultative.
 *
 * Elle ne sert **qu'à récupérer un mot de passe oublié**. Elle ne prouve pas
 * le téléphone et ne donne accès à aucune commande : celles-ci restent liées
 * au numéro. Le dire au client évite qu'il croie devoir la renseigner pour
 * retrouver ses achats.
 */
export function CarteEmail({
  jeton,
  email,
  onConfirme,
}: {
  jeton: string;
  /** Adresse confirmée, vide s'il n'y en a pas. La source de vérité reste la
   *  page parente : l'adresse arrive après le premier rendu, un état local
   *  figé à l'initialisation afficherait le formulaire d'ajout pour toujours. */
  email: string;
  onConfirme: (adresse: string) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [code, setCode] = useState("");
  const [codeEnvoye, setCodeEnvoye] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  const demander = async () => {
    setEnCours(true);
    try {
      await requeteCompte("/compte/email/code/", { jeton, corps: { email: saisie } });
      setCodeEnvoye(true);
      toast.success("Code envoyé", { description: `Vérifiez ${saisie}.` });
    } catch (err) {
      toast.error("Envoi impossible", {
        description: err instanceof ApiError ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setEnCours(false);
    }
  };

  const confirmer = async () => {
    setEnCours(true);
    try {
      const r = await requeteCompte<{ email: string }>("/compte/email/confirmer/", {
        jeton,
        corps: { code },
      });
      onConfirme(r.email);
      setCodeEnvoye(false);
      setOuvert(false);
      setCode("");
      setSaisie("");
      toast.success("Adresse confirmée");
    } catch (err) {
      toast.error("Code refusé", {
        description: err instanceof ApiError ? err.message : "Réessayez dans un instant.",
      });
    } finally {
      setEnCours(false);
    }
  };

  /* --------- Adresse déjà confirmée --------- */
  if (email && !ouvert) {
    return (
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border p-5">
        <ShieldCheck className="size-5 shrink-0 text-gold" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Adresse confirmée — elle sert à récupérer votre mot de passe.
          </p>
        </div>
        <button
          onClick={() => setOuvert(true)}
          className="lien-souligne shrink-0 text-sm text-gold"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-border p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Mail className="size-4 text-gold" />
        {email ? "Changer d'adresse e-mail" : "Ajouter une adresse e-mail"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Facultatif. Sert uniquement à récupérer votre mot de passe si vous l'oubliez —
        vos commandes restent liées à votre téléphone.
      </p>

      {!codeEnvoye ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            id="email-compte"
            type="email"
            inputMode="email"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && saisie.includes("@") && !enCours && void demander()
            }
            placeholder="vous@exemple.com"
            className="h-11 min-w-48 flex-1 rounded-xl"
          />
          <Button
            variant="outline"
            className="h-11 rounded-xl px-6"
            disabled={!saisie.includes("@") || enCours}
            onClick={() => void demander()}
          >
            {enCours ? "…" : "Recevoir le code"}
          </Button>
          {email && (
            <Button variant="ghost" className="h-11 rounded-xl" onClick={() => setOuvert(false)}>
              Annuler
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <Label htmlFor="code-email">Code reçu par e-mail</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            <Input
              id="code-email"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) =>
                e.key === "Enter" && code.length === 6 && !enCours && void confirmer()
              }
              placeholder="000000"
              className="prix h-11 w-36 rounded-xl text-center tracking-[0.4em]"
            />
            <Button
              className="h-11 rounded-xl px-6"
              disabled={code.length !== 6 || enCours}
              onClick={() => void confirmer()}
            >
              {enCours ? "…" : "Confirmer"}
            </Button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Envoyé à {saisie}. Valable 15 minutes — pensez à regarder les indésirables.
            </p>
            <button
              onClick={() => void demander()}
              disabled={enCours}
              className="lien-souligne shrink-0 text-xs text-gold disabled:opacity-50"
            >
              Renvoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
