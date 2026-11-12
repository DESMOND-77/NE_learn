import { analyzeSubnet, subnetSteps, shannonCapacity, convertBase } from '@ne-learn/core';

const normalize = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,' ');
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Assistant extractif documenté : aucune génération de commandes ou références non sourcées. */
export function answerQuestion(catalog, message) {
  if (typeof message !== 'string' || !message.trim() || message.length > 4000) return { status:'invalid', title:'Question invalide', answer:'Pose une question de 1 à 4 000 caractères.', references:[], mode:'documentaire-local' };
  const text = normalize(message);
  const ipv4 = message.match(/(?<![\d.])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,2})(?!\d)/);
  if (ipv4 && /calc|subnet|reseau|broadcast|masque|analyse|plage/.test(text)) {
    try {
      const a = analyzeSubnet(ipv4[1],Number(ipv4[2]));
      const steps = subnetSteps(ipv4[1],a.prefix);
      return { status:'ok', title:`Analyse de ${a.ip}/${a.prefix}`, answer:`**Résultat vérifié par le moteur IPv4**\nRéseau : ${a.cidr}\nMasque : ${a.mask}\nBroadcast : ${a.broadcast}\nPlage : ${a.firstHost} → ${a.lastHost}\nHôtes utilisables : ${a.usableHosts}\n\n${steps.map((s,i)=>`${i+1}. **${s.title}**\n${s.detail}`).join('\n\n')}`, courseRef:'adressage-ipv4', references:[{title:'RFC 4632 — CIDR',url:'https://www.rfc-editor.org/rfc/rfc4632'}], mode:'calcul-déterministe' };
    } catch { /* Une adresse invalide ne doit jamais produire un résultat inventé. */ }
  }
  const shannon = text.match(/shannon[^\d]*(\d+(?:[.,]\d+)?)\s*(?:hz)?[^\d]+(\d+(?:[.,]\d+)?)\s*db/);
  if (shannon) {
    try {
      const r=shannonCapacity(Number(shannon[1].replace(',','.')),Number(shannon[2].replace(',','.')));
      return {status:'ok',title:'Capacité de Shannon',answer:`B = ${r.bandwidthHz} Hz ; SNR = ${r.snrDb} dB → S/N = ${r.snrLinear.toFixed(3)}.\nC = B × log₂(1+S/N) = **${r.capacityBps.toFixed(2)} bit/s**.\nLimite théorique du modèle, pas un débit utile garanti.`,courseRef:'signaux-telecoms',references:[],mode:'calcul-déterministe'};
    } catch { /* retour à la recherche documentaire */ }
  }
  let best = null, bestScore = 0;
  for (const entry of catalog.assistant.entries) {
    let score=0;
    for (const keyword of entry.keywords) {
      const k=normalize(keyword);
      const re=new RegExp(`(?:^|\\W)${escapeRegex(k)}(?:$|\\W)`);
      if (re.test(text)) score += k.includes(' ')?4:k.length>3?2:1;
    }
    if (score>bestScore) { best=entry; bestScore=score; }
  }
  if (!best) return {status:'unknown',title:'Je préfère vérifier plutôt qu’inventer',answer:'Cette question ne correspond pas encore à une fiche vérifiée de la base locale. Ce MVP n’est pas connecté à un modèle d’IA. Reformule autour d’un thème couvert (OSI, IPv4, VLSM, VLAN, OSPF, DHCP, DNS, Linux ou signaux), ou consulte la documentation et les sources. Pour une panne, colle la sortie exacte de la commande et précise ton objectif : je pourrai au moins t’orienter vers la fiche de diagnostic.',references:[],mode:'documentaire-local',suggestions:['Explique les couches OSI','Calcule 192.168.1.70/26','Pourquoi mon DHCP échoue ?','Compare TCP et UDP']};
  const course=catalog.courses.find(c=>c.id===best.courseId);
  const lesson=course?.lessons.find(l=>l.id===best.lessonId);
  return {status:'ok',title:best.title,answer:best.answer,courseRef:best.courseId,lessonRef:best.lessonId,sourceExcerpt:lesson?.blocks.find(b=>b.type==='paragraph')?.text ?? null,question:best.question,references:best.references,mode:'documentaire-local',matchedKeywords:best.keywords.filter(k=>text.includes(normalize(k)))};
}
