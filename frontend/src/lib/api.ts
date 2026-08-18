const API_URL = import.meta.env["VITE_API_URL"] || "http://127.0.0.1:8000/api";

/* ------------------------------------------------------------------ */
/* Types renvoyés par Django                                           */
/* ------------------------------------------------------------------ */

type ApiCategory = { id: number; name: string; slug: string };

type ApiProduct = {
  id: number;
  nom: string;
  slug: string;
  reference: string;
  marque: string;
  style: string;
  categorie: ApiCategory | null;
  description: string;
  prix_vente_fcfa: number | null;
  prix_a_negocier: boolean;
  ancien_prix_fcfa: number | null;
  negociable: boolean;
  acompte_pourcent: number;
  mise_en_avant: boolean;
  couleur: string;
  bracelet: string;
  mouvement: string;
  etanche: boolean;
  diametre: string;
  matiere: string;
  garantie: string;
  fonctions: string[];
  livre_avec: string;
  video_url: string;
  popularite: number;
  stock: number;
  disponible: boolean;
  cree_le: string;
  images: string[];
  videos: string[];
};

export type DeliveryZone = {
  id: number;
  commune: string;
  ville: string;
  tarif_fcfa: number;
  delai_estime: string;
};

export type PointRelais = {
  id: number;
  commune: string;
  nom: string;
  adresse: string;
};

export type SiteSettings = {
  nom: string;
  slogan: string;
  telephone_affichage: string;
  telephone_tel: string;
  whatsapp: string;
  email: string;
  adresse: string;
  horaires: string;
  tarif_point_relais_fcfa: number;
};

export type Review = {
  id: number;
  nom: string;
  ville: string;
  note: number;
  texte: string;
};

export type Faq = { id: number; question: string; reponse: string };

export type SessionCompte = {
  jeton: string;
  nom_complet: string;
  telephone: string;
};

export type TrackedOrder = {
  reference: string;
  client_nom: string;
  /** Nul quand la commande est retirée en point relais. */
  zone_livraison: DeliveryZone | null;
  /** Nul quand la commande est livrée à domicile. */
  point_relais: { id: number; commune: string; nom: string; adresse: string } | null;
  mode_livraison: string;
  mode_livraison_libelle: string;
  mode_paiement: string;
  mode_paiement_libelle: string;
  statut: string;
  statut_libelle: string;
  etape_index: number;
  items: {
    id: number;
    nom: string;
    slug: string;
    quantite: number;
    prix_unitaire_fcfa: number;
    sous_total: number;
  }[];
  frais_livraison_fcfa: number;
  total_produits_fcfa: number;
  total_fcfa: number;
  acompte_fcfa: number;
  reste_a_payer_fcfa: number;
  cree_le: string;
  maj_le: string;
};

/* ------------------------------------------------------------------ */
/* Transport                                                           */
/* ------------------------------------------------------------------ */

/** Erreur d'API porteuse du statut HTTP et des messages renvoyés par Django. */
export class ApiError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status: number, details: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

