/**
 * NE_learn — systèmes de numération (binaire, octal, décimal, hexadécimal).
 * BigInt pour éviter toute perte de précision au-delà de 2^53.
 */
export class NumerationError extends Error {
  constructor(message) { super(message); this.name = 'NumerationError'; }
}

const DIGITS = '0123456789ABCDEF';
const BASES = [2, 8, 10, 16];

export function validateInBase(value, base) {
  if (!BASES.includes(base)) throw new NumerationError('Base supportée : 2, 8, 10 ou 16.');
  const s = String(value).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) throw new NumerationError('Valeur vide.');
  const allowed = DIGITS.slice(0, base);
  for (const ch of s) if (!allowed.includes(ch)) throw new NumerationError(`Chiffre « ${ch} » invalide en base ${base}.`);
  return s;
}

export function toBigInt(value, base) {
  const s = validateInBase(value, base);
  let n = 0n;
  for (const ch of s) n = n * BigInt(base) + BigInt(DIGITS.indexOf(ch));
  return n;
}

export function fromBigInt(n, base) {
  if (!BASES.includes(base)) throw new NumerationError('Base supportée : 2, 8, 10 ou 16.');
  if (n < 0n) throw new NumerationError('Seuls les entiers positifs sont pris en charge.');
  if (n === 0n) return '0';
  let out = '';
  while (n > 0n) { out = DIGITS[Number(n % BigInt(base))] + out; n /= BigInt(base); }
  return out;
}

export function convertBase(value, fromBase, toBase) {
  const n = toBigInt(value, fromBase);
  return {
    input: String(value), fromBase, toBase,
    decimal: n.toString(10),
    result: fromBigInt(n, toBase),
    binary: fromBigInt(n, 2),
    octal: fromBigInt(n, 8),
    hex: fromBigInt(n, 16),
  };
}

/** Divisions successives (pédagogie) : décimal → base cible. */
export function divisionSteps(decimalValue, base) {
  let n = toBigInt(decimalValue, 10);
  if (!BASES.includes(base)) throw new NumerationError('Base cible invalide.');
  if (n === 0n) return [{ quotient: '0', remainder: '0', digit: '0' }];
  const steps = [];
  while (n > 0n) {
    const q = n / BigInt(base), r = n % BigInt(base);
    steps.push({ quotient: q.toString(), remainder: r.toString(), digit: DIGITS[Number(r)] });
    n = q;
  }
  return steps;
}

/** Poids des bits (pédagogie) : décomposition binaire → décimal. */
export function bitWeights(binaryValue) {
  const s = validateInBase(binaryValue, 2);
  return s.split('').map((bit, i) => ({ position: s.length - 1 - i, bit: Number(bit), weight: (2n ** BigInt(s.length - 1 - i)).toString() }));
}
