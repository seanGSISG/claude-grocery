/**
 * Kroger OAuth 2.0 token manager.
 *
 * Uses the client_credentials grant to obtain an application-level access token.
 * Caches the token in memory and refreshes it 60 seconds before expiry.
 */

import { log } from '../../utils/logger.js';
import type { KrogerTokenResponse } from './kroger-types.js';

const TOKEN_URL = 'https://api.kroger.com/v1/connect/oauth2/token';

/** Buffer (in ms) to refresh a token before it actually expires. */
const EXPIRY_BUFFER_MS = 60_000;

export class KrogerAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;

  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0; // epoch ms

  constructor(clientId: string, clientSecret: string) {
    if (!clientId || !clientSecret) {
      throw new Error('KrogerAuth requires both clientId and clientSecret');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Returns a valid client-credentials access token.
   * Fetches a new one only when the cached token is missing or about to expire.
   */
  async getClientToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - EXPIRY_BUFFER_MS) {
      return this.cachedToken;
    }

    log('info', 'Requesting new Kroger client credentials token');

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: 'grant_type=client_credentials&scope=product.compact',
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Kroger token request failed (${response.status}): ${errorBody}`
        );
      }

      const data: KrogerTokenResponse = await response.json() as KrogerTokenResponse;

      this.cachedToken = data.access_token;
      // expires_in is in seconds; convert to ms epoch
      this.tokenExpiresAt = Date.now() + data.expires_in * 1000;

      log('info', `Kroger token acquired, expires in ${data.expires_in}s`);
      return this.cachedToken;
    } catch (error) {
      log('error', 'Failed to obtain Kroger access token', error);
      throw error;
    }
  }

  /**
   * Clears the cached token, forcing a fresh fetch on the next call.
   */
  clearToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }
}
