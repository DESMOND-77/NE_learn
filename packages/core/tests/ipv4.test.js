import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidIPv4, ipv4ToInt, intToIPv4, isValidMask, maskToPrefix, prefixToMask,
  parseMaskOrPrefix, analyzeSubnet, subnetSteps, prefixForHosts, splitSubnet,
  commonPrefix, containsIP, toBinaryIPv4, isPrivateIPv4, IPv4Error,
} from '../src/ipv4.js';
import { allocateVLSM } from '../src/vlsm.js';

test('validation IPv4', () => {
  assert.ok(isValidIPv4('192.168.1.1'));
  assert.ok(isValidIPv4('0.0.0.0'));
  assert.ok(isValidIPv4('255.255.255.255'));
  assert.ok(!isValidIPv4('256.1.1.1'));
  assert.ok(!isValidIPv4('1.2.3'));
  assert.ok(!isValidIPv4('1.2.3.4.5'));
  assert.ok(!isValidIPv4('abc'));
  assert.ok(!isValidIPv4('01.2.3.4')); // pas de zéros en tête (ambiguïté octale)
});

test('conversion int <-> IPv4', () => {
  assert.equal(ipv4ToInt('0.0.0.0'), 0);
  assert.equal(ipv4ToInt('255.255.255.255'), 4294967295);
  assert.equal(ipv4ToInt('192.168.1.10'), 3232235786);
  assert.equal(intToIPv4(3232235786), '192.168.1.10');
  assert.throws(() => ipv4ToInt('999.1.1.1'), IPv4Error);
});

test('masques', () => {
  assert.ok(isValidMask('255.255.255.0'));
  assert.ok(isValidMask('0.0.0.0'));
  assert.ok(!isValidMask('255.0.255.0'));
  assert.equal(maskToPrefix('255.255.255.0'), 24);
  assert.equal(maskToPrefix('255.255.255.252'), 30);
  assert.equal(prefixToMask(24), '255.255.255.0');
  assert.equal(prefixToMask(0), '0.0.0.0');
  assert.equal(prefixToMask(32), '255.255.255.255');
  assert.equal(parseMaskOrPrefix('/26'), 26);
  assert.equal(parseMaskOrPrefix('255.255.255.192'), 26);
  assert.equal(parseMaskOrPrefix(16), 16);
  assert.throws(() => parseMaskOrPrefix('33'), IPv4Error);
});

test('analyse subnet /24 classique', () => {
  const s = analyzeSubnet('192.168.1.130', 24);
  assert.equal(s.network, '192.168.1.0');
  assert.equal(s.broadcast, '192.168.1.255');
  assert.equal(s.firstHost, '192.168.1.1');
  assert.equal(s.lastHost, '192.168.1.254');
  assert.equal(s.usableHosts, 254);
  assert.equal(s.totalAddresses, 256);
  assert.equal(s.mask, '255.255.255.0');
  assert.equal(s.wildcard, '0.0.0.255');
  assert.equal(s.cidr, '192.168.1.0/24');
  assert.equal(s.addressClass, 'C');
  assert.ok(s.isPrivate);
});

test('analyse subnet /26', () => {
  const s = analyzeSubnet('192.168.10.70', '255.255.255.192');
  assert.equal(s.network, '192.168.10.64');
  assert.equal(s.broadcast, '192.168.10.127');
  assert.equal(s.firstHost, '192.168.10.65');
  assert.equal(s.lastHost, '192.168.10.126');
  assert.equal(s.usableHosts, 62);
});

test('cas particuliers /31 et /32', () => {
  const p2p = analyzeSubnet('10.0.0.1', 31);
  assert.equal(p2p.usableHosts, 2);
  assert.equal(p2p.firstHost, '10.0.0.0');
  assert.equal(p2p.lastHost, '10.0.0.1');
  const host = analyzeSubnet('10.1.1.1', 32);
  assert.equal(host.usableHosts, 1);
  assert.equal(host.firstHost, '10.1.1.1');
});

