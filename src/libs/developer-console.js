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

const { init } = require('@adobe/aio-lib-console');
const { ux } = require('@oclif/core');

class DeveloperConsole {
  /**
   * Initializes a DeveloperConsole object.
   *
   * @param {string} orgId the organization id
   * @param {string} apiKey the api key
   * @param {string} accessToken The bearer token used to authenticate requests to the API.
   */
  constructor(orgId, apiKey, accessToken) {
    this.orgId = orgId;
    this.apiKey = apiKey;
    this.accessToken = accessToken;
    this._consoleClient = null;
  }

  async _getClient() {
    if (!this._consoleClient) {
      this._consoleClient = await init(this.accessToken, this.apiKey, process.env);
    }
    return this._consoleClient;
  }

  /**
   * Get the ADC organization ID from the org code
   * The orgId from AIO is in format orgcode@AdobeOrg, but we need the numeric ADC org ID
   * @returns {Promise<string>} The ADC organization ID
   */
  async _getAdcOrgId() {
    if (this._adcOrgId) {
      return this._adcOrgId;
    }

    try {
      const client = await this._getClient();
      const response = await client.getOrganizations();

      if (!response || !response.body) {
        // Fallback to using the orgId as-is if we can't get organizations
        this._adcOrgId = this.orgId;
        return this._adcOrgId;
      }

      const organizations = response.body;

      // Find the organization that matches our orgId
      // The orgId from AIO is in format like "ABC123@AdobeOrg"
      // The org.code from ADC API also includes the @AdobeOrg suffix
      const matchingOrg = organizations.find((org) => org.code === this.orgId);

      if (matchingOrg && matchingOrg.id) {
        this._adcOrgId = matchingOrg.id;
      } else {
        // Fallback to using the orgId as-is
        this._adcOrgId = this.orgId;
      }

      return this._adcOrgId;
    } catch (error) {
      ux.warn(`Failed to get ADC org ID: ${error.message}`);
      // Fallback to using the orgId as-is
      this._adcOrgId = this.orgId;
      return this._adcOrgId;
    }
  }

  /**
   * List all projects for the organization
   * @returns {Promise<Array>} Array of projects with id and name
   */
  async listProjects() {
    try {
      const client = await this._getClient();
      const adcOrgId = await this._getAdcOrgId();
      const response = await client.getProjectsForOrg(adcOrgId);

      if (!response || !response.body) {
        ux.warn('Failed to list projects from Adobe Developer Console');
        return [];
      }

      return response.body;
    } catch (error) {
      ux.warn(`Failed to list projects: ${error.message}`);
      return [];
    }
  }

  /**
   * Get project details including workspaces
   * @param {string} projectId the project id
   * @returns {Promise<Object>} Project details
   */
  async getProject(projectId) {
    try {
      const client = await this._getClient();
      const adcOrgId = await this._getAdcOrgId();
      const response = await client.getProject(adcOrgId, projectId);

      if (!response || !response.body) {
        ux.warn(`Failed to get project details for ${projectId}`);
        return null;
      }

      return response.body;
    } catch (error) {
      ux.warn(`Failed to get project: ${error.message}`);
      return null;
    }
  }

  /**
   * Get workspaces for a project
   * @param {string} projectId the project id
   * @returns {Promise<Array>} Array of workspaces
   */
  async listWorkspaces(projectId) {
    try {
      const client = await this._getClient();
      const adcOrgId = await this._getAdcOrgId();
      const response = await client.getWorkspacesForProject(adcOrgId, projectId);

      if (!response || !response.body) {
        ux.warn(`Failed to list workspaces for project ${projectId}`);
        return [];
      }

      return response.body;
    } catch (error) {
      ux.warn(`Failed to list workspaces: ${error.message}`);
      return [];
    }
  }

  /**
   * Get credentials for a workspace
   * @param {string} projectId the project id
   * @param {string} workspaceId the workspace id
   * @returns {Promise<Array>} Array of credentials
   */
  async getWorkspaceCredentials(projectId, workspaceId) {
    try {
      const client = await this._getClient();
      const adcOrgId = await this._getAdcOrgId();
      const response = await client.getCredentials(adcOrgId, projectId, workspaceId);

      if (!response || !response.body) {
        ux.warn(`Failed to get credentials for workspace ${workspaceId}`);
        return [];
      }

      return response.body;
    } catch (error) {
      ux.warn(`Failed to get credentials: ${error.message}`);
      return [];
    }
  }

  /**
   * Get scopes for an OAuth credential
   * @param {string} integrationId the integration/credential id
   * @returns {Promise<Array>} Array of scopes
   */
  async getCredentialScopes(integrationId) {
    try {
      const adcOrgId = await this._getAdcOrgId();
      const integration = await this.getIntegration(adcOrgId, integrationId);

      if (integration) {
        // Extract scopes from serviceProperties
        return integration.serviceProperties?.flatMap((sp) => sp.scopes || []) || [];
      }
      return [];
    } catch (error) {
      ux.warn(`Failed to get credential scopes: ${error.message}`);
      return [];
    }
  }

  /**
   * Get OAuth Server-to-Server credentials from workspace
   * @param {string} projectId the project id
   * @param {string} workspaceId the workspace id
   * @returns {Promise<Object|null>} OAuth credentials metadata (without secret, without scopes)
   */
  async getCredentials(projectId, workspaceId) {
    try {
      const workspaceCredentials = await this.getWorkspaceCredentials(projectId, workspaceId);

      // Find OAuth Server-to-Server credential
      const credentials = workspaceCredentials.find(
        (cred) => cred.integration_type === 'oauth_server_to_server'
      );

      if (!credentials) {
        return null;
      }

      return {
        clientId: credentials.client_id,
        credentialId: credentials.id_integration,
        name: credentials.name
      };
    } catch (error) {
      ux.warn(`Failed to get OAuth credentials: ${error.message}`);
      return null;
    }
  }

  /**
   * Get integration details
   * @param {string} orgId the organization id
   * @param {string} integrationId the integration id
   * @returns {Promise<Object|null>} Integration details
   */
  async getIntegration(orgId, integrationId) {
    try {
      const client = await this._getClient();
      const response = await client.getIntegration(orgId, integrationId);

      if (!response || !response.body) {
        ux.warn(`Failed to get integration ${integrationId}`);
        return null;
      }

      return response.body;
    } catch (error) {
      ux.warn(`Failed to get integration: ${error.message}`);
      return null;
    }
  }

  /**
   * Get the URL to view a project credential in Adobe Developer Console
   * @param {string} projectId the project id
   * @param {string} credentialId the credential id
   * @returns {Promise<string>} URL to the OAuth Server-to-Server credential
   */
  async getCredentialUrl(projectId, credentialId) {
    const adcOrgId = await this._getAdcOrgId();
    return `https://developer.adobe.com/console/projects/${adcOrgId}/${projectId}/credentials/${credentialId}/details/oauthservertoserver`;
  }
}

module.exports = {
  DeveloperConsole
};
