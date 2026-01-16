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

const { Request } = require('./request');
const { CliUx } = require('@oclif/core');

class Cloudmanager {
  /**
   * Initializes a Cloudmanager object and returns it.
   *
   * @param {string} cloudManagerUrl the cloudmanager api endpoint
   * @param {string} apiKey the cloudmanager api key
   * @param {string} orgId the cloudmanager org id
   * @param {string} accessToken The bearer token used to authenticate requests to the API.
   */
  constructor(cloudManagerUrl, apiKey, orgId, accessToken) {
    const authorizationHeaders = {
      Authorization: `Bearer ${accessToken}`,
      accept: 'application/json'
    };
    this._cloudManagerClient = new Request(
      cloudManagerUrl,
      Object.assign(
        {
          'x-api-key': apiKey,
          'x-gw-ims-org-id': orgId
        },
        authorizationHeaders
      )
    );
  }

  async listProgramsIdAndName() {
    const response = await this._cloudManagerClient.get(`/programs`);

    if (response.status === 200) {
      const json = await response.json();
      const programs = json._embedded.programs;
      return programs.map((program) => ({
        id: program.id,
        name: program.name
      }));
    } else {
      CliUx.ux.warn(`Failed to list programs: ${response.status} ${response.statusText}`);
      return null;
    }
  }

  async listEnvironmentsIdAndName(programId) {
    if (!programId) {
      return null;
    }
    const apiUrl = `/program/${programId}/environments`;
    const response = await this._cloudManagerClient.get(apiUrl);

    if (response.status === 200) {
      const json = await response.json();
      const environments = json._embedded.environments;
      return environments.map((env) => ({
        id: env.id,
        name: env.name,
        type: env.type,
        status: env.status
      }));
    } else {
      CliUx.ux.error('Failed to list environments');
      return null;
    }
  }

  async listSitesIdAndName(programId) {
    if (!programId) {
      return null;
    }
    const apiUrl = `/program/${programId}/domain-mappings`;
    const response = await this._cloudManagerClient.get(apiUrl);

    if (response.status === 200) {
      const json = await response.json();
      const domainMappings = json.domainMappings;
      return domainMappings.map((site) => ({
        id: site.domainMappingId,
        name: site.domainName
      }));
    } else {
      CliUx.ux.error('Failed to list sites');
      return null;
    }
  }
}

module.exports = {
  Cloudmanager: Cloudmanager
};
