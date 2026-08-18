import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Check, CreditCard, HandCoins, MessageCircle, Smartphone, Truck } from "lucide-react";
import { useShop } from "@/lib/shop";
import { useSettings, useZones } from "@/lib/catalog";
import { formatFcfa, waLink } from "@/lib/site";
import { ApiError, creerCommande, fetchPointsRelais, type PointRelais } from "@/lib/api";
import { EtapeLivraison, type EtatLivraison } from "@/components/etape-livraison";
import { useCompte } from "@/lib/compte";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Commander — Livraison & paiement | MONTR'OR" },
      {
        name: "description",
        content:
          "Finalisez votre commande : livraison Yango à Abidjan ou Jumia en région, paiement à la livraison, Wave, Orange Money ou MTN Money.",
      },
      { property: "og:title", content: "Commander votre montre — MONTR'OR" },
      {
        property: "og:description",
        content: "Livraison 24-48h à Abidjan et paiement à la livraison disponible.",
      },
    ],
  }),
  component: Checkout,
});

const STEPS = ["Informations", "Livraison", "Paiement", "Confirmation"];

/** `mode` est ce que Django enregistre ; l'`id` distingue l'opérateur choisi. */
const PAYMENTS = [
  { id: "livraison", label: "Paiement à la livraison", mode: "livraison", icon: CreditCard },
  { id: "wave", label: "Wave — payé d'avance", mode: "immediat", icon: Smartphone },
  { id: "orange", label: "Orange Money — payé d'avance", mode: "immediat", icon: Smartphone },
  { id: "mtn", label: "MTN Money — payé d'avance", mode: "immediat", icon: Smartphone },
] as const;

const PAIEMENT_ACOMPTE = {
  id: "acompte_50",
  label: "Payez 50 % maintenant et bénéficiez de la livraison gratuite !",
  mode: "acompte_50",
  icon: HandCoins,
} as const;

