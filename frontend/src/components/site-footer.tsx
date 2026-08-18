import { Link } from "@tanstack/react-router";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { useSettings } from "@/lib/catalog";
import { waLink } from "@/lib/site";

export function SiteFooter() {
  const settings = useSettings();

  return (
    <footer className="border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div>
          <span className="font-display text-xl tracking-[0.28em]">{settings.nom}</span>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
            Montres sélectionnées pour hommes et femmes, livrées partout en Côte d'Ivoire.
            L'élégance, au juste prix.
          </p>
        </div>

        <div>
          <h3 className="eyebrow">Boutique</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link to="/catalogue" className="transition-colors hover:text-foreground">
                Toutes les montres
              </Link>
            </li>
            <li>
              <Link
                to="/catalogue"
                search={{ genre: "Homme" }}
                className="transition-colors hover:text-foreground"
              >
                Montres homme
              </Link>
            </li>
            <li>
              <Link
                to="/catalogue"
                search={{ genre: "Femme" }}
                className="transition-colors hover:text-foreground"
              >
                Montres femme
              </Link>
            </li>
            <li>
              <Link to="/favoris" className="transition-colors hover:text-foreground">
                Mes favoris
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow">Aide</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li>
              <Link to="/suivi" className="transition-colors hover:text-foreground">
                Suivre ma commande
              </Link>
            </li>
            <li>
              <Link to="/contact" className="transition-colors hover:text-foreground">
                Nous contacter
              </Link>
            </li>
            <li>
              <Link to="/a-propos" className="transition-colors hover:text-foreground">
                À propos
              </Link>
            </li>
            <li>
              <a
                href={waLink(
                  settings.whatsapp,
                  `Bonjour, j'ai une question sur mes achats chez ${settings.nom}.`,
                )}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-foreground"
              >
                Service client WhatsApp
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h3 className="eyebrow">Contact</h3>
          <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
            {settings.telephone_affichage && (
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 size-4 shrink-0 text-gold" />
                <a href={`tel:${settings.telephone_tel}`}>{settings.telephone_affichage}</a>
              </li>
            )}
            {settings.whatsapp && (
              <li className="flex items-start gap-2.5">
                <MessageCircle className="mt-0.5 size-4 shrink-0 text-gold" />
                <a
                  href={waLink(settings.whatsapp, `Bonjour ${settings.nom} !`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              </li>
            )}
            {settings.email && (
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 size-4 shrink-0 text-gold" />
                <a href={`mailto:${settings.email}`}>{settings.email}</a>
              </li>
            )}
            {settings.adresse && (
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>{settings.adresse}</span>
              </li>
            )}
            {settings.horaires && (
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-gold" />
                <span>{settings.horaires}</span>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
        © {new Date().getFullYear()} {settings.nom} — Paiement à la livraison, Wave, Orange Money,
        MTN Money.
      </div>
    </footer>
  );
}
