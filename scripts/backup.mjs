import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(process.env.DB_PATH || join(root, 'data/ne-learn.sqlite'));
if (!existsSync(source)) {
  console.error(`Base introuvable : ${source}`);
  process.exit(1);
}
const dir = resolve(process.env.BACKUP_DIR || join(root, 'data/backups'));
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const target = join(dir, `ne-learn-${stamp}.sqlite`);
if (existsSync(target)) {
  console.error(`La sauvegarde existe déjà : ${target}`);
  process.exit(1);
}
const db = new DatabaseSync(source);
try {
  // VACUUM INTO produit une copie cohérente même si le serveur utilise WAL.
  db.prepare('VACUUM INTO ?').run(target);
  const check = new DatabaseSync(target, { readOnly: true });
  const result = check.prepare('PRAGMA integrity_check').get();
  check.close();
  if (Object.values(result)[0] !== 'ok') throw new Error('Contrôle d’intégrité échoué.');
  console.log(`Sauvegarde vérifiée : ${target}`);
} finally {
  db.close();
}
