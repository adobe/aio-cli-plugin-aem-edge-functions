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
const { Cloudmanager } = require('../../../libs/cloudmanager');
const { DeveloperConsole } = require('../../../libs/developer-console');

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
      const edgeDelivery = Config.get(this.CONFIG_EDGE_DELIVERY);
      const adcOrgId = Config.get(this.CONFIG_ADC_ORG);
      const adcProjectId = Config.get(this.CONFIG_ADC_PROJECT);
      const adcWorkspaceId = Config.get(this.CONFIG_ADC_WORKSPACE);

      // Fetch names from APIs
      let programName = null;
      let environmentName = null;
      let adcProjectName = null;
      let adcWorkspaceName = null;
      let cloudManagerFetchFailed = false;
      let cloudManagerError = null;
      let adcFetchFailed = false;
      let adcError = null;

      // Fetch Cloud Manager data if we have orgId and programId
      if (orgId && programId) {
        this.spinnerStart('Loading Cloud Manager program and environment names...');
        try {
          const { accessToken, apiKey, data } = await this.getTokenAndKey();
          const cloudManagerUrl = this.getBaseUrl(data?.env === 'stage');
          const cloudmanager = new Cloudmanager(
            `${cloudManagerUrl}/api`,
            apiKey,
            orgId,
            accessToken
          );

          // Fetch program name
          const programs = await cloudmanager.listProgramsIdAndName();
          if (programs) {
            const program = programs.find((p) => p.id === programId);
            if (program) {
              programName = program.name;
            }
          }

          // Fetch environment name if we have environmentId
          if (environmentId) {
            const environments = await cloudmanager.listEnvironmentsIdAndName(programId);
            if (environments) {
              const environment = environments.find((e) => e.id === environmentId);
              if (environment) {
                environmentName = environment.name;
              }
            }
          }
          this.spinnerStop();
        } catch (error) {
          this.spinnerStop();
          cloudManagerFetchFailed = true;
          cloudManagerError = error.message;
        }
      }

      // Fetch ADC data if we have adcOrgId and adcProjectId
      if (adcOrgId && adcProjectId) {
        this.spinnerStart('Loading Adobe Developer Console project and workspace names...');
        try {
          const { accessToken, apiKey } = await this.getTokenAndKey();
          const developerConsole = new DeveloperConsole(adcOrgId, apiKey, accessToken);

          // Fetch project details
          const project = await developerConsole.getProject(adcProjectId);
          if (project) {
            adcProjectName = project.title || project.name;
          }

          // Fetch workspace name if we have workspaceId
          if (adcWorkspaceId) {
            const workspaces = await developerConsole.listWorkspaces(adcProjectId);
            if (workspaces) {
              const workspace = workspaces.find((w) => w.id === adcWorkspaceId);
              if (workspace) {
                adcWorkspaceName = workspace.name;
              }
            }
          }
          this.spinnerStop();
        } catch (error) {
          this.spinnerStop();
          adcFetchFailed = true;
          adcError = error.message;
        }
      }

      console.log(`Organization ID:        ${orgId ? chalk.green(orgId) : chalk.red('Not set')}`);
      console.log(
        `Program ID:             ${programId ? chalk.green(programId) : chalk.red('Not set')}`
      );
      if (cloudManagerFetchFailed) {
        console.log(`Program Name:           ${chalk.yellow('Failed to load')}`);
      } else if (programName) {
        console.log(`Program Name:           ${chalk.green(programName)}`);
      }
      console.log(
        `Environment ID:         ${environmentId ? chalk.green(environmentId) : chalk.red('Not set')}`
      );
      if (cloudManagerFetchFailed && environmentId) {
        console.log(`Environment Name:       ${chalk.yellow('Failed to load')}`);
      } else if (environmentName) {
        console.log(`Environment Name:       ${chalk.green(environmentName)}`);
      }
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
        if (adcFetchFailed) {
          console.log(`  Project Name:         ${chalk.yellow('Failed to load')}`);
        } else if (adcProjectName) {
          console.log(`  Project Name:         ${chalk.green(adcProjectName)}`);
        }
        console.log(
          `  Workspace ID:         ${adcWorkspaceId ? chalk.green(adcWorkspaceId) : chalk.red('Not set')}`
        );
        if (adcFetchFailed && adcWorkspaceId) {
          console.log(`  Workspace Name:       ${chalk.yellow('Failed to load')}`);
        } else if (adcWorkspaceName) {
          console.log(`  Workspace Name:       ${chalk.green(adcWorkspaceName)}`);
        }

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

      // Display warnings for failed API calls
      if (cloudManagerFetchFailed) {
        console.log(
          chalk.yellow(
            `\nWarning: Failed to load Cloud Manager program/environment names: ${cloudManagerError}`
          )
        );
      }
      if (adcFetchFailed) {
        console.log(
          chalk.yellow(
            `\nWarning: Failed to load Adobe Developer Console project/workspace names: ${adcError}`
          )
        );
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
            let tokenType = 'environment variable';

            if (!accessToken) {
              const adcConfigured = Config.get(this.CONFIG_ADC_CONFIGURED);

              if (adcConfigured) {
                try {
                  const adcToken = await this.getAdcToken();
                  if (adcToken) {
                    accessToken = adcToken.accessToken;
                    tokenType = 'ADC OAuth';
                  } else {
                    console.log(
                      `API Status:             ${chalk.red('✗ ADC token retrieval failed')}`
                    );
                    console.log(chalk.red('\nADC Configuration Error:'));
                    console.log(
                      chalk.red('  Failed to get ADC token - getAdcToken() returned null/undefined')
                    );
                    console.log(chalk.yellow('\nDebugging Information:'));
                    console.log(`  ADC Org ID:           ${adcOrgId || chalk.red('Not set')}`);
                    console.log(`  ADC Project ID:       ${adcProjectId || chalk.red('Not set')}`);
                    console.log(
                      `  ADC Workspace ID:     ${adcWorkspaceId || chalk.red('Not set')}`
                    );
                    console.log(chalk.yellow('\nSuggested Actions:'));
                    console.log(
                      chalk.yellow(
                        '  1. Run "aio aem edge-functions setup" to reconfigure ADC integration'
                      )
                    );
                    console.log(
                      chalk.yellow(
                        '  2. Verify your ADC project has the required credentials configured'
                      )
                    );
                    console.log(
                      chalk.yellow('  3. Check that your ADC project is properly set up')
                    );
                    return;
                  }
                } catch (error) {
                  console.log(
                    `API Status:             ${chalk.red('✗ ADC token retrieval failed')}`
                  );
                  console.log(chalk.red('\nADC Configuration Error:'));
                  console.log(chalk.red(`  ${error.message}`));
                  console.log(chalk.yellow('\nDebugging Information:'));
                  console.log(`  ADC Org ID:           ${adcOrgId || chalk.red('Not set')}`);
                  console.log(`  ADC Project ID:       ${adcProjectId || chalk.red('Not set')}`);
                  console.log(`  ADC Workspace ID:     ${adcWorkspaceId || chalk.red('Not set')}`);
                  if (error.stack) {
                    console.log(chalk.gray('\nStack Trace:'));
                    console.log(chalk.gray(error.stack));
                  }
                  console.log(chalk.yellow('\nSuggested Actions:'));
                  console.log(
                    chalk.yellow(
                      '  1. Run "aio aem edge-functions setup" to reconfigure ADC integration'
                    )
                  );
                  console.log(
                    chalk.yellow(
                      '  2. Verify your ADC project has the required credentials configured'
                    )
                  );
                  console.log(chalk.yellow('  3. Check that your ADC project is properly set up'));
                  return;
                }
              } else {
                // No ADC configured, use IMS token
                accessToken = (await this.getTokenAndKey())?.accessToken;
                tokenType = 'IMS';
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
              console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
            } else if (response.status === 401 || response.status === 403) {
              console.log(
                `API Status:             ${chalk.red('✗ Authentication failed')} (HTTP ${response.status})`
              );
              console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
              console.log(
                chalk.yellow(
                  'Token may be expired or invalid. Try running setup again or check your IMS context.'
                )
              );
            } else {
              console.log(
                `API Status:             ${chalk.yellow('⚠ Unexpected response')} (HTTP ${response.status})`
              );
              console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
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
