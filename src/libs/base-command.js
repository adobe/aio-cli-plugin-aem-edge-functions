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

  async init() {
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
   * Get access token using ADC OAuth Server-to-Server credentials
   * @returns {Promise<Object|null>} Token and API key or null
   */
  async getAdcToken() {
    const adcProjectId = Config.get(this.CONFIG_ADC_PROJECT);
    const adcWorkspaceId = Config.get(this.CONFIG_ADC_WORKSPACE);
    const clientId = Config.get(this.CONFIG_ADC_CLIENT_ID);
    const clientSecret = Config.get(this.CONFIG_ADC_CLIENT_SECRET) || process.env.ADC_CLIENT_SECRET;
    const scopes = Config.get(this.CONFIG_ADC_SCOPES);

    if (!adcProjectId || !adcWorkspaceId || !clientId) {
      return null;
    }

    if (!clientSecret) {
      ux.warn('Client secret not configured. Please run the setup command to configure it.');
      return null;
    }

    // Exchange OAuth credentials for access token via IMS (no ADC API call needed)
    const accessToken = await this.exchangeOAuthForToken(clientId, clientSecret, scopes);

    if (!accessToken) {
      return null;
    }

    return {
      accessToken,
      apiKey: clientId,
      local: false,
      data: { client_id: clientId }
    };
  }

  /**
   * Exchange OAuth credentials for an access token
   * @param {string} clientId OAuth client ID
   * @param {string} clientSecret OAuth client secret
   * @param {Array|string} scopes OAuth scopes (array or comma-separated string)
   * @returns {Promise<string|null>} Access token or null
   */
  async exchangeOAuthForToken(clientId, clientSecret, scopes) {
    try {
      const fetch = createFetch();
      const scopeString = Array.isArray(scopes) ? scopes.join(',') : scopes || '';

      const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
      }

      const data = await response.json();
      return data.access_token;
    } catch (error) {
      ux.warn(`Failed to exchange OAuth credentials: ${error.message}`);
      return null;
    }
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
   * Get the API endpoint for AEM Edge Functions
   * @returns {string|null} The computed API endpoint or null if configuration is incomplete
   */
  getApiEndpoint() {
    let apiEndpoint = process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT;

    if (!apiEndpoint) {
      const isEdgeDelivery =
        Config.get(this.CONFIG_EDGE_DELIVERY) || Config.get(this.CONFIG_EDGE_DELIVERY_LEGACY);
      const programId = Config.get(this.CONFIG_PROGRAM);
      const environmentId = Config.get(this.CONFIG_ENVIRONMENT);
      const siteDomain =
        Config.get(this.CONFIG_SITE_DOMAIN) || Config.get(this.CONFIG_SITE_DOMAIN_LEGACY);

      if (!programId || !environmentId) {
        return null;
      }

      apiEndpoint = isEdgeDelivery
        ? `https://${siteDomain}`
        : `https://author-p${programId}-e${environmentId}.adobeaemcloud.com`;
    }

    apiEndpoint +=
      process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT_URL ??
      '/adobe/experimental/compute-expires-20251231/cdn/edgeFunctions/fastly';

    return apiEndpoint;
  }

  async getFastlyCli() {
    const apiEndpoint = this.getApiEndpoint();

    // For edge function API requests, try to use ADC token if configured
    let accessToken = process.env.AEM_EDGE_FUNCTIONS_TOKEN;

    if (!accessToken) {
      const adcConfigured = Config.get(this.CONFIG_ADC_CONFIGURED);

      if (adcConfigured) {
        try {
          const adcToken = await this.getAdcToken();
          if (adcToken) {
            accessToken = adcToken.accessToken;
          } else {
            ux.warn('Failed to get ADC token, falling back to IMS token');
            accessToken = (await this.getTokenAndKey())?.accessToken;
          }
        } catch (error) {
          ux.warn(`Failed to get ADC token: ${error.message}, falling back to IMS token`);
          accessToken = (await this.getTokenAndKey())?.accessToken;
        }
      } else {
        // No ADC configured, use IMS token
        accessToken = (await this.getTokenAndKey())?.accessToken;
      }
    }

    return new FastlyCli(accessToken, apiEndpoint);
  }
}

module.exports = BaseCommand;
