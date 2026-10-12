/*
 * Copyright 2026 Adobe Inc. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

'use strict';

const ora = require('ora-classic');
const jwt = require('jsonwebtoken');
const chalk = require('chalk');
const { context, getToken } = require('@adobe/aio-lib-ims');
const { Command } = require('@oclif/core');
const { ux } = require('@oclif/core');
const Config = require('@adobe/aio-lib-core-config');
const FastlyCli = require('./fastly-cli');
const { createFetch } = require('@adobe/aio-lib-core-networking');

let spinner;

const ENV_VAR_MAP = {
  cloudmanager_orgid: 'AEM_EDGE_FUNCTIONS_ORG_ID',
  cloudmanager_programid: 'AEM_EDGE_FUNCTIONS_PROGRAM_ID',
  cloudmanager_environmentid: 'AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID',
  edgefunctions_edge_delivery: 'AEM_EDGE_FUNCTIONS_EDGE_DELIVERY',
  edgefunctions_site_domain: 'AEM_EDGE_FUNCTIONS_SITE_DOMAIN',
  edgefunctions_adc_configured: 'AEM_EDGE_FUNCTIONS_ADC_CONFIGURED',
  edgefunctions_adc_orgid: 'AEM_EDGE_FUNCTIONS_ADC_ORG_ID',
  edgefunctions_adc_projectid: 'AEM_EDGE_FUNCTIONS_ADC_PROJECT_ID',
  edgefunctions_adc_workspaceid: 'AEM_EDGE_FUNCTIONS_ADC_WORKSPACE_ID',
  edgefunctions_adc_client_id: 'AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID',
  edgefunctions_adc_client_secret: 'AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET',
  edgefunctions_adc_scopes: 'AEM_EDGE_FUNCTIONS_ADC_SCOPES'
};

// Keys that can be sourced from the AEM_EDGE_FUNCTIONS_ADC_CONFIG env var
const ADC_CONFIG_KEY_MAP = {
  edgefunctions_adc_configured: 'configured',
  edgefunctions_adc_orgid: 'orgId',
  edgefunctions_adc_projectid: 'projectId',
  edgefunctions_adc_workspaceid: 'workspaceId',
  edgefunctions_adc_client_id: 'clientId',
  edgefunctions_adc_client_secret: 'clientSecret',
  edgefunctions_adc_scopes: 'scopes'
};

let _adcConfigCache; // undefined = not yet parsed, null = parsed but absent/invalid

function parseAdcConfigEnv() {
  if (_adcConfigCache !== undefined) return _adcConfigCache;
  const raw = process.env.AEM_EDGE_FUNCTIONS_ADC_CONFIG;
  if (!raw) {
    _adcConfigCache = null;
    return null;
  }
  try {
    const json = JSON.parse(raw);
    const parsed = BaseCommand.parseAdcConfigJson(json);
    _adcConfigCache = parsed
      ? {
          ...parsed,
          scopes: Array.isArray(parsed.scopes) ? parsed.scopes.join(',') : parsed.scopes || null,
          configured: true
        }
      : null;
  } catch {
    _adcConfigCache = null;
  }
  return _adcConfigCache;
}

const BOOLEAN_CONFIGS = new Set([
  'edgefunctions_edge_delivery',
  'cloudmanager_edge_delivery',
  'edgefunctions_adc_configured'
]);

function parseBool(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 1) return true;
  if (value === 'false' || value === '0' || value === 0) return false;
  return undefined;
}

class BaseCommand extends Command {
  CONFIG_ORG = 'cloudmanager_orgid';
  CONFIG_PROGRAM = 'cloudmanager_programid';
  CONFIG_ENVIRONMENT = 'cloudmanager_environmentid';
  CONFIG_EDGE_DELIVERY = 'edgefunctions_edge_delivery';
  CONFIG_EDGE_DELIVERY_LEGACY = 'cloudmanager_edge_delivery';
  CONFIG_SITE_DOMAIN = 'edgefunctions_site_domain';
  CONFIG_SITE_DOMAIN_LEGACY = 'cloudmanager_environmentname';
  CONFIG_ADC_CONFIGURED = 'edgefunctions_adc_configured';
  CONFIG_ADC_ORG = 'edgefunctions_adc_orgid';
  CONFIG_ADC_PROJECT = 'edgefunctions_adc_projectid';
  CONFIG_ADC_WORKSPACE = 'edgefunctions_adc_workspaceid';
  CONFIG_ADC_CLIENT_ID = 'edgefunctions_adc_client_id';
  CONFIG_ADC_CLIENT_SECRET = 'edgefunctions_adc_client_secret';
  CONFIG_ADC_SCOPES = 'edgefunctions_adc_scopes';

  // IMS token endpoint used for the OAuth Server-to-Server (client_credentials) exchange.
  IMS_TOKEN_ENDPOINT = 'https://ims-na1.adobelogin.com/ims/token/v3';

  /**
   * Parse an ADC config JSON object, auto-detecting the format:
   * - Full format: { project: { ... } } — downloaded from ADC project page
   * - Credentials-only format: { CLIENT_ID, CLIENT_SECRETS, ORG_ID, SCOPES, ... } — downloaded from ADC credential page
   *
   * Returns a normalized object: { format, orgId, projectId, workspaceId, clientId, clientSecret, scopes }
   * projectId and workspaceId are null in the credentials-only format.
   */
  static parseAdcConfigJson(json) {
    if (!json || typeof json !== 'object') return null;

    // Full project format
    if (json.project) {
      const project = json.project;
      const workspace = project?.workspace;
      const credential = workspace?.details?.credentials?.find(
        (c) => c.integration_type === 'oauth_server_to_server'
      );
      const oauth = credential?.oauth_server_to_server;
      if (!oauth) return null;
      return {
        format: 'full',
        orgId: project?.org?.ims_org_id || null,
        projectId: project?.id || null,
        workspaceId: workspace?.id || null,
        clientId: oauth.client_id || null,
        clientSecret: oauth.client_secrets?.[0] || null,
        scopes: Array.isArray(oauth.scopes) ? oauth.scopes : []
      };
    }

    // Credentials-only format: flat keys CLIENT_ID, CLIENT_SECRETS, ORG_ID, SCOPES
    if (json.CLIENT_ID) {
      return {
        format: 'credentials',
        orgId: json.ORG_ID || null,
        projectId: null,
        workspaceId: null,
        clientId: json.CLIENT_ID,
        clientSecret: Array.isArray(json.CLIENT_SECRETS)
          ? json.CLIENT_SECRETS[0]
          : json.CLIENT_SECRETS || null,
        scopes: Array.isArray(json.SCOPES) ? json.SCOPES : json.SCOPES ? [json.SCOPES] : []
      };
    }

    return null;
  }

  /**
   * Get a configuration value, checking environment variables before aio config.
   * Environment variables follow the AEM_EF_* naming convention (see ENV_VAR_MAP).
   * @param {string} key aio config key (e.g. this.CONFIG_ORG)
   * @returns {string|undefined} The configuration value
   */
  getConfig(key) {
    const envVar = ENV_VAR_MAP[key];
    let value;
    if (envVar && process.env[envVar] !== undefined) {
      // Individual env var takes highest precedence
      value = process.env[envVar];
    } else if (ADC_CONFIG_KEY_MAP[key]) {
      // Fall back to AEM_EDGE_FUNCTIONS_ADC_CONFIG if available
      const adcConfig = parseAdcConfigEnv();
      const adcValue = adcConfig?.[ADC_CONFIG_KEY_MAP[key]];
      value = adcValue !== undefined && adcValue !== null ? adcValue : Config.get(key);
    } else {
      value = Config.get(key);
    }
    return BOOLEAN_CONFIGS.has(key) ? parseBool(value) : value;
  }

  async init() {
    // --accept-beta is deprecated (AEM Edge Functions is now generally available) but still
    // tolerated as a no-op so existing CI/CD does not break. Strip it before oclif parses so
    // it is not rejected as an unknown flag, and print a one-line deprecation note.
    if (process.argv.includes('--accept-beta')) {
      this.argv = this.argv.filter((a) => a !== '--accept-beta');
      console.warn(
        chalk.dim(
          'Note: --accept-beta is deprecated and no longer has any effect; you can remove it.'
        )
      );
    }

    await super.init();
    const { args, flags } = await this.parse({
      flags: this.ctor.flags,
      baseFlags: super.ctor.baseFlags,
      args: this.ctor.args,
      strict: this.ctor.strict
    });
    this.flags = flags;
    this.args = args;
  }

  /**
   * Get the IMS access token and API key from the configured context or the default one
   * This is used for Cloud Manager and ADC API calls (always uses IMS token)
   */
  async getTokenAndKey() {
    // Always use standard IMS token for Cloud Manager and ADC API calls
    let contextName =
      this.flags?.context || (await context.getCurrent()) || 'aio-cli-plugin-cloudmanager';
    let contextData = await context.get(contextName);

    if (!contextData?.data) {
      if (contextName !== 'aio-cli-plugin-cloudmanager') {
        console.log(chalk.red(`\nConfigured default context '${contextName}' not found.`));
        throw new Error(
          "No valid IMS context found. Please set a valid context using 'aio context set' command."
        );
      } else {
        contextName = 'cli';
        contextData = await context.get(contextName);
      }
    }

    const local = contextData?.local || false;
    const data = contextData?.data;
    if (!data) {
      throw new Error(`Context has no data: ${contextName}`);
    }

    if (contextName === 'aio-cli-plugin-cloudmanager') {
      console.log(
        chalk.yellow(
          `\nUsing deprecated context '${contextName}'. Refer to the documentation to update your context: https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/implementing/developing/rapid-development-environments#aio-rde-plugin-troubleshooting-deprecatedcontext`
        )
      );
    }

    const accessToken = await getToken(contextName);
    const apiKey = data.client_id ? data.client_id : jwt.decode(accessToken)?.client_id;
    if (!apiKey) {
      if (!jwt.decode(accessToken)) {
        throw new Error(`Cannot decode access token for context: ${contextName}`);
      }
      throw new Error(`No client_id found in access token for context: ${contextName}`);
    }
    return { accessToken, apiKey, local, data };
  }

  /**
   * Get access token using ADC OAuth Server-to-Server credentials.
   *
   * On failure this throws an Error annotated with a structured `.adcAuth` detail
   * object (and caches it on `this._lastAdcAuthError`) instead of silently returning
   * null, so callers and `info --debug` can report the real cause. The detail object
   * never contains secret material.
   * @returns {Promise<Object>} Token and API key
   */
  async getAdcToken() {
    const clientId = this.getConfig(this.CONFIG_ADC_CLIENT_ID);
    const clientSecret = this.getConfig(this.CONFIG_ADC_CLIENT_SECRET);
    const scopes = this.getConfig(this.CONFIG_ADC_SCOPES);

    const missing = [];
    if (!clientId) missing.push('Client ID');
    if (!clientSecret) missing.push('Client Secret');
    if (!scopes) missing.push('Scopes');
    if (missing.length > 0) {
      throw this.makeAdcAuthError('ADC credentials are incomplete', {
        kind: 'config',
        missing
      });
    }

    // Exchange OAuth credentials for access token via IMS (no ADC API call needed).
    const accessToken = await this.exchangeOAuthForToken(clientId, clientSecret, scopes);

    return {
      accessToken,
      apiKey: clientId,
      local: false,
      data: { client_id: clientId }
    };
  }

  /**
   * Resolve the fetch implementation used for the IMS token exchange.
   * Exposed as a method so it can be overridden in tests.
   * @returns {Function} fetch
   */
  getFetch() {
    return createFetch();
  }

  /**
   * Exchange OAuth Server-to-Server credentials for an access token via IMS.
   *
   * Never swallows the IMS response: on any failure it throws an Error annotated with
   * a structured `.adcAuth` detail object describing exactly what went wrong (network
   * vs. HTTP, status, IMS `error`/`error_description`, raw body). The detail is also
   * cached on `this._lastAdcAuthError`. No secret material is captured.
   * @param {string} clientId OAuth client ID
   * @param {string} clientSecret OAuth client secret
   * @param {Array|string} scopes OAuth scopes (array or comma-separated string)
   * @returns {Promise<string>} Access token
   */
  async exchangeOAuthForToken(clientId, clientSecret, scopes) {
    const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes || '';
    const fetch = this.getFetch();

    let response;
    try {
      response = await fetch(this.IMS_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          scope: scopeString
        }).toString()
      });
    } catch (error) {
      // Network / DNS / TLS / proxy failure before any HTTP response from IMS.
      throw this.makeAdcAuthError('Could not reach the IMS token endpoint', {
        kind: 'network',
        imsEndpoint: this.IMS_TOKEN_ENDPOINT,
        cause: error.message
      });
    }

    if (!response.ok) {
      const raw = await response.text().catch(() => '');
      let imsError;
      let imsErrorDescription;
      try {
        const parsed = JSON.parse(raw);
        imsError = parsed.error;
        imsErrorDescription = parsed.error_description;
      } catch {
        // IMS returned a non-JSON body; keep the raw text for reporting.
      }
      throw this.makeAdcAuthError('IMS rejected the client_credentials token request', {
        kind: 'ims',
        imsEndpoint: this.IMS_TOKEN_ENDPOINT,
        status: response.status,
        error: imsError,
        errorDescription: imsErrorDescription,
        raw: raw ? String(raw).slice(0, 2000) : ''
      });
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw this.makeAdcAuthError('IMS returned a token response that could not be parsed', {
        kind: 'ims',
        imsEndpoint: this.IMS_TOKEN_ENDPOINT,
        status: response.status,
        cause: error.message
      });
    }

    if (!data.access_token) {
      throw this.makeAdcAuthError('IMS response did not contain an access_token', {
        kind: 'ims',
        imsEndpoint: this.IMS_TOKEN_ENDPOINT,
        status: response.status,
        raw: JSON.stringify(data).slice(0, 2000)
      });
    }

    this._lastAdcAuthError = null;
    return data.access_token;
  }

  /**
   * Build an Error annotated with a structured `.adcAuth` detail object and cache it
   * on `this._lastAdcAuthError`. The detail never contains secret material.
   * @param {string} message Short human-readable message
   * @param {Object} detail Structured detail ({ kind, ... })
   * @returns {Error}
   */
  makeAdcAuthError(message, detail) {
    const summary = this.summarizeAdcAuthDetail(detail);
    const error = new Error(summary ? `${message}: ${summary}` : message);
    error.name = 'AdcAuthError';
    error.adcAuth = detail;
    this._lastAdcAuthError = detail;
    return error;
  }

  /**
   * One-line, secret-free summary of a structured ADC auth detail.
   * @param {Object} detail
   * @returns {string}
   */
  summarizeAdcAuthDetail(detail) {
    if (!detail) return '';
    if (detail.kind === 'config') {
      return `local ADC credentials incomplete (missing ${detail.missing.join(', ')})`;
    }
    if (detail.kind === 'network') {
      return `could not reach ${detail.imsEndpoint} (${detail.cause})`;
    }
    const parts = [];
    if (detail.status) parts.push(`HTTP ${detail.status}`);
    const code = [detail.error, detail.errorDescription].filter(Boolean).join(': ');
    if (code) parts.push(code);
    else if (detail.cause) parts.push(detail.cause);
    else if (detail.raw) parts.push(detail.raw);
    return parts.join(' ');
  }

  /**
   * Targeted, actionable remediation hints for an ADC auth failure (no secrets).
   * @param {Object} detail Structured ADC auth detail
   * @returns {string[]} Hint lines
   */
  adcAuthHints(detail) {
    if (!detail) return [];
    if (detail.kind === 'config') {
      return [
        `Local ADC credentials are incomplete (missing ${detail.missing.join(', ')}).`,
        'Re-run `aio aem edge-functions setup` and re-select the Developer Console project/credential.'
      ];
    }
    if (detail.kind === 'network') {
      return [
        `Could not reach the IMS token endpoint (${detail.imsEndpoint}).`,
        'Check network connectivity, VPN, corporate proxy (HTTPS_PROXY) and any TLS interception.'
      ];
    }
    switch (detail.error) {
      case 'invalid_client':
        return [
          'IMS rejected the client_id/client_secret pair (invalid_client).',
          'The client secret is likely wrong, rotated, or the credential/technical account was disabled.',
          'Fix: in Adobe Developer Console, open the OAuth Server-to-Server credential, generate a new client secret, then re-run `aio aem edge-functions setup`.',
          'If a freshly generated secret ALSO fails, the technical account or its org/product-profile entitlement likely changed - ask an org admin to verify it.'
        ];
      case 'invalid_scope':
        return [
          'IMS rejected one or more requested scopes (invalid_scope).',
          'The credential may have lost an API/product entitlement, or a requested scope is not grantable to this Server-to-Server credential.',
          'Fix: in Developer Console, confirm the project still has the required APIs added and the technical account is in the matching product profiles.'
        ];
      case 'invalid_grant':
        return [
          'IMS rejected the grant (invalid_grant).',
          'The credential may be disabled or is not an OAuth Server-to-Server credential.',
          'Fix: confirm the credential type is "OAuth Server-to-Server" and re-run `aio aem edge-functions setup`.'
        ];
      case 'access_denied':
        return [
          'IMS denied access for this credential (access_denied).',
          'This usually indicates a missing org entitlement or product profile for the technical account.',
          'Fix: ask an org admin to verify the technical account org membership and product profiles.'
        ];
      default:
        return [
          detail.status
            ? `IMS returned HTTP ${detail.status}${detail.error ? ` (${detail.error})` : ''}.`
            : 'IMS returned an unexpected response.',
          'Validate the credential directly against IMS (see the reproduction command) and verify the Developer Console credential and org entitlements.'
        ];
    }
  }

  /**
   * A copy-pasteable curl command that reproduces the IMS client_credentials call,
   * with the secret redacted. Useful for remote debugging with customer reps.
   * @param {string} clientId OAuth client ID
   * @param {Array|string} scopes OAuth scopes
   * @returns {string}
   */
  buildAdcTokenCurl(clientId, scopes) {
    const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes || '';
    return [
      `curl -s -X POST "${this.IMS_TOKEN_ENDPOINT}" \\`,
      '  -H "Content-Type: application/x-www-form-urlencoded" \\',
      '  -d "grant_type=client_credentials" \\',
      `  -d "client_id=${clientId || '<CLIENT_ID>'}" \\`,
      '  --data-urlencode "client_secret=<YOUR_CLIENT_SECRET>" \\',
      `  --data-urlencode "scope=${scopeString || '<SCOPES>'}"`
    ].join('\n');
  }

  /**
   * Multi-line, secret-free explanation of an ADC auth error combining the structured
   * detail with targeted remediation hints. Suitable for logs and `info --debug`.
   * @param {Error} error Error thrown by getAdcToken/exchangeOAuthForToken
   * @returns {string}
   */
  formatAdcAuthError(error) {
    const detail = error?.adcAuth || this._lastAdcAuthError;
    const lines = [];
    if (detail && detail.kind === 'ims') {
      lines.push(`IMS endpoint:   ${detail.imsEndpoint}`);
      if (detail.status) lines.push(`HTTP status:    ${detail.status}`);
      if (detail.error) lines.push(`IMS error:      ${detail.error}`);
      if (detail.errorDescription) lines.push(`Description:    ${detail.errorDescription}`);
      if (!detail.error && detail.raw) lines.push(`IMS response:   ${detail.raw}`);
    } else if (detail && detail.kind === 'network') {
      lines.push(`IMS endpoint:   ${detail.imsEndpoint}`);
      lines.push(`Network error:  ${detail.cause}`);
    } else if (detail && detail.kind === 'config') {
      lines.push(`Missing config: ${detail.missing.join(', ')}`);
    } else if (error) {
      lines.push(error.message);
    }
    for (const hint of this.adcAuthHints(detail)) {
      lines.push(`- ${hint}`);
    }
    return lines.join('\n');
  }

  spinnerStart(message) {
    spinner = ora(message).start();
  }

  spinnerIsSpinning() {
    return spinner?.isSpinning;
  }

  spinnerStop() {
    spinner?.stop();
  }

  getBaseUrl(stage) {
    return !stage ? 'https://cloudmanager.adobe.io' : 'https://cloudmanager-stage.adobe.io';
  }

  /**
   * Detect whether the CLI is configured for the Cloud Manager stage environment.
   * Checks AIO_CLI_ENV env var and aio config 'cli.env' / 'ims.contexts.cli.env'.
   * This does not require a token and works in batch mode.
   */
  isStageEnv() {
    if (process.env.AIO_CLI_ENV === 'stage') return true;
    const cliEnv = Config.get('cli.env');
    if (cliEnv === 'stage') return true;
    const imsEnv = Config.get('ims.contexts.cli.env');
    if (imsEnv === 'stage') return true;
    return false;
  }

  /**
   * Get the API base path for AEM Edge Functions (without the edge functions path suffix)
   * @param {boolean} [stage=false] Whether to use the Cloud Manager stage domain suffix (-cmstg)
   * @returns {string|null} The computed base URL or null if configuration is incomplete
   */
  getApiBasePath(stage = false) {
    if (process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT) {
      return process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT;
    }

    const isEdgeDelivery =
      this.getConfig(this.CONFIG_EDGE_DELIVERY) || this.getConfig(this.CONFIG_EDGE_DELIVERY_LEGACY);
    const programId = this.getConfig(this.CONFIG_PROGRAM);
    const environmentId = this.getConfig(this.CONFIG_ENVIRONMENT);
    const siteDomain =
      this.getConfig(this.CONFIG_SITE_DOMAIN) || this.getConfig(this.CONFIG_SITE_DOMAIN_LEGACY);

    if (!programId || (isEdgeDelivery && !siteDomain) || (!isEdgeDelivery && !environmentId)) {
      return null;
    }

    const stageSuffix = stage ? '-cmstg' : '';
    return isEdgeDelivery
      ? `https://${siteDomain}/adobe/experimental/compute-expires-20251231/cdn`
      : `https://author-p${programId}-e${environmentId}${stageSuffix}.adobeaemcloud.com/adobe/experimental/compute-expires-20251231/cdn`;
  }

  /**
   * Get the API endpoint for AEM Edge Functions
   * @param {boolean} [stage=false] Whether to use the Cloud Manager stage domain suffix (-cmstg)
   * @returns {string|null} The computed API endpoint or null if configuration is incomplete
   */
  getApiEndpoint(stage = false) {
    const basePath = this.getApiBasePath(stage);
    if (!basePath) return null;

    return basePath + (process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT_URL ?? '/edgeFunctions/fastly');
  }

  /**
   * Get an access token and detect whether the environment is stage.
   * Tries (in order): AEM_EDGE_FUNCTIONS_TOKEN env var, ADC OAuth, IMS token.
   * Stage is detected from IMS context data when available, falling back to isStageEnv().
   * @returns {Promise<{accessToken: string|null, isStage: boolean}>}
   */
  async getAccessTokenAndStage() {
    let accessToken = process.env.AEM_EDGE_FUNCTIONS_TOKEN;
    let isStage = this.isStageEnv();

    if (!accessToken) {
      const adcConfigured = this.getConfig(this.CONFIG_ADC_CONFIGURED);

      if (adcConfigured) {
        try {
          const adcToken = await this.getAdcToken();
          accessToken = adcToken.accessToken;
        } catch (error) {
          // getAdcToken throws an AdcAuthError with structured detail; surface the real
          // cause instead of a generic message, then fall back to an interactive IMS token.
          const summary =
            this.summarizeAdcAuthDetail(error.adcAuth || this._lastAdcAuthError) || error.message;
          ux.warn(`ADC Server-to-Server token retrieval failed: ${summary}`);
          ux.warn(
            'Falling back to an interactive IMS token. If that token lacks the required ' +
              'entitlement the command may still fail with HTTP 403. ' +
              'Run `aio aem edge-functions info --debug` for a full diagnosis.'
          );
          const tokenResult = await this.getTokenAndKey();
          accessToken = tokenResult?.accessToken;
          isStage = tokenResult?.data?.env === 'stage' || isStage;
        }
      } else {
        // No ADC configured, use IMS token
        const tokenResult = await this.getTokenAndKey();
        accessToken = tokenResult?.accessToken;
        isStage = tokenResult?.data?.env === 'stage' || isStage;
      }
    }

    return { accessToken, isStage };
  }

  async getFastlyCli() {
    const { accessToken, isStage } = await this.getAccessTokenAndStage();
    const apiEndpoint = this.getApiEndpoint(isStage);
    return new FastlyCli(accessToken, apiEndpoint);
  }
}

module.exports = BaseCommand;
