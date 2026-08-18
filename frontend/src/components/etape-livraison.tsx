import { Home, Loader2, MapPin, Store, Truck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { DeliveryZone, PointRelais } from "@/lib/api";
import { autorisationPosition, detecterPosition, ErreurGeolocalisation } from "@/lib/geolocalisation";
import { formatFcfa } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type ModeLivraison = "yango" | "jumia_relais";

export type EtatLivraison = {
  mode: ModeLivraison;
  zoneId: number | null;
  adresse: string;
  communeRelais: string;
  relaisId: number | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Choix du mode de livraison. Les deux branches ne demandent pas les mêmes
 * informations : à domicile il faut une zone et une adresse, en point relais
 * il faut choisir le relais et rien d'autre.
 */
export function EtapeLivraison({
  zones,
  pointsRelais,
  tarifRelais,
  etat,
  onChange,
}: {
  zones: DeliveryZone[];
  pointsRelais: PointRelais[];
  tarifRelais: number;
  etat: EtatLivraison;
  onChange: (maj: Partial<EtatLivraison>) => void;
}) {
  const [localisationEnCours, setLocalisationEnCours] = useState(false);
  // Une seule tentative automatique par visite : on ne harcèle pas le client.
  const tentativeAuto = useRef(false);

  const communes = useMemo(
    () => [...new Set(pointsRelais.map((p) => p.commune))].sort(),
    [pointsRelais],
  );
  const relaisDeLaCommune = useMemo(
    () => pointsRelais.filter((p) => p.commune === etat.communeRelais),
    [pointsRelais, etat.communeRelais],
  );
  const relaisChoisi = pointsRelais.find((p) => p.id === etat.relaisId) ?? null;

  const localiser = async () => {
    setLocalisationEnCours(true);
    try {
      const position = await detecterPosition();
      onChange({
        latitude: position.latitude,
        longitude: position.longitude,
        // On ne remplace pas une adresse déjà saisie sans le dire.
        ...(position.adresse ? { adresse: position.adresse } : {}),
      });
      toast.success(
        position.adresse ? "Position détectée" : "Position enregistrée",
        {
          description: position.adresse
            ? "Corrigez l'adresse si elle n'est pas exacte."
            : "L'adresse n'a pas pu être devinée, saisissez-la à la main.",
        },
      );
    } catch (err) {
      toast.error("Localisation impossible", {
        description:
          err instanceof ErreurGeolocalisation ? err.message : "Réessayez plus tard.",
      });
    } finally {
      setLocalisationEnCours(false);
    }
  };

  /**
   * Détection lancée d'elle-même quand le client choisit la livraison à
   * domicile. On ne le fait pas au chargement de la page : la demande
   * d'autorisation n'aurait aucun contexte. Et on ne redemande jamais si
   * l'autorisation a déjà été refusée.
   */
  useEffect(() => {
    if (etat.mode !== "yango" || tentativeAuto.current) return;
    if (etat.adresse.trim() || etat.latitude !== null) return;
    tentativeAuto.current = true;

    let annule = false;
    (async () => {
      if ((await autorisationPosition()) === "denied") return;
      setLocalisationEnCours(true);
      try {
        const position = await detecterPosition((latitude, longitude) => {
          if (!annule) onChange({ latitude, longitude });
        });
        if (annule) return;
        onChange({
          latitude: position.latitude,
          longitude: position.longitude,
          ...(position.adresse ? { adresse: position.adresse } : {}),
        });
        if (position.adresse) {
          toast.success("Adresse détectée", {
            description: "Corrigez-la si elle n'est pas exacte.",
          });
        }
      } catch {
        // Refus ou échec : le client saisit à la main, sans message d'alerte.
      } finally {
        // Sans condition : si on ne coupait le voyant que quand la tentative
        // est encore valable, un démontage en cours de route laisserait le
        // champ figé sur « Détection de votre position… » pour toujours.
        setLocalisationEnCours(false);
      }
    })();

    return () => {
      annule = true;
      // React monte, démonte puis remonte les effets en développement.
      // Sans cette remise à zéro, la seconde exécution sortirait aussitôt sur
      // le garde-fou et aucune détection n'aboutirait jamais.
      tentativeAuto.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etat.mode]);

  const Choix = ({
    valeur,
    titre,
    detail,
    icone: Icone,
  }: {
    valeur: ModeLivraison;
    titre: string;
    detail: string;
    icone: typeof Home;
  }) => (
    <label
      // Un bouton radio Radix n'est pas activé par un clic sur son libellé :
      // on rend la carte entière cliquable, sinon seule la pastille répond.
      onClick={() => onChange({ mode: valeur, ...(valeur === "yango"
        ? { communeRelais: "", relaisId: null }
        : { zoneId: null, adresse: "", latitude: null, longitude: null }) })}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border p-5 transition-colors",
        etat.mode === valeur ? "border-gold bg-gold-soft/40" : "border-border hover:border-gold/50",
      )}
    >
      <RadioGroupItem value={valeur} className="mt-1" />
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-base">
          <Icone className="size-4 shrink-0 text-gold" />
          {titre}
        </span>
        <span className="mt-1 block text-sm text-muted-foreground">{detail}</span>
      </span>
    </label>
  );

  return (
    <div>
      <h2 className="text-2xl">Mode de livraison</h2>

      <RadioGroup
        value={etat.mode}
        onValueChange={(v) =>
          onChange({
            mode: v as ModeLivraison,
            // On repart propre : les champs de l'autre mode sont vidés, sinon
            // le serveur refuse la commande pour incohérence.
            ...(v === "yango"
              ? { communeRelais: "", relaisId: null }
              : { zoneId: null, adresse: "", latitude: null, longitude: null }),
          })
        }
        className="mt-6 grid gap-3 sm:grid-cols-2"
      >
        <Choix
          valeur="yango"
          titre="À domicile"
          detail="Un livreur Yango vous apporte le colis"
          icone={Home}
        />
        <Choix
          valeur="jumia_relais"
          titre="Point Relais Jumia"
          detail={`Vous retirez le colis au relais — ${formatFcfa(tarifRelais)}`}
          icone={Store}
        />
      </RadioGroup>

      {etat.mode === "yango" ? (
        <div className="mt-8 space-y-6">
          <div>
            <Label className="eyebrow">Zone de livraison</Label>
            <RadioGroup
              value={etat.zoneId === null ? "" : String(etat.zoneId)}
              onValueChange={(v) => onChange({ zoneId: Number(v) })}
              className="mt-3 space-y-3"
            >
              {zones.map((z) => (
                <label
                  key={z.id}
                  onClick={() => onChange({ zoneId: z.id })}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                    etat.zoneId === z.id ? "border-gold bg-gold-soft/40" : "border-border hover:border-gold/50",
                  )}
                >
                  <RadioGroupItem value={String(z.id)} className="mt-1" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-base">
                      <Truck className="size-4 shrink-0 text-gold" />
                      {z.commune}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {z.ville} — livraison estimée {z.delai_estime}
                    </span>
                  </span>
                  <span className="prix shrink-0 text-sm font-medium">
                    {formatFcfa(z.tarif_fcfa)}
                  </span>
                </label>
              ))}
            </RadioGroup>
            {zones.length === 0 && (
              <p className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                Aucune zone de livraison disponible pour le moment.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="adresse-livraison" className="eyebrow">
              Adresse précise
            </Label>
            <div className="mt-3 flex gap-2">
              <Input
                id="adresse-livraison"
                value={etat.adresse}
                onChange={(e) => onChange({ adresse: e.target.value })}
                placeholder="Quartier, rue, repère connu…"
                className="h-12 rounded-xl"
              />
              <Button
                type="button"
                variant="outline"
                onClick={localiser}
                disabled={localisationEnCours}
                aria-label="Relancer la détection de ma position"
                title="Relancer la détection de ma position"
                className="size-12 shrink-0 rounded-xl border-gold text-gold hover:bg-gold-soft"
              >
                {localisationEnCours ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <MapPin className="size-5" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {localisationEnCours
                ? "Détection de votre position…"
                : "Un repère connu (pharmacie, école, carrefour) aide plus qu'un nom de rue."}
              {etat.latitude !== null && " Votre position a été enregistrée pour le livreur."}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-6">
          <div>
            <Label className="eyebrow">Commune du relais</Label>
            <Select
              value={etat.communeRelais}
              onValueChange={(v) => onChange({ communeRelais: v, relaisId: null })}
            >
              <SelectTrigger className="mt-3 h-12 rounded-xl">
                <SelectValue placeholder="Choisir une commune" />
              </SelectTrigger>
              <SelectContent>
                {communes.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {etat.communeRelais && (
            <div>
              <Label className="eyebrow">Point relais</Label>
              <RadioGroup
                value={etat.relaisId === null ? "" : String(etat.relaisId)}
                onValueChange={(v) => onChange({ relaisId: Number(v) })}
                className="mt-3 space-y-3"
              >
                {relaisDeLaCommune.map((r) => (
                  <label
                    key={r.id}
                    onClick={() => onChange({ relaisId: r.id })}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors",
                      etat.relaisId === r.id ? "border-gold bg-gold-soft/40" : "border-border hover:border-gold/50",
                    )}
                  >
                    <RadioGroupItem value={String(r.id)} className="mt-1" />
                    <span className="min-w-0">
                      <span className="block text-base">{r.nom}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{r.adresse}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>
          )}

          {relaisChoisi && (
            <p className="rounded-xl border border-gold/40 bg-gold-soft/40 p-4 text-sm">
              Retrait chez <strong>{relaisChoisi.nom}</strong>, {relaisChoisi.commune} —{" "}
              {formatFcfa(tarifRelais)}. Le règlement se fait d'avance par Mobile Money.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
