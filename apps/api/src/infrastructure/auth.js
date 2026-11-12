import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { audit } from './database.js';
const scrypt = promisify(scryptCallback);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_SALT = randomBytes(16).toString('hex');
const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = (u) => u ? { id: u.id, email: u.email, name: u.name, role: u.role, academicLevel: u.academic_level, createdAt: u.created_at } : null;

export class AuthError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, stored) {
  const [, salt, hex] = stored.split(':');
  const key = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, 'hex');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export function validateCredentials({ email, password, name }, register = false) {
  if (typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new AuthError('Adresse e-mail invalide.');
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) throw new AuthError('Le mot de passe doit contenir entre 10 et 128 caractères.');
  if (register && (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60)) throw new AuthError('Le nom doit contenir entre 2 et 60 caractères.');
}
export function createAuthService(db) {
  return {
    async register(input, ip) {
      validateCredentials(input, true);
      const email = input.email.trim().toLowerCase();
      if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new AuthError('Impossible de créer ce compte avec ces informations.', 409);
      const passwordHash = await hashPassword(input.password);
      const user = { id: randomUUID(), email, name: input.name.trim(), password_hash: passwordHash, role: 'student', academic_level: [1,2,3,4].includes(input.academicLevel) ? input.academicLevel : 1, created_at: new Date().toISOString() };
      db.prepare('INSERT INTO users(id,email,name,password_hash,role,academic_level,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(user.id,user.email,user.name,user.password_hash,user.role,user.academic_level,user.created_at);
      audit(db, 'auth.register', { userId: user.id, ip });
      return publicUser(user);
    },
    async login({ email, password }, ip) {
      if (typeof email !== 'string' || typeof password !== 'string' || password.length > 128 || email.length > 254) throw new AuthError('Identifiants incorrects.', 401);
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
      if (!user) { await scrypt(password, DUMMY_SALT, 64); audit(db,'auth.login_failed',{ip}); throw new AuthError('Identifiants incorrects.',401); }
      if (!await verifyPassword(password, user.password_hash)) { audit(db,'auth.login_failed',{userId:user.id,ip}); throw new AuthError('Identifiants incorrects.',401); }
      const token = randomBytes(32).toString('base64url');
      const expires = Date.now() + SESSION_MS;
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hashToken(token),user.id,expires,new Date().toISOString());
      audit(db,'auth.login',{userId:user.id,ip});
      return { token, expires, user: publicUser(user) };
    },
    userFromToken(token) {
      if (!token || typeof token !== 'string' || token.length > 256) return null;
      const user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(hashToken(token),Date.now());
      return publicUser(user);
    },
    logout(token, ip) {
      if (!token) return;
      const row = db.prepare('SELECT user_id FROM sessions WHERE token_hash=?').get(hashToken(token));
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(token));
      audit(db,'auth.logout',{userId:row?.user_id,ip});
    },
    updateLevel(userId, level) {
      if (![1,2,3,4].includes(level)) throw new AuthError('Niveau académique invalide.');
      db.prepare('UPDATE users SET academic_level=? WHERE id=?').run(level,userId);
      audit(db,'profile.level_changed',{userId,detail:String(level)});
      return publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(userId));
    },
    publicUser,
  };
}
export const SESSION_COOKIE = 'ne_session';
export const sessionMaxAge = SESSION_MS / 1000;