/** Aplatit les erreurs DRF ({champ: [messages]}) en une liste lisible. */
function extraireMessages(payload: unknown): string[] {
  if (typeof payload === "string") return [payload];
  if (Array.isArray(payload)) return payload.flatMap(extraireMessages);
  if (payload && typeof payload === "object") {
    return Object.values(payload as Record<string, unknown>).flatMap(extraireMessages);
  }
  return [];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Impossible de joindre le serveur. Vérifiez votre connexion.", 0);
  }

  if (!res.ok) {
    let details: string[] = [];
    try {
      details = extraireMessages(await res.json());
    } catch {
      /* réponse non-JSON : on garde le message générique */
    }
    const message =
      details[0] ??
      (res.status === 429
        ? "Trop de tentatives. Réessayez dans quelques minutes."
        : `Erreur serveur (${res.status}).`);
    throw new ApiError(message, res.status, details);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Les endpoints de liste non paginés renvoient un tableau ; les autres {results}. */
function toArray<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : (data?.results ?? []);
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

/** Image de repli quand un produit n'a pas encore de photo (SVG inline, aucun réseau). */
export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
      <rect width="400" height="400" fill="#f4f2ef"/>
      <circle cx="200" cy="200" r="82" fill="none" stroke="#c9a227" stroke-width="3"/>
      <circle cx="200" cy="200" r="4" fill="#c9a227"/>
      <path d="M200 200V148M200 200l38 22" stroke="#c9a227" stroke-width="3" stroke-linecap="round"/>
      <path d="M168 122l6-26h52l6 26M168 278l6 26h52l6-26" fill="none" stroke="#c9a227" stroke-width="3"/>
      <text x="200" y="352" text-anchor="middle" font-family="serif" font-size="20" fill="#b9b2a6">photo à venir</text>
    </svg>`,
  );

function mapProduct(p: ApiProduct) {
  return {
    id: String(p.id),
    slug: p.slug,
    name: p.nom,
    ref: p.reference,
    brand: p.marque,
    category: p.categorie?.name ?? "",
    style: (p.style as "Luxe" | "Sport" | "Classique") || "Classique",
    /** `null` = prix pas encore fixé : on invite à contacter la boutique. */
    price: p.prix_vente_fcfa,
    priceOnRequest: p.prix_a_negocier,
    negotiable: p.negociable,
    /** 0 = payable entièrement à la livraison ; 50 = moitié d'avance exigée. */
    acomptePourcent: p.acompte_pourcent ?? 0,
    /** Faux = reste au catalogue mais jamais en vitrine sur l'accueil. */
    enVitrine: p.mise_en_avant !== false,
    oldPrice: p.ancien_prix_fcfa ?? undefined,
    images: p.images.length > 0 ? p.images : [IMAGE_PLACEHOLDER],
    /** Vidéos hébergées par Django (+ URL externe si renseignée dans l'admin). */
    videos: p.videos ?? [],
    hasRealPhoto: p.images.length > 0,
    /** Un produit sans prix ne passe pas par le panier : il se négocie. */
    canBuy: p.prix_vente_fcfa !== null && p.disponible && p.stock > 0,
    inStock: p.disponible && p.stock > 0,
    stock: p.stock,
    popularity: p.popularite,
    createdAt: p.cree_le,
    strap: p.bracelet,
    color: p.couleur,
    description: p.description,
    fonctions: p.fonctions ?? [],
    livreAvec: p.livre_avec || "",
    garantie: p.garantie || "",
    /**
     * Seules les caractéristiques réellement renseignées : une ligne vide
     * n'est pas affichée plutôt que de montrer un tiret. Rien n'est déduit
     * ni inventé — ce qui n'a pas été mesuré reste absent.
     */
    specs: [
      ["Marque", p.marque],
      ["Catégorie", p.categorie?.name ?? ""],
      ["Style", p.style],
      ["Type de mouvement", p.mouvement],
      ["Bracelet", p.bracelet],
      ["Couleur", p.couleur],
      ["Diamètre", p.diametre],
      ["Matière", p.matiere],
      ["Résistance à l'eau", p.etanche ? "Étanche (usage quotidien)" : ""],
      ["Garantie", p.garantie],
    ].filter((ligne): ligne is [string, string] => Boolean(ligne[1])),
  };
}

export type Product = ReturnType<typeof mapProduct>;

/**
 * Charge le catalogue complet. L'API pagine : on suit les pages suivantes
 * jusqu'au bout, sinon un catalogue de 98 montres s'afficherait tronqué.
 */
export async function fetchProducts(): Promise<Product[]> {
  const produits: ApiProduct[] = [];
  let chemin: string | null = "/produits/?ordering=-cree_le&page_size=200";

  while (chemin) {
    const page: { results?: ApiProduct[]; next?: string | null } | ApiProduct[] =
      await request(chemin);

    if (Array.isArray(page)) {
      produits.push(...page);
      break;
    }
    produits.push(...(page.results ?? []));
    // `next` est une URL absolue : on ne garde que la partie après /api.
    chemin = page.next ? new URL(page.next).pathname.replace(/^.*\/api/, "") + new URL(page.next).search : null;
    if (produits.length > 2000) break; // garde-fou anti-boucle
  }

  return produits.map(mapProduct);
}

/** Fiche produit à jour (prix, stock) au moment où la page est demandée. */
export async function fetchProduct(slug: string): Promise<Product | null> {
  try {
    return mapProduct(await request<ApiProduct>(`/produits/${encodeURIComponent(slug)}/`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
  return toArray(await request<DeliveryZone[] | { results: DeliveryZone[] }>("/zones-livraison/"));
}

export async function fetchPointsRelais(): Promise<PointRelais[]> {
  return toArray(await request<PointRelais[] | { results: PointRelais[] }>("/points-relais/"));
}

export async function fetchSettings(): Promise<SiteSettings> {
  return request<SiteSettings>("/reglages/");
}

export async function fetchReviews(): Promise<Review[]> {
  return toArray(await request<Review[] | { results: Review[] }>("/avis/"));
}

export async function fetchFaqs(): Promise<Faq[]> {
  return toArray(await request<Faq[] | { results: Faq[] }>("/faq/"));
}

/* ------------------------------------------------------------------ */
/* Commandes                                                           */
/* ------------------------------------------------------------------ */

export type CreatedOrder = {
  id: number;
  reference: string;
  frais_livraison_fcfa: number;
  total_fcfa: number;
  acompte_fcfa: number;
  reste_a_payer_fcfa: number;
};

export async function creerCommande(payload: {
  client_nom: string;
  client_telephone: string;
  mode_livraison: "yango" | "jumia_relais";
  /** Domicile uniquement. */
  zone_livraison?: number | null;
  adresse?: string;
  /** Point relais uniquement. */
  point_relais?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  mode_paiement: string;
  items: { produit_id: number; quantite: number }[];
}, jeton?: string | null): Promise<CreatedOrder> {
  return request<CreatedOrder>("/commandes/", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Connecté : la commande rejoint l'historique du compte.
      ...(jeton ? { Authorization: `Token ${jeton}` } : {}),
    },
    body: JSON.stringify(payload),
  });
}

/** Suivi public : la référence seule ne suffit pas, il faut aussi le téléphone. */
export async function suivreCommande(
  reference: string,
  telephone: string,
): Promise<TrackedOrder> {
  const params = new URLSearchParams({
    reference: reference.trim(),
    telephone: telephone.trim(),
  });
  return request<TrackedOrder>(`/commandes/suivi/?${params}`);
}

/**
 * Appel authentifié au compte client. Séparé de `request` parce qu'il porte
 * un jeton et que les erreurs de champ doivent remonter telles quelles au
 * formulaire.
 */
export async function requeteCompte<T>(
  chemin: string,
  options: { jeton?: string; corps?: unknown } = {},
): Promise<T> {
  const entetes: Record<string, string> = { Accept: "application/json" };
  if (options.jeton) entetes["Authorization"] = `Token ${options.jeton}`;
  if (options.corps !== undefined) entetes["Content-Type"] = "application/json";

  return request<T>(chemin, {
    method: options.corps !== undefined ? "POST" : "GET",
    headers: entetes,
    ...(options.corps !== undefined ? { body: JSON.stringify(options.corps) } : {}),
  });
}

export async function envoyerMessageContact(payload: {
  nom: string;
  email: string;
  telephone: string;
  message: string;
}) {
  return request("/contact/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
