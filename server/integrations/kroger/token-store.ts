/**
 * Persistent store for the Kroger *customer* token (authorization code grant).
 *
 * Kroger customer access tokens are short lived (~30 min) and each refresh may
 * return a new refresh token, so the refresh token must be persisted and
 * rotated. The file is written with mode 0600 and holds only tokens -- the
 * client id/secret stay in the environment (1Password -> `op run`).
 */

import { createHash, randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { log } from '../../utils/logger.js';
import type { KrogerAuth } from './kroger-auth.js';
import type { KrogerTokenResponse } from './kroger-types.js';

/** Refresh this long before the access token actually expires. */
const EXPIRY_BUFFER_MS = 120_000;

export interface StoredKrogerToken {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  scope: string;
  updatedAt: string;
}

export function defaultTokenPath(): string {
  return (
    process.env.KROGER_TOKEN_FILE ||
    join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'claude-grocery', 'kroger-token.json')
  );
}

export class KrogerTokenStore {
  private readonly auth: KrogerAuth;
  private readonly path: string;
  private cached: StoredKrogerToken | null = null;
  private inFlight: Promise<string> | null = null;

  constructor(auth: KrogerAuth, path: string = defaultTokenPath()) {
    this.auth = auth;
    this.path = path;
  }

  get filePath(): string {
    return this.path;
  }

  /** True when a token file exists and can be parsed. */
  hasToken(): boolean {
    return this.read() !== null;
  }

  /** Persist a fresh token response (from the authorization code exchange or a refresh). */
  save(token: KrogerTokenResponse): StoredKrogerToken {
    if (!token.refresh_token) {
      throw new Error(
        'Kroger token response contained no refresh_token -- re-run `npm run kroger:auth` and make sure the app requests the authorization code grant.'
      );
    }

    const stored: StoredKrogerToken = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
      scope: token.scope ?? '',
      updatedAt: new Date().toISOString(),
    };

    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    // Write to a temp file first so a crash mid-write cannot leave an empty token file.
    const tmp = `${this.path}.${randomUUID()}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
    renameSync(tmp, this.path);
    chmodSync(this.path, 0o600);

    this.cached = stored;
    log('info', `Kroger customer token saved to ${this.path} (scope: ${stored.scope || 'unknown'})`);
    return stored;
  }

  /**
   * Returns a valid customer access token, refreshing it when it is missing or
   * close to expiry. Concurrent callers share one refresh.
   */
  async getAccessToken(): Promise<string> {
    const stored = this.read();
    if (!stored) {
      throw new Error(
        `No Kroger customer token at ${this.path}. Run \`npm run kroger:auth\` once to authorize the app against your King Soopers account.`
      );
    }

    if (Date.now() < stored.expiresAt - EXPIRY_BUFFER_MS) {
      return stored.accessToken;
    }

    if (!this.inFlight) {
      this.inFlight = this.refresh(stored.refreshToken).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  /** Force a refresh regardless of expiry (used by the health check). */
  async refreshNow(): Promise<StoredKrogerToken> {
    const stored = this.read();
    if (!stored) throw new Error(`No Kroger customer token at ${this.path}.`);
    await this.refresh(stored.refreshToken);
    return this.read()!;
  }

  /** A stable fingerprint of the refresh token, safe to log or show in Slack. */
  fingerprint(): string | null {
    const stored = this.read();
    if (!stored) return null;
    return createHash('sha256').update(stored.refreshToken).digest('hex').slice(0, 8);
  }

  private async refresh(refreshToken: string): Promise<string> {
    try {
      const token = await this.auth.refreshAccessToken(refreshToken);
      // Kroger rotates refresh tokens: keep the new one, fall back to the old.
      const saved = this.save({ ...token, refresh_token: token.refresh_token ?? refreshToken });
      return saved.accessToken;
    } catch (error) {
      log('error', 'Kroger customer token refresh failed -- re-authorization needed', error);
      throw error;
    }
  }

  private read(): StoredKrogerToken | null {
    if (this.cached) return this.cached;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoredKrogerToken>;
      if (!parsed.accessToken || !parsed.refreshToken || typeof parsed.expiresAt !== 'number') {
        log('warn', `Kroger token file at ${this.path} is incomplete; treating as missing`);
        return null;
      }
      this.cached = parsed as StoredKrogerToken;
      return this.cached;
    } catch {
      return null;
    }
  }
}