function Checkout() {
  const navigate = useNavigate();
  const { detailed, subtotal, clearCart, addOrder } = useShop();
  const zones = useZones();
  const settings = useSettings();
  const [step, setStep] = useState(0);
  const { session } = useCompte();
  const [pointsRelais, setPointsRelais] = useState<PointRelais[]>([]);
  const [livraison, setLivraison] = useState<EtatLivraison>({
    mode: "yango",
    zoneId: null,
    adresse: "",
    communeRelais: "",
    relaisId: null,
    latitude: null,
    longitude: null,
  });
  const majLivraison = (maj: Partial<EtatLivraison>) =>
    setLivraison((l) => ({ ...l, ...maj }));

  // Les points relais ne servent qu'ici : on les charge à l'ouverture du
  // checkout plutôt que sur toutes les pages du site.
  // Client connecté : ses coordonnées sont déjà connues, il ne les ressaisit pas.
  useEffect(() => {
    if (!session) return;
    setForm((f) =>
      f.nomComplet || f.telephone
        ? f
        : { nomComplet: session.nom_complet, telephone: session.telephone },
    );
  }, [session]);

  useEffect(() => {
    fetchPointsRelais()
      .then(setPointsRelais)
      .catch(() => setPointsRelais([]));
  }, []);
  const [payment, setPayment] = useState("livraison");
  const [orderRef, setOrderRef] = useState("");
  const [totalPaye, setTotalPaye] = useState(0);
  // Uniquement ce que Django enregistre : le reste, demandé puis jeté,
  // allongeait le formulaire pour rien.
  const [form, setForm] = useState({ nomComplet: "", telephone: "" });

  const zoneChoisie = zones.find((z) => z.id === livraison.zoneId) ?? null;
  const auRelais = livraison.mode === "jumia_relais";

  // Un panier contenant une pièce négociable ouvre droit à l'acompte 50 %,
  // et cet acompte offre la livraison. Django recalcule tout à la création :
  // ces valeurs ne servent qu'à l'affichage.
  const panierNegociable = detailed.some(({ product }) => product.negotiable);
  const acompteDisponible = panierNegociable;

  const optionsPaiement = [
    ...(acompteDisponible ? [PAIEMENT_ACOMPTE] : []),
    // Au point relais, Jumia ne collecte pas le paiement à la remise.
    ...PAYMENTS.filter((p) => !(auRelais && p.mode === "livraison")),
  ];
  const paiementChoisi = optionsPaiement.find((p) => p.id === payment) ?? optionsPaiement[0]!;

  const livraisonValide =
    livraison.mode === "yango"
      ? livraison.zoneId !== null && livraison.adresse.trim().length > 2
      : livraison.relaisId !== null;

  const acompteChoisi = paiementChoisi.mode === "acompte_50" && acompteDisponible;
  const acompte = acompteChoisi ? Math.round(subtotal * 0.5) : 0;
  // Retrait au relais : pas de frais. Acompte : livraison offerte.
  // Acompte : livraison offerte. Sinon relais au tarif fixe, ou tarif de zone.
  const shipping = acompteChoisi
    ? 0
    : auRelais
      ? settings.tarif_point_relais_fcfa
      : (zoneChoisie?.tarif_fcfa ?? 0);
  const total = subtotal + shipping;
  const set = (key: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const step1Valid =
    form.nomComplet.trim().length > 2 && form.telephone.trim().length >= 8;

  if (detailed.length === 0 && step < 3) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="text-3xl">Aucun article à commander</h1>
        <Button asChild size="lg" className="mt-8 rounded-xl">
          <Link to="/catalogue">Découvrir la collection</Link>
        </Button>
      </div>
    );
  }

  const confirm = async () => {
    if (!livraisonValide) {
      toast.error("Livraison incomplète", {
        description:
          livraison.mode === "yango"
            ? "Choisissez votre zone et indiquez l'adresse."
            : "Choisissez le point relais où retirer le colis.",
      });
      return;
    }

    setEnvoiEnCours(true);
    try {
      // Django valide le stock, fige les prix et attribue la référence.
      // Si l'appel échoue, aucune commande n'est créée : on ne prétend pas
      // le contraire au client.
      const commande = await creerCommande({
        client_nom: form.nomComplet.trim(),
        client_telephone: form.telephone.trim(),
        mode_livraison: livraison.mode,
        // Chaque mode n'envoie que ses propres champs : le serveur refuse un
        // mélange des deux.
        ...(livraison.mode === "yango"
          ? {
              zone_livraison: livraison.zoneId,
              adresse: livraison.adresse.trim(),
              latitude: livraison.latitude,
              longitude: livraison.longitude,
            }
          : { point_relais: livraison.relaisId }),
        mode_paiement: paiementChoisi.mode,
        items: detailed.map(({ product, qty }) => ({
          produit_id: Number(product.id),
          quantite: qty,
        })),
      }, session?.jeton);

      // Trace locale : juste de quoi retrouver la commande en un clic.
      addOrder({
        reference: commande.reference,
        phone: form.telephone.trim(),
        createdAt: new Date().toISOString(),
        total: commande.total_fcfa,
      });

      setOrderRef(commande.reference);
      setTotalPaye(commande.total_fcfa);
      clearCart();
      setStep(3);
      toast.success("Commande enregistrée", { description: `Numéro ${commande.reference}` });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "La commande n'a pas pu être envoyée.";
      toast.error("Commande non enregistrée", { description: message });
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-4xl">Commande</h1>
      <div className="gold-rule mt-4" />

      {/* Stepper */}
      <ol className="mt-8 grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => (
          <li key={label} className="min-w-0">
            <div
              className={cn(
                "h-0.5 w-full",
                i <= step ? "bg-gold" : "bg-border",
              )}
            />
            <p
              className={cn(
                "mt-2 truncate text-[0.7rem] uppercase tracking-[0.12em]",
                i <= step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {i + 1}. {label}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <motion.div key={step} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {step === 0 && (
            <div>
              <h2 className="text-2xl">Informations client</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Trois informations suffisent. L'adresse se renseigne à l'étape suivante.
              </p>
              <div className="mt-6 grid gap-4">
                <Field
                  label="Nom complet *"
                  value={form.nomComplet}
                  onChange={(v) => set("nomComplet", v)}
                  placeholder="Prénom et nom"
                />
                <div>
                  <Field
                    label="Téléphone *"
                    value={form.telephone}
                    onChange={(v) => set("telephone", v)}
                    placeholder="07 00 00 00 00"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    C'est ce numéro qui sert à suivre la commande et à vous joindre sur WhatsApp.
                  </p>
                </div>
              </div>
              <Button
                size="lg"
                disabled={!step1Valid}
                onClick={() => setStep(1)}
                className="mt-8 h-12 rounded-xl px-8"
              >
                Continuer
              </Button>
            </div>
          )}

          {step === 1 && (
            <div>
              <EtapeLivraison
                zones={zones}
                pointsRelais={pointsRelais}
                tarifRelais={settings.tarif_point_relais_fcfa}
                etat={livraison}
                onChange={majLivraison}
              />
              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="h-12 rounded-xl" onClick={() => setStep(0)}>
                  Retour
                </Button>
                <Button
                  size="lg"
                  disabled={!livraisonValide}
                  className="h-12 rounded-xl px-8"
                  onClick={() => setStep(2)}
                >
                  Continuer
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl">Mode de paiement</h2>
              {acompteDisponible && (
                <p className="mt-3 rounded-xl border border-gold/40 bg-gold-soft/40 p-4 text-sm">
                  <strong>Payez 50 % maintenant et bénéficiez de la livraison gratuite !</strong>{" "}
                  Soit {formatFcfa(Math.round(subtotal * 0.5))} à verser, le solde à la
                  {auRelais ? " remise" : " livraison"}.
                </p>
              )}

              <RadioGroup value={paiementChoisi.id} onValueChange={setPayment} className="mt-6 space-y-3">
                {optionsPaiement.map((p) => (
                  <label
                    key={p.id}
                    onClick={() => setPayment(p.id)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border p-5 transition-colors",
                      paiementChoisi.id === p.id ? "border-gold bg-gold-soft/40" : "border-border hover:border-gold/50",
                    )}
                  >
                    <RadioGroupItem value={p.id} />
                    <p.icon className="size-4 shrink-0 text-gold" />
                    <span className="text-base">{p.label}</span>
                  </label>
                ))}
              </RadioGroup>

              <div className="mt-6 rounded-xl border border-border bg-muted/40 p-5 text-sm text-muted-foreground">
                {paiementChoisi.mode === "livraison" ? (
                  <p>Vous paierez votre commande lors de la réception du colis.</p>
                ) : (
                  <ol className="list-decimal space-y-1.5 pl-5">
                    <li>Validez la commande pour recevoir les instructions sur WhatsApp.</li>
                    <li>
                      Envoyez{" "}
                      <strong className="text-foreground">
                        {formatFcfa(acompteChoisi ? acompte : total)}
                      </strong>{" "}
                      au {settings.telephone_affichage} via Wave, Orange Money ou MTN Money.
                    </li>
                    <li>Transmettez la capture de paiement, la préparation démarre aussitôt.</li>
                    {acompteChoisi && (
                      <li>
                        Le solde de {formatFcfa(total - acompte)} se règle
                        {auRelais ? " par Mobile Money avant le retrait." : " à la livraison."}
                      </li>
                    )}
                  </ol>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <Button variant="outline" className="h-12 rounded-xl" onClick={() => setStep(1)}>
                  Retour
                </Button>
                <Button
                  size="lg"
                  className="h-12 rounded-xl px-8"
                  onClick={confirm}
                  disabled={envoiEnCours}
                >
                  {envoiEnCours ? "Envoi..." : "Valider la commande"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="grid size-14 place-items-center rounded-full bg-gold-soft">
                <Check className="size-7 text-gold" />
              </div>
              <h2 className="mt-6 text-3xl">Merci {form.nomComplet.split(" ")[0]} !</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Votre commande <strong className="text-foreground">{orderRef}</strong> est
                enregistrée. Nous vous appelons pour confirmation avant expédition.
              </p>
              <p className="mt-4 border border-gold/40 bg-gold-soft/40 p-4 text-sm">
                Notez bien votre numéro <strong>{orderRef}</strong> : avec votre téléphone, il vous
                permet de suivre la commande à tout moment.
              </p>
              <div className="mt-6 space-y-1.5 border border-border p-5 text-sm">
                <p>
                  <span className="text-muted-foreground">Livraison :</span>{" "}
                  {zoneChoisie?.commune} ({zoneChoisie?.delai_estime})
                </p>
                <p>
                  <span className="text-muted-foreground">Paiement :</span>{" "}
                  {paiementChoisi.label}
                </p>
                <p>
                  <span className="text-muted-foreground">Total :</span>{" "}
                  <span className="font-medium text-gold">{formatFcfa(totalPaye)}</span>
                </p>
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="h-12 rounded-xl bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
                  asChild
                >
                  <a
                    href={waLink(
                      settings.whatsapp,
                      `Bonjour ${settings.nom}, je viens de passer la commande ${orderRef} (${formatFcfa(totalPaye)}).`,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <MessageCircle className="mr-2 size-4" />
                    Confirmer sur WhatsApp
                  </a>
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 rounded-xl"
                  onClick={() => navigate({ to: "/suivi", search: { ref: orderRef } })}
                >
                  Suivre ma commande
                </Button>
              </div>
            </div>
          )}
        </motion.div>

        {step < 3 && (
          <aside className="h-fit border border-border bg-muted/40 p-6">
            <h2 className="text-xl">Récapitulatif</h2>
            <ul className="mt-4 space-y-3 text-sm">
              {detailed.map(({ product, qty, price }) => (
                <li key={product.slug} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-muted-foreground">
                    {qty} × {product.name}
                  </span>
                  <span className="shrink-0">{formatFcfa(price * qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-5 space-y-2.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Sous-total</dt>
                <dd>{formatFcfa(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Livraison</dt>
                <dd>{formatFcfa(shipping)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2.5 text-base font-medium">
                <dt>Total</dt>
                <dd className="text-gold">{formatFcfa(total)}</dd>
              </div>
            </dl>
          </aside>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</Label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 h-11 rounded-xl"
      />
    </div>
  );
}
