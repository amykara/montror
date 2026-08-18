/**
 * Détection de l'adresse du client à partir du GPS du navigateur.
 *
 * Le géocodage inverse passe par Nominatim (OpenStreetMap), gratuit. Sa
 * politique d'usage impose une requête par seconde au maximum et un
 * User-Agent identifiable — celui-ci n'est pas modifiable depuis un
 * navigateur, on s'en tient donc au débit et au `Referer` du site.
 *
 * À Abidjan l'adressage est largement informel : le texte renvoyé est souvent
 * approximatif. Il sert de point de départ, le client corrige ensuite. Les
 * coordonnées, elles, sont enregistrées telles quelles sur la commande — c'est
 * ce qui aide réellement le livreur.
 */

export type PositionDetectee = {
  latitude: number;
  longitude: number;
  /** Adresse lisible, vide si le géocodage n'a rien donné. */
  adresse: string;
};

/** Empêche de dépasser le débit toléré par Nominatim. */
let dernierAppel = 0;
const DELAI_MINIMAL_MS = 1100;

/**
 * Au-delà, on abandonne le géocodage.
 * Sans ce plafond, une connexion mobile qui traîne laisse le champ bloqué sur
 * « Détection de votre position… » indéfiniment. Les coordonnées sont déjà
 * acquises à ce stade : c'est le libellé, un simple confort, qu'on lâche.
 */
const DELAI_GEOCODAGE_MS = 8000;

export class ErreurGeolocalisation extends Error {}

function positionActuelle(): Promise<GeolocationPosition> {
  return new Promise((resolve, rejeter) => {
    if (!("geolocation" in navigator)) {
      rejeter(new ErreurGeolocalisation("Votre navigateur ne gère pas la localisation."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      const messages: Record<number, string> = {
        1: "Vous avez refusé l'accès à votre position. Saisissez l'adresse à la main.",
        2: "Position indisponible pour le moment. Réessayez dehors ou saisissez l'adresse.",
        3: "La localisation a pris trop de temps. Réessayez.",
      };
      rejeter(new ErreurGeolocalisation(messages[err.code] ?? "Localisation impossible."));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
}

async function adresseDepuisCoordonnees(lat: number, lon: number): Promise<string> {
  const attente = DELAI_MINIMAL_MS - (Date.now() - dernierAppel);
  if (attente > 0) await new Promise((r) => setTimeout(r, attente));
  dernierAppel = Date.now();

  const params = new URLSearchParams({
    format: "json",
    lat: String(lat),
    lon: String(lon),
    zoom: "18",
    addressdetails: "1",
    "accept-language": "fr",
  });

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(DELAI_GEOCODAGE_MS),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };

    // On préfère une adresse courte et utile à la chaîne complète, qui finit
    // par « Côte d'Ivoire, Afrique » et n'aide personne.
    const a = data.address ?? {};
    const morceaux = [
      a["road"] ?? a["pedestrian"] ?? a["residential"],
      a["neighbourhood"] ?? a["suburb"] ?? a["quarter"],
      a["city_district"] ?? a["town"] ?? a["city"] ?? a["municipality"],
    ].filter(Boolean);

    return morceaux.length > 0 ? morceaux.join(", ") : (data.display_name ?? "");
  } catch {
    return ""; // le géocodage est un confort : son échec ne bloque rien
  }
}

/**
 * `surCoordonnees` est appelé dès que le GPS a répondu, sans attendre le
 * géocodage : le livreur a besoin des coordonnées, pas du libellé. Elles sont
 * ainsi enregistrées même si le client valide sa commande pendant que le
 * géocodage tourne encore.
 */
export async function detecterPosition(
  surCoordonnees?: (lat: number, lon: number) => void,
): Promise<PositionDetectee> {
  const { coords } = await positionActuelle();
  surCoordonnees?.(coords.latitude, coords.longitude);
  const adresse = await adresseDepuisCoordonnees(coords.latitude, coords.longitude);
  return { latitude: coords.latitude, longitude: coords.longitude, adresse };
}


/**
 * État de l'autorisation, sans déclencher de demande.
 * Sert à ne pas relancer une demande déjà refusée : le navigateur afficherait
 * une bannière bloquée et le client verrait une erreur pour rien.
 */
export async function autorisationPosition(): Promise<PermissionState | "inconnu"> {
  if (!("permissions" in navigator)) return "inconnu";
  try {
    const p = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return p.state;
  } catch {
    return "inconnu";
  }
}
