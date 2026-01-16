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
const Config = require('@adobe/aio-lib-core-config');
const FastlyCli = require('./fastly-cli');

let spinner;

class BaseCommand extends Command {
  CONFIG_ORG = 'cloudmanager_orgid';
  CONFIG_PROGRAM = 'cloudmanager_programid';
  CONFIG_ENVIRONMENT = 'cloudmanager_environmentid';
  CONFIG_PROGRAM_NAME = 'cloudmanager_programname';
  CONFIG_ENVIRONMENT_NAME = 'cloudmanager_environmentname';
  CONFIG_EDGE_DELIVERY = 'cloudmanager_edge_delivery';
  LINK_ORGID =
    'https://experienceleague.adobe.com/en/docs/core-services/interface/administration/organizations#concept_EA8AEE5B02CF46ACBDAD6A8508646255';

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
   */
  async getTokenAndKey() {
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

  async getFastlyCli() {
    let apiEndpoint = process.env.AEM_COMPUTE_API_ENDPOINT;

    if (!apiEndpoint) {
      const isEdgeDelivery = Config.get(this.CONFIG_EDGE_DELIVERY);
      const programId = Config.get(this.CONFIG_PROGRAM);
      const environmentId = Config.get(this.CONFIG_ENVIRONMENT);
      const environmentName = Config.get(this.CONFIG_ENVIRONMENT_NAME);

      apiEndpoint = isEdgeDelivery
        ? `https://${environmentName}`
        : `https://publish-p${programId}-e${environmentId}.adobeaemcloud.com`;
    }

    apiEndpoint +=
      process.env.AEM_COMPUTE_API_ENDPOINT_URL ??
      '/adobe/experimental/compute-expires-20251231/cdn/compute/fastly';

    const accessToken = process.env.AEM_COMPUTE_TOKEN ?? (await this.getTokenAndKey())?.accessToken;

    return new FastlyCli(accessToken, apiEndpoint);
  }
}

module.exports = BaseCommand;
