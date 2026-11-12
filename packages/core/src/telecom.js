/**
 * NE_learn — calculs télécoms fondamentaux.
 * Formules commentées pour la pédagogie ; unités SI explicites.
 */
export class TelecomError extends Error {
  constructor(message) { super(message); this.name = 'TelecomError'; }
}

const C = 299_792_458; // vitesse de la lumière dans le vide (m/s)

function positive(x, label) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) throw new TelecomError(`${label} doit être un nombre fini strictement positif.`);
  return n;
}

export function dbToRatio(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) throw new TelecomError('dB doit être un nombre fini.');
  return 10 ** (n / 10);
}
export function ratioToDb(ratio) { return 10 * Math.log10(positive(ratio, 'Le rapport')); }

/** Capacité de Shannon : C = B × log2(1 + S/N), avec S/N linéaire. */
export function shannonCapacity(bandwidthHz, snrDb) {
  const B = positive(bandwidthHz, 'La bande passante');
  const snr = dbToRatio(snrDb);
  const capacity = B * Math.log2(1 + snr);
  return { bandwidthHz: B, snrDb: Number(snrDb), snrLinear: snr, capacityBps: capacity, formula: 'C = B × log2(1 + S/N)' };
}

/** Débit sans bruit (Nyquist) : D = 2B × log2(M). */
export function nyquistRate(bandwidthHz, levels) {
  const B = positive(bandwidthHz, 'La bande passante');
  const M = positive(levels, 'Le nombre de niveaux');
  if (!Number.isInteger(M) || M < 2) throw new TelecomError('Le nombre de niveaux doit être un entier ≥ 2.');
  return { bandwidthHz: B, levels: M, bitsPerSymbol: Math.log2(M), rateBps: 2 * B * Math.log2(M), formula: 'D = 2B × log2(M)' };
}

export function wavelength(frequencyHz, velocity = C) {
  const f = positive(frequencyHz, 'La fréquence');
  const v = positive(velocity, 'La vitesse de propagation');
  return { frequencyHz: f, velocity: v, wavelengthM: v / f, formula: 'λ = v / f' };
}

export function frequencyFromWavelength(wavelengthM, velocity = C) {
  const l = positive(wavelengthM, 'La longueur d’onde');
  const v = positive(velocity, 'La vitesse de propagation');
  return { wavelengthM: l, velocity: v, frequencyHz: v / l, formula: 'f = v / λ' };
}

/** Temps de transmission : t = volume_bits / débit_bps (+ propagation optionnelle). */
export function transmissionTime(sizeBytes, bitrateBps, propagationDelayMs = 0) {
  const bytes = positive(sizeBytes, 'Le volume de données');
  const rate = positive(bitrateBps, 'Le débit');
  const delay = Number(propagationDelayMs) || 0;
  if (delay < 0) throw new TelecomError('Le délai de propagation ne peut pas être négatif.');
  const bits = bytes * 8;
  const serializationSeconds = bits / rate;
  const totalSeconds = serializationSeconds + delay / 1000;
  return { sizeBytes: bytes, sizeBits: bits, bitrateBps: rate, serializationSeconds, propagationSeconds: delay / 1000, totalSeconds, formula: 't = (octets × 8) / débit + délai de propagation' };
}

/** Échantillonnage (Nyquist-Shannon) : fe ≥ 2 × fmax. */
export function samplingTheorem(maxFrequencyHz) {
  const f = positive(maxFrequencyHz, 'La fréquence maximale');
  return { maxFrequencyHz: f, minSamplingHz: 2 * f, formula: 'fe ≥ 2 × fmax' };
}

/** Quantification uniforme sur n bits : niveaux = 2^n, pas q = (Vmax−Vmin)/2^n, SQNR ≈ 6,02n + 1,76 dB. */
export function quantization(bits, vMin = 0, vMax = 1) {
  const n = Number(bits);
  if (!Number.isInteger(n) || n < 1 || n > 32) throw new TelecomError('Le nombre de bits doit être un entier entre 1 et 32.');
  const lo = Number(vMin), hi = Number(vMax);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) throw new TelecomError('Plage invalide : Vmax doit être supérieur à Vmin.');
  const levels = 2 ** n;
  return { bits: n, levels, step: (hi - lo) / levels, vMin: lo, vMax: hi, sqnrDb: 6.02 * n + 1.76, formula: 'Niveaux = 2^n ; pas = (Vmax−Vmin)/2^n ; SQNR ≈ 6,02n + 1,76 dB' };
}

/** Produit bande passante × délai : volume « en vol » sur le lien. */
export function bandwidthDelayProduct(bitrateBps, rttSeconds) {
  const r = positive(bitrateBps, 'Le débit');
  const d = positive(rttSeconds, 'Le délai (RTT)');
  return { bitrateBps: r, rttSeconds: d, bits: r * d, bytes: (r * d) / 8, formula: 'BDP = débit × RTT' };
}

const BIT_PREFIXES = [[1e12, 'Tbit/s'], [1e9, 'Gbit/s'], [1e6, 'Mbit/s'], [1e3, 'kbit/s'], [1, 'bit/s']];
export function formatBitrate(bps) {
  for (const [factor, unit] of BIT_PREFIXES) if (bps >= factor) return `${(bps / factor).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${unit}`;
  return `${bps} bit/s`;
}
export function formatDuration(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} h`;
  if (seconds >= 1) return `${seconds.toLocaleString('fr-FR', { maximumFractionDigits: 3 })} s`;
  if (seconds >= 1e-3) return `${(seconds * 1e3).toLocaleString('fr-FR', { maximumFractionDigits: 3 })} ms`;
  if (seconds >= 1e-6) return `${(seconds * 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} µs`;
  return `${(seconds * 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ns`;
}
