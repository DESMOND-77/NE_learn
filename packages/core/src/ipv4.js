/**
 * NE_learn — domaine IPv4.
 * Fonctions pures, sans dépendance : parse, masque, subnet, binaire, découpage.
 * Toutes les adresses sont manipulées en entiers non signés 32 bits.
 */

export class IPv4Error extends Error {
  constructor(message) { super(message); this.name = 'IPv4Error'; }
}

const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_RE = new RegExp(`^${OCTET}\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

export function isValidIPv4(value) {
  return typeof value === 'string' && IPV4_RE.test(value.trim());
}

export function ipv4ToInt(value) {
  if (!isValidIPv4(value)) throw new IPv4Error(`Adresse IPv4 invalide : « ${value} ». Format attendu : a.b.c.d avec 0 ≤ a,b,c,d ≤ 255.`);
  return value.trim().split('.').reduce((acc, o) => acc * 256 + Number(o), 0) >>> 0;
}

export function intToIPv4(int) {
  if (!Number.isInteger(int) || int < 0 || int > 0xffffffff) throw new IPv4Error('Entier 32 bits hors plage.');
  return [(int >>> 24) & 255, (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
}

export function isValidMask(value) {
  if (!isValidIPv4(value)) return false;
  const int = ipv4ToInt(value);
  if (int === 0) return true;
  const inv = (~int) >>> 0;
  return ((inv + 1) & inv) === 0; // inverse + 1 doit être une puissance de 2 => bits contigus
}

export function maskToPrefix(mask) {
  if (!isValidMask(mask)) throw new IPv4Error(`Masque invalide : « ${mask} ». Les bits à 1 doivent être contigus.`);
  const int = ipv4ToInt(mask);
  let prefix = 0;
  for (let i = 31; i >= 0; i--) { if ((int >>> i) & 1) prefix++; else break; }
  return prefix;
}

export function prefixToMaskInt(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new IPv4Error('Préfixe CIDR invalide (0 à 32).');
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

export function prefixToMask(prefix) { return intToIPv4(prefixToMaskInt(prefix)); }

/** Accepte « 24 », « /24 » ou « 255.255.255.0 » et renvoie le préfixe. */
export function parseMaskOrPrefix(input) {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0 || input > 32) throw new IPv4Error('Préfixe CIDR invalide (0 à 32).');
    return input;
  }
  if (typeof input !== 'string') throw new IPv4Error('Masque ou préfixe invalide.');
  const s = input.trim().replace(/^\//, '');
  if (/^\d{1,2}$/.test(s)) {
    const p = Number(s);
    if (p > 32) throw new IPv4Error('Préfixe CIDR invalide (0 à 32).');
    return p;
  }
  return maskToPrefix(s);
}

export function toBinaryIPv4(value) {
  const int = typeof value === 'number' ? value : ipv4ToInt(value);
  return [24, 16, 8, 0].map((shift) => ((int >>> shift) & 255).toString(2).padStart(8, '0')).join('.');
}

export function classifyIPv4(int) {
  const a = (int >>> 24) & 255;
  if (a < 128) return 'A';
  if (a < 192) return 'B';
  if (a < 224) return 'C';
  if (a < 240) return 'D (multicast)';
  return 'E (réservée)';
}

export function isPrivateIPv4(int) {
  const a = (int >>> 24) & 255, b = (int >>> 16) & 255;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

export function isLinkLocalIPv4(int) { return ((int >>> 24) & 255) === 169 && ((int >>> 16) & 255) === 254; }

/**
 * Analyse complète d'un subnet.
 * /31 : lien point-à-point (RFC 3021), 2 adresses utilisables.
 * /32 : adresse d'hôte unique.
 */
export function analyzeSubnet(ip, maskOrPrefix) {
  const ipInt = ipv4ToInt(ip);
  const prefix = parseMaskOrPrefix(maskOrPrefix);
  const maskInt = prefixToMaskInt(prefix);
  const wildcardInt = (~maskInt) >>> 0;
  const networkInt = (ipInt & maskInt) >>> 0;
  const size = 2 ** (32 - prefix);
  const broadcastInt = (networkInt + size - 1) >>> 0;

  let usableHosts, firstHostInt, lastHostInt;
  if (prefix === 32) {
    usableHosts = 1; firstHostInt = ipInt; lastHostInt = ipInt;
  } else if (prefix === 31) {
    usableHosts = 2; firstHostInt = networkInt; lastHostInt = broadcastInt;
  } else {
    usableHosts = size - 2; firstHostInt = networkInt + 1; lastHostInt = broadcastInt - 1;
  }

  const network = intToIPv4(networkInt);
  const broadcast = intToIPv4(broadcastInt);
  let addressType ='hôte';
  if (prefix < 31 && ipInt === networkInt) addressType = 'adresse réseau';
  else if (prefix < 31 && ipInt === broadcastInt) addressType = 'adresse de diffusion (broadcast)';
  else if (prefix === 32) addressType = 'hôte unique (/32)';

  return {
    ip: intToIPv4(ipInt), prefix, cidr: `${network}/${prefix}`,
    mask: intToIPv4(maskInt), wildcard: intToIPv4(wildcardInt),
    network, broadcast,
    firstHost: intToIPv4(firstHostInt), lastHost: intToIPv4(lastHostInt),
    totalAddresses: size, usableHosts,
    addressClass: classifyIPv4(ipInt),
    isPrivate: isPrivateIPv4(ipInt), isLinkLocal: isLinkLocalIPv4(ipInt),
    addressType,
    binary: {
      ip: toBinaryIPv4(ipInt), mask: toBinaryIPv4(maskInt),
      network: toBinaryIPv4(networkInt), broadcast: toBinaryIPv4(broadcastInt),
    },
    ints: { ip: ipInt, mask: maskInt, network: networkInt, broadcast: broadcastInt },
  };
}

/** Étapes pédagogiques du calcul réseau (ET logique bit à bit). */
export function subnetSteps(ip, maskOrPrefix) {
  const a = analyzeSubnet(ip, maskOrPrefix);
  const hostBits = 32 - a.prefix;
  return [
    { title: 'Convertir en binaire', detail: `IP ${a.ip} → ${a.binary.ip}\nMasque ${a.mask} → ${a.binary.mask}`, },
    { title: 'Identifier les bits réseau et hôte', detail: `Le préfixe /${a.prefix} fixe ${a.prefix} bits de réseau (bits à 1 du masque). Il reste ${hostBits} bits d'hôte.` },
    { title: 'Appliquer le ET logique (AND)', detail: `IP AND masque = adresse réseau.\n${a.binary.ip}\nAND ${a.binary.mask}\n= ${a.binary.network}\n→ ${a.network}` },
    { title: 'Calculer le broadcast', detail: `Mettre tous les bits d'hôte à 1 : ${a.binary.broadcast} → ${a.broadcast}.` + (a.prefix >= 31 ? ' Cas particulier /31-/32 : pas de broadcast traditionnel.' : '') },
    { title: 'Déduire la plage d’hôtes', detail: a.prefix >= 31 ? `Préfixe /${a.prefix} : ${a.usableHosts} adresse(s) utilisable(s) (${a.firstHost} → ${a.lastHost}).` : `Premier hôte : ${a.firstHost}\nDernier hôte : ${a.lastHost}\nHôtes utilisables : 2^${hostBits} − 2 = ${a.usableHosts}.` },
  ];
}

