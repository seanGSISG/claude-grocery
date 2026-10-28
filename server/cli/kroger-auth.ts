/**
 * One-time Kroger authorization for the meal-planning agent.
 *
 *   npm run kroger:auth                       # listens on the redirect URI
 *   npm run kroger:auth -- --code "<url>"     # paste the callback URL instead
 *
 * Starts a local listener on the registered redirect URI, prints the Kroger
 * consent URL, exchanges the returned code for tokens, verifies them against
 * the Identity API and writes them to the token store.
 *
 * Requires KROGER_CLIENT_ID / KROGER_CLIENT_SECRET in the environment, e.g.
 *   op run --env-file=.env.op -- npm run kroger:auth
 */

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { KrogerAuth } from '../integrations/kroger/kroger-auth.js';
import { KrogerClient } from '../integrations/kroger/kroger-client.js';
import { KrogerTokenStore, defaultTokenPath } from '../integrations/kroger/token-store.js';

const SCOPES = ['cart.basic:write', 'profile.compact'];
const TIMEOUT_MS = 5 * 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Try: op run --env-file=.env.op -- npm run kroger:auth`);
    process.exit(1);
  }
  return value;
}

async function waitForCode(redirectUri: URL, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', redirectUri.origin);
      if (url.pathname !== redirectUri.pathname) {
        res.writeHead(404).end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      const finish = (message: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(
          `<html><body style="font-family:system-ui;padding:3rem"><h2>${message}</h2><p>You can close this tab.</p></body></html>`
        );
        server.close();
      };

      if (error) {
        finish(`Kroger returned an error: ${error}`);
        reject(new Error(`Authorization failed: ${error}`));
      } else if (!code) {
        finish('No authorization code in the callback.');
        reject(new Error('Callback had no ?code parameter'));
      } else if (state !== expectedState) {
        finish('State mismatch -- ignoring this callback.');
        reject(new Error('State parameter did not match; possible CSRF, start over'));
      } else {
        finish('Authorized. Tokens saved.');
        resolve(code);
      }
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${redirectUri.port} is already in use. Free it (lsof -ti:${redirectUri.port}) or complete the consent in a browser and re-run with --code "<callback URL>".`
        ));
        return;
      }
      reject(error);
    });
    server.listen(Number(redirectUri.port || 80), redirectUri.hostname, () => {
      console.log(`Listening for the Kroger callback on ${redirectUri.href}`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error(`No callback within ${TIMEOUT_MS / 60000} minutes`));
    }, TIMEOUT_MS).unref();
  });
}

function codeFromArgv(argv: string[]): string | null {
  const i = argv.indexOf('--code');
  if (i === -1) return null;
  const value = argv[i + 1];
  if (!value) {
    console.error('--code needs the callback URL (or the bare code) after it.');
    process.exit(1);
  }
  // Accept either the whole redirect URL or just the code.
  if (value.includes('code=')) {
    const code = new URL(value.startsWith('http') ? value : `http://x/?${value.replace(/^\?/, '')}`).searchParams.get('code');
    if (!code) {
      console.error('No ?code= parameter found in that URL.');
      process.exit(1);
    }
    return code;
  }
  return value;
}

async function main(): Promise<void> {
  const clientId = requireEnv('KROGER_CLIENT_ID');
  const clientSecret = requireEnv('KROGER_CLIENT_SECRET');
  const redirectUri = new URL(process.env.KROGER_REDIRECT_URI || 'http://localhost:8000/callback');

  const auth = new KrogerAuth(clientId, clientSecret);
  const store = new KrogerTokenStore(auth);

  // Manual mode: you already completed the consent in a browser and are pasting
  // the callback URL. Useful when nothing can listen on the redirect port.
  const pastedCode = codeFromArgv(process.argv.slice(2));

  let code: string;
  if (pastedCode) {
    code = pastedCode;
  } else {
    const state = randomBytes(16).toString('hex');
    const authUrl = new URL(auth.getAuthorizationUrl(redirectUri.href, SCOPES));
    authUrl.searchParams.set('state', state);

    console.log('\nOpen this URL, sign in to King Soopers and approve the app:\n');
    console.log(`  ${authUrl.href}\n`);
    console.log('(If the browser cannot reach the callback, copy the URL it lands on and re-run with --code "<that URL>".)\n');

    code = await waitForCode(redirectUri, state);
  }

  const token = await auth.exchangeAuthorizationCode(code, redirectUri.href);
  store.save(token);

  // Prove the token works before declaring victory.
  const client = new KrogerClient(auth);
  const profile = await client.getProfile(token.access_token);

  console.log(`\nAuthorized. Kroger profile id: ${profile.data.id}`);
  console.log(`Token file: ${defaultTokenPath()}`);
  console.log(`Refresh token fingerprint: ${store.fingerprint()}`);
  console.log('\nNext: npm run kroger:smoke -- --zip 80126\n');
}

main().catch((error: unknown) => {
  console.error('\nAuthorization failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
