import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { ApiError, requeteCompte, type SessionCompte } from "@/lib/api";

/**
 * Session client — facultative.
 *
 * On peut commander sans compte : le suivi se fait alors par référence +
 * téléphone. Le compte ne sert qu'au confort (coordonnées pré-remplies,
 * historique retrouvé d'un appareil à l'autre).
 *
 * Le jeton est conservé dans le navigateur. C'est exposé à une faille XSS,
 * ce qui reste acceptable ici : le compte ne donne accès qu'à un historique
 * de commandes, jamais à un moyen de paiement.
 */

const CLE_JETON = "mo_jeton";

type CompteCtx = {
  session: SessionCompte | null;
  pret: boolean;
  connecter: (telephone: string, motDePasse: string) => Promise<void>;
  inscrire: (
    nomComplet: string,
    telephone: string,
    email: string,
    motDePasse: string,
  ) => Promise<void>;
  /** Ouvre une session à partir d'une réponse déjà obtenue — la
   *  réinitialisation de mot de passe en renvoie une. */
  ouvrirSession: (s: SessionCompte) => void;
  deconnecter: () => Promise<void>;
};

const Contexte = createContext<CompteCtx | null>(null);

export function useCompte() {
  const ctx = useContext(Contexte);
  if (!ctx) throw new Error("useCompte doit être utilisé dans <CompteProvider>");
  return ctx;
}

export function lireJeton(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(CLE_JETON);
}

export function CompteProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionCompte | null>(null);
  const [pret, setPret] = useState(false);

  // Au chargement, on vérifie que le jeton mémorisé est toujours valide :
  // il a pu être révoqué côté serveur.
  useEffect(() => {
    const jeton = lireJeton();
    if (!jeton) {
      setPret(true);
      return;
    }
    requeteCompte<{ nom_complet: string; telephone: string }>("/compte/moi/", { jeton })
      .then((profil) =>
        setSession({ jeton, nom_complet: profil.nom_complet, telephone: profil.telephone }),
      )
      .catch(() => localStorage.removeItem(CLE_JETON))
      .finally(() => setPret(true));
  }, []);

  const ouvrirSession = useCallback((s: SessionCompte) => {
    localStorage.setItem(CLE_JETON, s.jeton);
    setSession(s);
  }, []);

  const connecter = useCallback(
    async (telephone: string, motDePasse: string) => {
      ouvrirSession(
        await requeteCompte<SessionCompte>("/compte/connexion/", {
          corps: { telephone, mot_de_passe: motDePasse },
        }),
      );
    },
    [ouvrirSession],
  );

  const inscrire = useCallback(
    async (nomComplet: string, telephone: string, email: string, motDePasse: string) => {
      ouvrirSession(
        await requeteCompte<SessionCompte>("/compte/inscription/", {
          corps: {
            nom_complet: nomComplet,
            telephone,
            email,
            mot_de_passe: motDePasse,
          },
        }),
      );
    },
    [ouvrirSession],
  );

  const deconnecter = useCallback(async () => {
    const jeton = lireJeton();
    localStorage.removeItem(CLE_JETON);
    setSession(null);
    if (jeton) {
      // Révocation côté serveur ; si elle échoue, la session locale est déjà
      // fermée, ce qui est le plus important pour le client.
      await requeteCompte("/compte/deconnexion/", { jeton, corps: {} }).catch(() => {});
    }
  }, []);

  return (
    <Contexte.Provider value={{ session, pret, connecter, inscrire, ouvrirSession, deconnecter }}>
      {children}
    </Contexte.Provider>
  );
}

export { ApiError };
