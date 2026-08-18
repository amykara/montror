import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Clock, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { ApiError, envoyerMessageContact } from "@/lib/api";
import { useSettings } from "@/lib/catalog";
import { waLink } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact & service client — MONTR'OR Abidjan" },
      {
        name: "description",
        content:
          "Contactez MONTR'OR par WhatsApp, téléphone ou formulaire. Boutique à Cocody Angré, Abidjan. Ouvert du lundi au samedi.",
      },
      { property: "og:title", content: "Contactez MONTR'OR" },
      {
        property: "og:description",
        content: "WhatsApp, téléphone, adresse et horaires de notre service client à Abidjan.",
      },
    ],
  }),
  component: Contact,
});

function Contact() {
  const settings = useSettings();
  const [form, setForm] = useState({ nom: "", email: "", tel: "", message: "" });
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const valid =
    form.nom.trim().length > 1 && form.tel.trim().length >= 8 && form.message.trim().length >= 10;

  const envoyer = async () => {
    setEnvoiEnCours(true);
    try {
      // Le message est enregistré dans l'admin Django ; plus de faux « envoyé ».
      await envoyerMessageContact({
        nom: form.nom.trim(),
        email: form.email.trim(),
        telephone: form.tel.trim(),
        message: form.message.trim(),
      });
      toast.success("Message envoyé", {
        description: "Nous vous répondons dans les plus brefs délais.",
      });
      setForm({ nom: "", email: "", tel: "", message: "" });
    } catch (err) {
      toast.error("Message non envoyé", {
        description:
          err instanceof ApiError ? err.message : "Réessayez ou écrivez-nous sur WhatsApp.",
      });
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <p className="eyebrow">Nous sommes à votre écoute</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Contact</h1>
      <div className="gold-rule mt-4" />

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <div>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (valid && !envoiEnCours) void envoyer();
            }}
          >
            <div>
              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Nom complet *
              </Label>
              <Input
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                maxLength={80}
                className="mt-2 h-11 rounded-xl"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Téléphone *
                </Label>
                <Input
                  value={form.tel}
                  onChange={(e) => setForm({ ...form, tel: e.target.value })}
                  maxLength={20}
                  placeholder="07 00 00 00 00"
                  className="mt-2 h-11 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  Email
                </Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={120}
                  className="mt-2 h-11 rounded-xl"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
                Message *
              </Label>
              <Textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                maxLength={1000}
                rows={6}
                className="mt-2 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              disabled={!valid || envoiEnCours}
              className="h-12 rounded-xl px-8"
            >
              <Send className="mr-2 size-4" />
              {envoiEnCours ? "Envoi..." : "Envoyer"}
            </Button>
          </form>

          <Button
            asChild
            size="lg"
            className="mt-4 h-12 w-full rounded-xl bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90 sm:w-auto sm:px-8"
          >
            <a
              href={waLink(settings.whatsapp, `Bonjour ${settings.nom}, j'aimerais un renseignement.`)}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle className="mr-2 size-4" />
              Discuter sur WhatsApp
            </a>
          </Button>
        </div>

        <div className="space-y-6">
          <ul className="space-y-4 border border-border p-6 text-sm">
            {settings.telephone_affichage && (
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  <span className="block text-muted-foreground">Téléphone</span>
                  <a href={`tel:${settings.telephone_tel}`} className="hover:text-gold">
                    {settings.telephone_affichage}
                  </a>
                </span>
              </li>
            )}
            {settings.email && (
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  <span className="block text-muted-foreground">Email</span>
                  <a href={`mailto:${settings.email}`} className="hover:text-gold">
                    {settings.email}
                  </a>
                </span>
              </li>
            )}
            {settings.adresse && (
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  <span className="block text-muted-foreground">Adresse</span>
                  {settings.adresse}
                </span>
              </li>
            )}
            {settings.horaires && (
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>
                  <span className="block text-muted-foreground">Horaires</span>
                  {settings.horaires}
                </span>
              </li>
            )}
          </ul>

          <div className="overflow-hidden border border-border">
            <iframe
              title="Carte — MONTR'OR Cocody Angré, Abidjan"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-3.99%2C5.36%2C-3.94%2C5.41&layer=mapnik"
              loading="lazy"
              className="h-80 w-full border-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
