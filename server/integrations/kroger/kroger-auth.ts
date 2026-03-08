/**
 * Kroger OAuth 2.0 token manager.
 *
 * Supports two grant types:
 *   1. Client Credentials -- application-level access for Products and Locations APIs.
 *   2. Authorization Code -- customer-level access for Cart and Identity APIs.
 *
 * Client credentials tokens are cached in memory and refreshed 60 s before expiry.
 * Customer tokens are managed externally (stored/refreshed by the caller).
 */

import { log } from '../../utils/logger.js';
import type { KrogerTokenResponse } from './kroger-types.js';

const BASE_URL = 'https://api.kroger.com/v1/connect/oauth2';
const TOKEN_URL = `${BASE_URL}/token`;
const AUTHORIZE_URL = `${BASE_URL}/authorize`;

/** Buffer (in ms) to refresh a token before it actually expires. */
const EXPIRY_BUFFER_MS = 60_000;

export class KrogerAuth {
  private readonly clientId: string;
  private readonly clientSecret: string;

  /** Cached client-credentials token. */
  private cachedToken: string | null = null;
  private tokenExpiresAt: number = 0; // epoch ms

  constructor(clientId: string, clientSecret: string) {
    if (!clientId || !clientSecret) {
      throw new Error('KrogerAuth requires both clientId and clientSecret');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // -------------------------------------------------------------------------
  // Client Credentials flow (Products + Locations)
  // -------------------------------------------------------------------------

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
   * Clears the cached client-credentials token, forcing a fresh fetch on the next call.
   */
  clearToken(): void {
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  // -------------------------------------------------------------------------
  // Authorization Code flow (Cart + Identity)
  // -------------------------------------------------------------------------

  /**
   * Builds the Kroger authorization URL that the customer must visit to grant consent.
   *
   * @param redirectUri - The registered redirect URI for your application.
   * @param scopes - OAuth scopes to request (e.g. ['cart.basic:write', 'profile.compact']).
   * @returns The full authorization URL string.
   */
  getAuthorizationUrl(redirectUri: string, scopes: string[]): string {
    const params = new URLSearchParams({
      scope: scopes.join(' '),
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
    });

    return `${AUTHORIZE_URL}?${params.toString()}`;
  }

  /**
   * Exchanges an authorization code for an access token (and refresh token).
   *
   * @param code - The authorization code received at the redirect URI.
   * @param redirectUri - The same redirect URI used in the authorization request.
   * @returns The token response including access_token and refresh_token.
   */
  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<KrogerTokenResponse> {
    log('info', 'Exchanging Kroger authorization code for token');

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    });

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Kroger authorization code exchange failed (${response.status}): ${errorBody}`
        );
      }

      const data: KrogerTokenResponse = await response.json() as KrogerTokenResponse;
      log('info', `Kroger customer token acquired, expires in ${data.expires_in}s`);
      return data;
    } catch (error) {
      log('error', 'Failed to exchange Kroger authorization code', error);
      throw error;
    }
  }

  /**
   * Refreshes a customer access token using a refresh token.
   *
   * @param refreshToken - The refresh token from a previous authorization code exchange.
   * @returns A new token response with a fresh access_token (and possibly a new refresh_token).
   */
  async refreshAccessToken(refreshToken: string): Promise<KrogerTokenResponse> {
    log('info', 'Refreshing Kroger customer access token');

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    try {
      const response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${credentials}`,
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Kroger token refresh failed (${response.status}): ${errorBody}`
        );
      }

      const data: KrogerTokenResponse = await response.json() as KrogerTokenResponse;
      log('info', `Kroger customer token refreshed, expires in ${data.expires_in}s`);
      return data;
    } catch (error) {
      log('error', 'Failed to refresh Kroger access token', error);
      throw error;
    }
  }
}
