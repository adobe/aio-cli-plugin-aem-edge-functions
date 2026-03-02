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

const BaseCommand = require('../../../libs/base-command');
const Config = require('@adobe/aio-lib-core-config');
const chalk = require('chalk');
const { Flags } = require('@oclif/core');

class InfoCommand extends BaseCommand {
  static description = 'Display current AEM Edge Functions configuration.';
  static flags = {
    debug: Flags.boolean({
      description: 'Show detailed API endpoint information',
      default: false
    })
  };

  async run() {
    try {
      console.log(chalk.bold('\nCurrent AEM Edge Functions Configuration:\n'));

      const orgId = Config.get(this.CONFIG_ORG);
      const programId = Config.get(this.CONFIG_PROGRAM);
      const environmentId = Config.get(this.CONFIG_ENVIRONMENT);
      const programName = Config.get(this.CONFIG_PROGRAM_NAME);
      const environmentName = Config.get(this.CONFIG_ENVIRONMENT_NAME);
      const edgeDelivery = Config.get(this.CONFIG_EDGE_DELIVERY);
      const adcOrgId = Config.get(this.CONFIG_ADC_ORG);
      const adcProjectId = Config.get(this.CONFIG_ADC_PROJECT);
      const adcProjectName = Config.get(this.CONFIG_ADC_PROJECT_NAME);
      const adcWorkspaceId = Config.get(this.CONFIG_ADC_WORKSPACE);
      const adcWorkspaceName = Config.get(this.CONFIG_ADC_WORKSPACE_NAME);

      console.log(`Organization ID:        ${orgId ? chalk.green(orgId) : chalk.red('Not set')}`);
      console.log(
        `Program ID:             ${programId ? chalk.green(programId) : chalk.red('Not set')}`
      );
      console.log(
        `Program Name:           ${programName ? chalk.green(programName) : chalk.red('Not set')}`
      );
      console.log(
        `Environment ID:         ${environmentId ? chalk.green(environmentId) : chalk.red('Not set')}`
      );
      console.log(
        `Environment Name:       ${environmentName ? chalk.green(environmentName) : chalk.red('Not set')}`
      );
      console.log(
        `Edge Delivery:          ${edgeDelivery !== undefined ? (edgeDelivery ? chalk.green('Yes') : chalk.yellow('No')) : chalk.red('Not set')}`
      );

      // Display ADC configuration if available
      if (adcProjectId || adcWorkspaceId) {
        console.log(chalk.bold('\nAdobe Developer Console:'));

        if (adcOrgId) {
          console.log(`  ADC Org ID:           ${chalk.green(adcOrgId)}`);
        }

        console.log(
          `  Project ID:           ${adcProjectId ? chalk.green(adcProjectId) : chalk.red('Not set')}`
        );
        console.log(
          `  Project Name:         ${adcProjectName ? chalk.green(adcProjectName) : chalk.red('Not set')}`
        );
        console.log(
          `  Workspace ID:         ${adcWorkspaceId ? chalk.green(adcWorkspaceId) : chalk.red('Not set')}`
        );
        console.log(
          `  Workspace Name:       ${adcWorkspaceName ? chalk.green(adcWorkspaceName) : chalk.red('Not set')}`
        );

        // Display link to ADC project if we have the necessary IDs
        if (adcOrgId && adcProjectId) {
          const adcProjectUrl = `https://developer.adobe.com/console/projects/${adcOrgId}/${adcProjectId}/overview`;
          console.log(`  Console URL:          ${chalk.cyan(adcProjectUrl)}`);
        }
      }

      // Display Cloud Manager URL
      if (orgId && programId) {
        let cloudManagerUrl;
        if (edgeDelivery) {
          cloudManagerUrl = `https://experience.adobe.com/#/@${orgId}/cloud-manager/edge-delivery.html/program/${programId}`;
        } else if (environmentId) {
          cloudManagerUrl = `https://experience.adobe.com/#/@${orgId}/cloud-manager/environments.html/program/${programId}/environment/${environmentId}`;
        }

        if (cloudManagerUrl) {
          console.log(`\nCloud Manager URL:      ${chalk.cyan(cloudManagerUrl)}`);
        }
      }

      // Display computed API endpoint only when debug flag is set
      if (this.flags.debug) {
        const apiEndpoint = this.getApiEndpoint();

        console.log(
          `\nAPI Endpoint:           ${apiEndpoint ? chalk.cyan(apiEndpoint) : chalk.red('Not available (missing configuration)')}`
        );

        // Display environment variable overrides if set
        if (process.env.AEM_EDGE_FUNCTIONS_API_ENDPOINT) {
          console.log(
            chalk.yellow(
              '\nNote: AEM_EDGE_FUNCTIONS_API_ENDPOINT environment variable is set and will override computed endpoint.'
            )
          );
        }
        if (process.env.AEM_EDGE_FUNCTIONS_TOKEN) {
          console.log(
            chalk.yellow(
              'Note: AEM_EDGE_FUNCTIONS_TOKEN environment variable is set and will override IMS token.'
            )
          );
        }

        // Test API connectivity and token validity
        if (apiEndpoint) {
          console.log(chalk.bold('\nTesting API connectivity...'));
          try {
            const { createFetch } = require('@adobe/aio-lib-core-networking');
            const fetch = createFetch();

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
                    accessToken = (await this.getTokenAndKey())?.accessToken;
                  }
                } catch (error) {
                  accessToken = (await this.getTokenAndKey())?.accessToken;
                }
              } else {
                accessToken = (await this.getTokenAndKey())?.accessToken;
              }
            }

            const response = await fetch(apiEndpoint, {
              method: 'HEAD',
              headers: {
                Authorization: `Bearer ${accessToken}`
              }
            });

            if (response.ok || response.status === 404) {
              // 404 is acceptable - it means we can reach the endpoint
              console.log(
                `API Status:             ${chalk.green('✓ Connected')} (HTTP ${response.status})`
              );
            } else if (response.status === 401 || response.status === 403) {
              console.log(
                `API Status:             ${chalk.red('✗ Authentication failed')} (HTTP ${response.status})`
              );
              console.log(
                chalk.yellow(
                  'Token may be expired or invalid. Try running setup again or check your IMS context.'
                )
              );
            } else {
              console.log(
                `API Status:             ${chalk.yellow('⚠ Unexpected response')} (HTTP ${response.status})`
              );
            }
          } catch (error) {
            console.log(`API Status:             ${chalk.red('✗ Connection failed')}`);
            console.log(chalk.red(`Error: ${error.message}`));
          }
        }
      }

      const hasRequiredConfig = orgId && programId && environmentId;
      if (!hasRequiredConfig) {
        console.log(
          chalk.yellow(
            "\nWarning: Configuration is incomplete. Run 'aio aem edge-functions setup' to configure."
          )
        );
      } else {
        console.log(chalk.green('\nConfiguration is complete and ready to use.'));
      }
    } catch (err) {
      this.spinnerStop();
      throw err;
    }
  }
}

module.exports = InfoCommand;
