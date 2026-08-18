/**
 * Helpers d'affichage. Les coordonnées de la boutique ne sont plus ici :
 * elles viennent de l'admin Django via `useSettings()`.
 */

export function waLink(whatsapp: string, message: string) {
  if (!whatsapp) return "#";
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
}

export function formatFcfa(value: number) {
  // toLocaleString insère des espaces fines/insécables : on les normalise.
  return `${value.toLocaleString("fr-FR").replace(/[  ]/g, " ")} FCFA`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
