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
const chalk = require('chalk');
const { Flags } = require('@oclif/core');
const { Cloudmanager } = require('../../../libs/cloudmanager');
const { DeveloperConsole } = require('../../../libs/developer-console');

class InfoCommand extends BaseCommand {
  static description = 'Display current AEM Edge Functions configuration.';
  static flags = {
    debug: Flags.boolean({
      char: 'd',
      description: 'Show detailed API endpoint information',
      default: false
    }),
    batch: Flags.boolean({
      char: 'b',
      description: 'Skip steps that require login or manual intervention',
      default: false
    })
  };

  async run() {
    try {
      console.log(chalk.bold('\nCurrent AEM Edge Functions Configuration:\n'));

      const orgId = this.getConfig(this.CONFIG_ORG);
      const programId = this.getConfig(this.CONFIG_PROGRAM);
      const environmentId = this.getConfig(this.CONFIG_ENVIRONMENT);
      const edgeDelivery = this.getConfig(this.CONFIG_EDGE_DELIVERY);
      const siteDomain = this.getConfig(this.CONFIG_SITE_DOMAIN);
      const adcOrgId = this.getConfig(this.CONFIG_ADC_ORG);
      const adcProjectId = this.getConfig(this.CONFIG_ADC_PROJECT);
      const adcWorkspaceId = this.getConfig(this.CONFIG_ADC_WORKSPACE);

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
      if (orgId && programId && !this.flags.batch) {
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
      if (adcOrgId && adcProjectId && !this.flags.batch) {
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

      if (orgId) {
        console.log(`Organization ID:        ${chalk.green(orgId)}`);
      }
      console.log(
        `Program ID:             ${programId ? chalk.green(programId) : chalk.red('Not set')}`
      );
      if (cloudManagerFetchFailed) {
        console.log(`Program Name:           ${chalk.yellow('Failed to load')}`);
      } else if (programName) {
        console.log(`Program Name:           ${chalk.green(programName)}`);
      }
      console.log(
        `Edge Delivery:          ${edgeDelivery !== undefined ? (edgeDelivery ? chalk.green('Yes') : chalk.green('No')) : chalk.red('Not set')}`
      );
      if (!edgeDelivery || (edgeDelivery && environmentId)) {
        console.log(
          `Environment ID:         ${environmentId ? chalk.green(environmentId) : chalk.red('Not set')}`
        );
      }
      if (cloudManagerFetchFailed && environmentId) {
        console.log(`Environment Name:       ${chalk.yellow('Failed to load')}`);
      } else if (environmentName) {
        console.log(`Environment Name:       ${chalk.green(environmentName)}`);
      }
      if (edgeDelivery || (!edgeDelivery && siteDomain)) {
        console.log(
          `Site Domain:            ${siteDomain ? chalk.green(siteDomain) : chalk.red('Not set')}`
        );
      }

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
        console.log(`\nTimestamp (UTC):         ${chalk.cyan(new Date().toISOString())}`);

        const apiEndpoint = this.getApiBasePath() ? this.getApiBasePath() : null;
        const adcClientId = this.getConfig(this.CONFIG_ADC_CLIENT_ID);
        const adcClientSecret = this.getConfig(this.CONFIG_ADC_CLIENT_SECRET);
        const adcScopes = this.getConfig(this.CONFIG_ADC_SCOPES);

        console.log(chalk.bold('\nActive Environment Variables:'));
        const envVars = [
          'AEM_EDGE_FUNCTIONS_ORG_ID',
          'AEM_EDGE_FUNCTIONS_PROGRAM_ID',
          'AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID',
          'AEM_EDGE_FUNCTIONS_EDGE_DELIVERY',
          'AEM_EDGE_FUNCTIONS_SITE_DOMAIN',
          'AEM_EDGE_FUNCTIONS_ADC_CONFIG',
          'AEM_EDGE_FUNCTIONS_ADC_CONFIGURED',
          'AEM_EDGE_FUNCTIONS_ADC_ORG_ID',
          'AEM_EDGE_FUNCTIONS_ADC_PROJECT_ID',
          'AEM_EDGE_FUNCTIONS_ADC_WORKSPACE_ID',
          'AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID',
          'AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET',
          'AEM_EDGE_FUNCTIONS_ADC_SCOPES',
          'AEM_EDGE_FUNCTIONS_TOKEN',
          'AEM_EDGE_FUNCTIONS_API_ENDPOINT'
        ];
        const activeEnvVars = envVars.filter((v) => process.env[v] !== undefined);
        if (activeEnvVars.length > 0) {
          for (const v of activeEnvVars) {
            const isSecret =
              v.includes('SECRET') || v.includes('TOKEN') || v === 'AEM_EDGE_FUNCTIONS_ADC_CONFIG';
            const val = isSecret ? chalk.green('Set') : chalk.green(process.env[v]);
            console.log(`  ${v}=${val}`);
          }
        } else {
          console.log(`  ${chalk.gray('None')}`);
        }

        console.log(
          `\nAPI Endpoint:           ${apiEndpoint ? chalk.cyan(apiEndpoint) : chalk.red('Not available (missing configuration)')}`
        );

        if (this.getConfig(this.CONFIG_ADC_CONFIGURED)) {
          console.log(chalk.bold('\nADC Credentials:'));
          console.log(
            `  Client ID:            ${adcClientId ? chalk.green(adcClientId) : chalk.red('Not set')}`
          );
          console.log(
            `  Client Secret:        ${adcClientSecret ? chalk.green('Set') : chalk.red('Not set')}`
          );
          console.log(
            `  Scopes:               ${adcScopes ? chalk.green(adcScopes) : chalk.red('Not set')}`
          );
        }

        // Test API connectivity and token validity
        if (apiEndpoint) {
          console.log(chalk.bold('\nTesting API connectivity...'));
          try {
            const { createFetch } = require('@adobe/aio-lib-core-networking');
            const fetch = createFetch();

            let accessToken = process.env.AEM_EDGE_FUNCTIONS_TOKEN;
            let tokenType = 'environment variable';

            if (!accessToken) {
              const adcConfigured = this.getConfig(this.CONFIG_ADC_CONFIGURED);
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
                    console.log(
                      chalk.red(
                        '  getAdcToken() returned null — check Client ID, Secret and Scopes above.'
                      )
                    );
                    return;
                  }
                } catch (error) {
                  console.log(
                    `API Status:             ${chalk.red('✗ ADC token retrieval failed')}`
                  );
                  console.log(chalk.red(`  ${error.message}`));
                  return;
                }
              } else if (!this.flags.batch) {
                accessToken = (await this.getTokenAndKey())?.accessToken;
                tokenType = 'IMS';
              }
            }

            if (accessToken) {
              const response = await fetch(apiEndpoint, {
                method: 'GET',
                headers: { Authorization: `Bearer ${accessToken}` }
              });

              if (response.ok) {
                console.log(
                  `API Status:             ${chalk.green('✓ Connected')} (HTTP ${response.status})`
                );
                console.log(`Token Type:             ${chalk.cyan(tokenType)}`);

                let body;
                try {
                  body = await response.json();
                } catch {
                  body = null;
                }

                if (body) {
                  const isEdgeDelivery =
                    this.getConfig(this.CONFIG_EDGE_DELIVERY) ||
                    this.getConfig(this.CONFIG_EDGE_DELIVERY_LEGACY);
                  const expectedKind = isEdgeDelivery ? 'adobemanagedcdn' : 'aemcs';

                  const programMatch = String(body.programId) === String(programId);
                  const envMatch =
                    !environmentId || String(body.environmentId) === String(environmentId);
                  const kindMatch = !body.bucketType || body.bucketType === expectedKind;

                  console.log(
                    `  Program ID:           ${programMatch ? chalk.green(`✓ ${body.programId}`) : chalk.red(`✗ ${body.programId} (expected ${programId})`)}`
                  );
                  if (body.environmentId !== undefined) {
                    console.log(
                      `  Environment ID:       ${envMatch ? chalk.green(`✓ ${body.environmentId}`) : chalk.red(`✗ ${body.environmentId} (expected ${environmentId})`)}`
                    );
                  }
                  if (body.bucketType !== undefined) {
                    console.log(
                      `  Environment Kind:     ${kindMatch ? chalk.green(`✓ ${body.bucketType}`) : chalk.yellow(`⚠ ${body.bucketType} (expected ${expectedKind})`)}`
                    );
                  }
                }
              } else if (response.status === 401 || response.status === 403) {
                console.log(
                  `API Status:             ${chalk.red('✗ Authentication failed')} (HTTP ${response.status})`
                );
                console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
              } else if (response.status === 404) {
                console.log(
                  `API Status:             ${chalk.red('✗ Endpoint not found')} (HTTP 404)`
                );
                console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
                console.log(
                  chalk.yellow(
                    '  The API endpoint was not found. Check your program/environment configuration.'
                  )
                );
              } else {
                console.log(
                  `API Status:             ${chalk.yellow('⚠ Unexpected response')} (HTTP ${response.status})`
                );
                console.log(`Token Type:             ${chalk.cyan(tokenType)}`);
              }
            } else {
              console.log(`API Status:             ${chalk.red('✗ No access token available')}`);
            }
          } catch (error) {
            console.log(`API Status:             ${chalk.red('✗ Connection failed')}`);
            console.log(chalk.red(`Error: ${error.message}`));
          }
        }
      }
    } catch (err) {
      this.spinnerStop();
      throw err;
    }
  }
}

module.exports = InfoCommand;
