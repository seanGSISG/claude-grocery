import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KrogerTokenStore } from '../../server/integrations/kroger/token-store.js';
import type { KrogerAuth } from '../../server/integrations/kroger/kroger-auth.js';

/** Minimal KrogerAuth stand-in: records refresh calls, returns rotating tokens. */
function fakeAuth() {
  const calls: string[] = [];
  let n = 0;
  const auth = {
    calls,
    async refreshAccessToken(refreshToken: string) {
      calls.push(refreshToken);
      n += 1;
      return {
        access_token: `access-${n}`,
        refresh_token: `refresh-${n}`,
        expires_in: 1800,
        token_type: 'bearer',
        scope: 'cart.basic:write profile.compact',
      };
    },
  };
  return auth as typeof auth & KrogerAuth;
}

describe('KrogerTokenStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'kroger-token-'));
    file = join(dir, 'nested', 'kroger-token.json');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('reports no token before anything is saved', () => {
    const store = new KrogerTokenStore(fakeAuth(), file);
    expect(store.hasToken()).toBe(false);
    expect(store.fingerprint()).toBeNull();
  });

  it('rejects a token response without a refresh token', () => {
    const store = new KrogerTokenStore(fakeAuth(), file);
    expect(() =>
      store.save({ access_token: 'a', expires_in: 1800, token_type: 'bearer' })
    ).toThrow(/refresh_token/);
  });

  it('writes the token file with 0600 permissions', () => {
    const store = new KrogerTokenStore(fakeAuth(), file);
    store.save({ access_token: 'a', refresh_token: 'r', expires_in: 1800, token_type: 'bearer' });
    expect(store.hasToken()).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it('returns the cached access token while it is still fresh', async () => {
    const auth = fakeAuth();
    const store = new KrogerTokenStore(auth, file);
    store.save({ access_token: 'fresh', refresh_token: 'r0', expires_in: 1800, token_type: 'bearer' });

    await expect(store.getAccessToken()).resolves.toBe('fresh');
    expect(auth.calls).toHaveLength(0);
  });

  it('refreshes an expired token and persists the rotated refresh token', async () => {
    const auth = fakeAuth();
    writeFileSync(
      join(dir, 'expired.json'),
      JSON.stringify({
        accessToken: 'stale',
        refreshToken: 'r0',
        expiresAt: Date.now() - 1000,
        scope: '',
        updatedAt: new Date().toISOString(),
      })
    );
    const store = new KrogerTokenStore(auth, join(dir, 'expired.json'));

    await expect(store.getAccessToken()).resolves.toBe('access-1');
    expect(auth.calls).toEqual(['r0']);

    // The rotated refresh token is what a later refresh must use.
    const reloaded = new KrogerTokenStore(auth, join(dir, 'expired.json'));
    await reloaded.refreshNow();
    expect(auth.calls).toEqual(['r0', 'refresh-1']);
  });

  it('shares one refresh between concurrent callers', async () => {
    const auth = fakeAuth();
    const store = new KrogerTokenStore(auth, file);
    store.save({ access_token: 'old', refresh_token: 'r0', expires_in: -10, token_type: 'bearer' });

    const [a, b] = await Promise.all([store.getAccessToken(), store.getAccessToken()]);
    expect(a).toBe(b);
    expect(auth.calls).toHaveLength(1);
  });

  it('fails with a clear message when no token file exists', async () => {
    const store = new KrogerTokenStore(fakeAuth(), file);
    await expect(store.getAccessToken()).rejects.toThrow(/kroger:auth/);
  });
});
