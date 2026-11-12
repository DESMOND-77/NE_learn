import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertBase, divisionSteps, bitWeights, validateInBase, NumerationError } from '../src/numeration.js';
import {
  shannonCapacity, nyquistRate, wavelength, transmissionTime, quantization,
  samplingTheorem, dbToRatio, ratioToDb, bandwidthDelayProduct, TelecomError,
} from '../src/telecom.js';

test('conversions de base', () => {
  assert.equal(convertBase('255', 10, 2).result, '11111111');
  assert.equal(convertBase('11000000', 2, 10).result, '192');
  assert.equal(convertBase('FF', 16, 10).result, '255');
  assert.equal(convertBase('171', 10, 16).result, 'AB');
  assert.equal(convertBase('777', 8, 10).result, '511');
  assert.equal(convertBase('0', 10, 2).result, '0');
  assert.throws(() => convertBase('102', 2, 10), NumerationError);
  assert.throws(() => convertBase('G', 16, 10), NumerationError);
});

test('très grands nombres sans perte (BigInt)', () => {
  const big = '123456789012345678901234567890';
  const back = convertBase(convertBase(big, 10, 16).result, 16, 10);
  assert.equal(back.result, big);
});

test('étapes de division', () => {
  const steps = divisionSteps('13', 2);
  assert.equal(steps.length, 4); // 13→6 r1, 6→3 r0, 3→1 r1, 1→0 r1
  assert.equal(steps.map((s) => s.digit).reverse().join(''), '1101');
});

test('poids des bits', () => {
  const w = bitWeights('1010');
  assert.equal(w[0].weight, '8');
  assert.equal(w[3].weight, '1');
});

test('Shannon', () => {
  const r = shannonCapacity(3000, 30);
  assert.equal(r.snrLinear.toFixed(0), '1000');
  assert.ok(Math.abs(r.capacityBps - 3000 * Math.log2(1001)) < 1e-6);
  assert.throws(() => shannonCapacity(0, 30), TelecomError);
});

test('Nyquist', () => {
  const r = nyquistRate(4000, 16);
  assert.equal(r.rateBps, 32000);
  assert.equal(r.bitsPerSymbol, 4);
});

test('longueur d’onde', () => {
  const r = wavelength(2.4e9);
  assert.ok(Math.abs(r.wavelengthM - 0.12491) < 0.001);
});

test('temps de transmission', () => {
  const r = transmissionTime(1_000_000, 100_000_000); // 1 Mo sur 100 Mbit/s
  assert.equal(r.serializationSeconds, 0.08);
  assert.equal(transmissionTime(1000, 1000, 50).totalSeconds, 8.05);
});

test('quantification', () => {
  const r = quantization(8, 0, 5);
  assert.equal(r.levels, 256);
  assert.ok(Math.abs(r.step - 5 / 256) < 1e-12);
  assert.ok(Math.abs(r.sqnrDb - 49.92) < 0.01);
});

test('échantillonnage', () => {
  assert.equal(samplingTheorem(4000).minSamplingHz, 8000);
});

test('dB', () => {
  assert.equal(dbToRatio(30), 1000);
  assert.ok(Math.abs(ratioToDb(1000) - 30) < 1e-9);
});

test('produit bande passante délai', () => {
  const r = bandwidthDelayProduct(1e9, 0.02);
  assert.equal(r.bits, 20_000_000);
});
