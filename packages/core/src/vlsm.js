/**
 * NE_learn — allocation VLSM (Variable Length Subnet Mask).
 * Principe : trier les besoins du plus grand au plus petit, allouer des blocs
 * contigus alignés, du plus grand au plus petit, dans le réseau de base.
 */
import { analyzeSubnet, ipv4ToInt, intToIPv4, prefixToMaskInt, prefixForHosts, IPv4Error } from './ipv4.js';

function freeBlocks(startInt, endInt) {
  // Décompose [start, end] en blocs CIDR alignés maximaux.
  const blocks = [];
  let cur = startInt;
  while (cur <= endInt) {
    let maxSize = 1;
    while (maxSize <= (endInt - cur + 1) / 2 && (cur % (maxSize * 2)) === 0) maxSize *= 2;
    const prefix = 32 - Math.log2(maxSize);
    blocks.push({ network: intToIPv4(cur), prefix, cidr: `${intToIPv4(cur)}/${prefix}`, size: maxSize });
    cur += maxSize;
    if (blocks.length > 64) break;
  }
  return blocks;
}

/**
 * @param {string} baseIp Adresse du réseau de base (ou une IP quelconque du bloc).
 * @param {number|string} basePrefix Préfixe du réseau de base.
 * @param {Array<{name:string, hosts:number}>} requirements Besoins en hôtes.
 */
export function allocateVLSM(baseIp, basePrefix, requirements) {
  const base = analyzeSubnet(baseIp, basePrefix);
  if (!Array.isArray(requirements) || requirements.length === 0) throw new IPv4Error('Ajoutez au moins un besoin (nom + nombre d’hôtes).');
  const reqs = requirements.map((r, i) => {
    const hosts = Number(r.hosts);
    if (!r.name || !String(r.name).trim()) throw new IPv4Error(`Besoin n°${i + 1} : nom manquant.`);
    if (!Number.isInteger(hosts) || hosts < 1) throw new IPv4Error(`Besoin « ${r.name} » : nombre d’hôtes invalide (entier ≥ 1).`);
    return { name: String(r.name).trim(), hosts };
  });
  const sorted = [...reqs].sort((a, b) => b.hosts - a.hosts);
  const allocations = [];
  let cursor = base.ints.network;
  for (const req of sorted) {
    const prefix = prefixForHosts(req.hosts);
    const size = 2 ** (32 - prefix);
    if (cursor + size - 1 > base.ints.broadcast) {
      throw new IPv4Error(`Espace insuffisant : le bloc pour « ${req.name} » (${req.hosts} hôtes, /${prefix}, ${size} adresses) dépasse ${base.cidr}. Capacité restante : ${base.ints.broadcast - cursor + 1} adresses.`);
    }
    const subnet = analyzeSubnet(intToIPv4(cursor), prefix);
    allocations.push({ ...req, requiredHosts: req.hosts, prefix: subnet.prefix, mask: subnet.mask, network: subnet.network, broadcast: subnet.broadcast, firstHost: subnet.firstHost, lastHost: subnet.lastHost, usableHosts: subnet.usableHosts, totalAddresses: subnet.totalAddresses, cidr: subnet.cidr });
    cursor += size;
  }
  const used = cursor - base.ints.network;
  const free = cursor <= base.ints.broadcast ? freeBlocks(cursor, base.ints.broadcast) : [];
  return {
    base: { cidr: base.cidr, network: base.network, broadcast: base.broadcast, totalAddresses: base.totalAddresses },
    allocations,
    usedAddresses: used,
    freeAddresses: base.totalAddresses - used,
    efficiency: Math.round((allocations.reduce((s, a) => s + a.requiredHosts, 0) / used) * 100),
    freeBlocks: free,
  };
}