test('type d’adresse', () => {
  assert.equal(analyzeSubnet('192.168.1.0', 24).addressType, 'adresse réseau');
  assert.equal(analyzeSubnet('192.168.1.255', 24).addressType, 'adresse de diffusion (broadcast)');
  assert.equal(analyzeSubnet('192.168.1.50', 24).addressType, 'hôte');
});

test('binaire', () => {
  assert.equal(toBinaryIPv4('192.168.1.1'), '11000000.10101000.00000001.00000001');
  const steps = subnetSteps('192.168.1.130', 26);
  assert.equal(steps.length, 5);
  assert.ok(steps[2].detail.includes('AND'));
});

test('prefixForHosts', () => {
  assert.equal(prefixForHosts(2), 30);
  assert.equal(prefixForHosts(60), 26);
  assert.equal(prefixForHosts(100), 25);
  assert.equal(prefixForHosts(254), 24);
  assert.equal(prefixForHosts(500), 23);
  assert.throws(() => prefixForHosts(0), IPv4Error);
});

test('splitSubnet', () => {
  const subs = splitSubnet('192.168.1.0', 24, 26);
  assert.equal(subs.length, 4);
  assert.equal(subs[0].network, '192.168.1.0');
  assert.equal(subs[1].network, '192.168.1.64');
  assert.equal(subs[2].network, '192.168.1.128');
  assert.equal(subs[3].network, '192.168.1.192');
  assert.throws(() => splitSubnet('10.0.0.0', 24, 24), IPv4Error);
});

test('commonPrefix / agrégation', () => {
  assert.deepEqual(commonPrefix(['192.168.0.0', '192.168.1.0', '192.168.2.0', '192.168.3.0']), { prefix: 22, cidr: '192.168.0.0/22' });
});

test('containsIP', () => {
  assert.ok(containsIP('10.0.0.0', 24, '10.0.0.55'));
  assert.ok(!containsIP('10.0.0.0', 24, '10.0.1.1'));
});

test('VLSM : allocation classique', () => {
  const plan = allocateVLSM('192.168.1.0', 24, [
    { name: 'Administration', hosts: 100 },
    { name: 'Commercial', hosts: 50 },
    { name: 'Serveurs', hosts: 25 },
    { name: 'Lien WAN', hosts: 2 },
  ]);
  assert.equal(plan.allocations.length, 4);
  assert.equal(plan.allocations[0].name, 'Administration');
  assert.equal(plan.allocations[0].prefix, 25);
  assert.equal(plan.allocations[0].network, '192.168.1.0');
  assert.equal(plan.allocations[1].prefix, 26);
  assert.equal(plan.allocations[1].network, '192.168.1.128');
  assert.equal(plan.allocations[2].prefix, 27);
  assert.equal(plan.allocations[2].network, '192.168.1.192');
  assert.equal(plan.allocations[3].prefix, 30);
  assert.equal(plan.allocations[3].network, '192.168.1.224');
  assert.equal(plan.freeAddresses, 256 - 128 - 64 - 32 - 4);
  // pas de chevauchement
  for (let i = 1; i < plan.allocations.length; i++) {
    const prev = plan.allocations[i - 1], cur = plan.allocations[i];
    assert.ok(ipv4ToInt(cur.network) > ipv4ToInt(prev.broadcast));
  }
});

test('VLSM : espace insuffisant', () => {
  assert.throws(() => allocateVLSM('192.168.1.0', 24, [
    { name: 'A', hosts: 200 }, { name: 'B', hosts: 100 },
  ]), /Espace insuffisant/);
});

test('VLSM : besoins non triés sont triés', () => {
  const plan = allocateVLSM('10.0.0.0', 24, [
    { name: 'Petit', hosts: 10 }, { name: 'Grand', hosts: 100 },
  ]);
  assert.equal(plan.allocations[0].name, 'Grand');
});