/** Plus petit préfixe offrant au moins `hosts` hôtes utilisables (modèle classique 2^n−2, /30 pour les liens). */
export function prefixForHosts(hosts) {
  if (!Number.isInteger(hosts) || hosts < 1 || hosts > 2 ** 30 - 2) throw new IPv4Error('Nombre d’hôtes invalide.');
  // Convention LAN : réserver réseau et broadcast, donc chercher parmi /30 à /0.
  // Les /31 et /32 sont analysés séparément mais ne sont pas proposés par ce planificateur.
  for (let p = 30; p >= 0; p--) {
    if (2 ** (32 - p) - 2 >= hosts) return p;
  }
  throw new IPv4Error('Aucun préfixe ne satisfait ce besoin.');
}

/** Découpe un réseau en sous-réseaux de préfixe `targetPrefix`. */
export function splitSubnet(ip, maskOrPrefix, targetPrefix) {
  const base = analyzeSubnet(ip, maskOrPrefix);
  const target = parseMaskOrPrefix(targetPrefix);
  if (target <= base.prefix) throw new IPv4Error('Le préfixe cible doit être plus long (sous-réseaux plus petits).');
  const count = 2 ** (target - base.prefix);
  if (count > 65536) throw new IPv4Error('Découpage trop grand pour être listé (maximum 65 536 sous-réseaux).');
  const size = 2 ** (32 - target);
  const out = [];
  for (let i = 0; i < count; i++) {
    const net = (base.ints.network + i * size) >>> 0;
    out.push(analyzeSubnet(intToIPv4(net), target));
  }
  return out;
}

/** Préfixe commun le plus long à une liste d'adresses (agrégation de routes). */
export function commonPrefix(ips) {
  if (!Array.isArray(ips) || ips.length === 0) throw new IPv4Error('Liste d’adresses vide.');
  const ints = ips.map(ipv4ToInt);
  let prefix = 0;
  for (let bit = 31; bit >= 0; bit--) {
    const b = (ints[0] >>> bit) & 1;
    if (ints.every((x) => ((x >>> bit) & 1) === b)) prefix++; else break;
  }
  const aggregateInt = (ints[0] & prefixToMaskInt(prefix)) >>> 0;
  return { prefix, cidr: `${intToIPv4(aggregateInt)}/${prefix}` };
}

export function containsIP(cidrOrIp, prefixOrUndef, ip) {
  const subnet = analyzeSubnet(cidrOrIp, prefixOrUndef);
  const target = ipv4ToInt(ip);
  return target >= subnet.ints.network && target <= subnet.ints.broadcast;
}
