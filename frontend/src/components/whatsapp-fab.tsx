import { MessageCircle } from "lucide-react";
import { useSettings } from "@/lib/catalog";
import { waLink } from "@/lib/site";

export function WhatsAppFab() {
  const settings = useSettings();
  if (!settings.whatsapp) return null;

  return (
    <a
      href={waLink(
        settings.whatsapp,
        `Bonjour ${settings.nom}, je souhaite des informations sur vos montres.`,
      )}
      target="_blank"
      rel="noreferrer"
      aria-label="Discuter sur WhatsApp"
      className="bouton-whatsapp-flottant fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-whatsapp px-4 py-3.5 text-whatsapp-foreground shadow-elegant transition-all duration-300 hover:scale-105"
    >
      <MessageCircle className="size-5" />
      <span className="hidden text-sm font-medium sm:inline">WhatsApp</span>
    </a>
  );
}
