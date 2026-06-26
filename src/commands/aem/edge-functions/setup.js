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
const { Ims } = require('@adobe/aio-lib-ims');
const { confirm, input, password, search } = require('@inquirer/prompts');
const chalk = require('chalk');
const { Cloudmanager } = require('../../../libs/cloudmanager');
const { DeveloperConsole } = require('../../../libs/developer-console');
const { Flags } = require('@oclif/core');
const fs = require('fs');
const path = require('path');

class SetupCommand extends BaseCommand {
  static description = 'Setup your AEM Edge Functions environment.';

  static flags = {
    'adc-config': Flags.string({
      char: 'c',
      description: 'Path to an ADC project JSON file downloaded from Adobe Developer Console.',
      required: false
    })
  };

  constructor(argv, config) {
    super(argv, config);
    this.programsCached = [];
    this.environmentsCached = [];
    this.projectsCached = [];
    this.workspacesCached = [];
  }

  async run() {
    try {
      console.log(`Setup the CLI configuration necessary to use the Edge Functions commands.`);

      // Check if a local .aio file exists to determine default for storeLocal
      const localConfigPath = path.join(process.cwd(), '.aio');
      const hasLocalConfig = fs.existsSync(localConfigPath);

      const storeLocal = await confirm({
        message: 'Do you want to store the information you enter in this setup procedure locally?',
        default: hasLocalConfig
      });

      const orgId = await this.getOrgId();
      Config.set(this.CONFIG_ORG, orgId, storeLocal);

      let selectedEnvironmentId = null;
      let selectedProgramId = await this.getProgramId();
      if (!selectedProgramId) {
        return;
      }

      let edgeDelivery = await confirm({
        message: 'Do you want to use an Edge Delivery site?',
        default: this.getConfig(this.CONFIG_EDGE_DELIVERY)
      });

      if (edgeDelivery) {
        selectedEnvironmentId = await this.getSiteId(selectedProgramId);
        if (selectedEnvironmentId === null) {
          console.log(chalk.red('Setup cannot continue without site information.'));
          return;
        }
      } else {
        selectedEnvironmentId = await this.getEnvironmentId(selectedProgramId);
        if (selectedEnvironmentId === null) {
          console.log(chalk.red('Setup cannot continue without environment information.'));
          return;
        }
      }

      const selectedProgramName = this.programsCached.find((e) => e.id === selectedProgramId)?.name;
      const selectedEnvironmentName = edgeDelivery
        ? this.sitesCached.find((e) => e.id === selectedEnvironmentId)?.name
        : this.environmentsCached.find((e) => e.id === selectedEnvironmentId)?.name;

      console.log(
        chalk.green(
          `Selected program ${selectedProgramId} and ${edgeDelivery ? 'site' : 'environment'} ${selectedEnvironmentId}: ${selectedProgramName} - ${selectedEnvironmentName}`
        )
      );

      Config.set(this.CONFIG_PROGRAM, selectedProgramId, storeLocal);
      if (storeLocal && Config.get('cloudmanager_programname')) {
        Config.delete('cloudmanager_programname', storeLocal);
      }
      Config.set(this.CONFIG_EDGE_DELIVERY, edgeDelivery, storeLocal);

      // For Edge Delivery, store the site domain separately
      if (edgeDelivery) {
        Config.set(this.CONFIG_SITE_DOMAIN, selectedEnvironmentName, storeLocal);
        if (storeLocal && Config.get(this.CONFIG_ENVIRONMENT)) {
          Config.delete(this.CONFIG_ENVIRONMENT, storeLocal);
        }
      } else {
        Config.set(this.CONFIG_ENVIRONMENT, selectedEnvironmentId, storeLocal);
      }

      if (storeLocal && Config.get(this.CONFIG_SITE_DOMAIN_LEGACY)) {
        Config.delete(this.CONFIG_SITE_DOMAIN_LEGACY, storeLocal);
      }

      // Adobe Developer Console integration
      const adcProjectData = this.readAdcProjectFile();

      if (adcProjectData) {
        console.log(chalk.bold('\nADC config file loaded:'));
        if (adcProjectData.orgId)
          console.log(`  Org ID:       ${chalk.green(adcProjectData.orgId)}`);
        if (adcProjectData.projectId)
          console.log(`  Project ID:   ${chalk.green(adcProjectData.projectId)}`);
        if (adcProjectData.workspaceId)
          console.log(`  Workspace ID: ${chalk.green(adcProjectData.workspaceId)}`);
        console.log(`  Client ID:    ${chalk.green(adcProjectData.clientId)}`);
        console.log(
          `  Client Secret:${adcProjectData.clientSecret ? chalk.green(' Set') : chalk.yellow(' Not present')}`
        );
        console.log(
          `  Scopes:       ${adcProjectData.scopes.length ? chalk.green(adcProjectData.scopes.join(', ')) : chalk.yellow('None')}`
        );
        console.log(chalk.green('✓ ADC credentials successfully loaded from config file.'));
      }

      if (adcProjectData && adcProjectData.format === 'full') {
        // Full project format — apply everything from file without prompting
        const {
          orgId: adcOrgId,
          projectId,
          workspaceId,
          clientId,
          clientSecret,
          scopes
        } = adcProjectData;
        if (adcOrgId) Config.set(this.CONFIG_ADC_ORG, adcOrgId, storeLocal);
        Config.set(this.CONFIG_ADC_CONFIGURED, true, storeLocal);
        Config.set(this.CONFIG_ADC_PROJECT, projectId, storeLocal);
        Config.set(this.CONFIG_ADC_WORKSPACE, workspaceId, storeLocal);
        Config.set(this.CONFIG_ADC_CLIENT_ID, clientId, storeLocal);
        Config.set(this.CONFIG_ADC_SCOPES, scopes.join(','), storeLocal);
        if (clientSecret) {
          await this.storeClientSecret(clientSecret, storeLocal);
          console.log(chalk.green('✓ ADC configuration loaded from config file.'));
        } else {
          console.log(
            chalk.green('✓ ADC configuration loaded from config file (no client secret in file).')
          );
          console.log(
            chalk.yellow(
              `  Set the client secret via: export AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET="<secret>"`
            )
          );
        }
      } else if (adcProjectData && adcProjectData.format === 'credentials') {
        // Credentials-only format — client ID is known, no need to select project/workspace
        const { orgId: adcOrgId, clientId, clientSecret, scopes } = adcProjectData;
        if (adcOrgId) Config.set(this.CONFIG_ADC_ORG, adcOrgId, storeLocal);
        Config.set(this.CONFIG_ADC_CONFIGURED, true, storeLocal);
        Config.set(this.CONFIG_ADC_CLIENT_ID, clientId, storeLocal);
        Config.set(this.CONFIG_ADC_SCOPES, scopes.join(','), storeLocal);
        if (clientSecret) {
          await this.storeClientSecret(clientSecret, storeLocal);
          console.log(chalk.green('✓ ADC configuration saved.'));
        } else {
          console.log(chalk.green('✓ ADC configuration saved (no client secret in file).'));
          console.log(
            chalk.yellow(
              `  Set the client secret via: export AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET="<secret>"`
            )
          );
        }
      } else {
        const useADC = await confirm({
          message:
            'Do you want to configure Adobe Developer Console (ADC) project for API credentials?',
          default: !!this.getConfig(this.CONFIG_ADC_PROJECT)
        });

        if (useADC) {
          const existingClientId = this.getConfig(this.CONFIG_ADC_CLIENT_ID);
          let doFullConfig = !existingClientId;

          if (existingClientId) {
            console.log(chalk.green(`Existing ADC client ID: ${existingClientId}`));
            const reconfigure = await confirm({
              message:
                'An ADC configuration already exists. Do you want to re-configure it (select a different project/workspace)?',
              default: false
            });

            if (reconfigure) {
              doFullConfig = true;
            } else {
              await this.configureClientSecret(null, null, null, storeLocal);
            }
          }

          if (doFullConfig) {
            const selectedProjectId = await this.getADCProjectId();
            if (selectedProjectId) {
              const selectedWorkspaceId = await this.getADCWorkspaceId(selectedProjectId);

              const selectedProjectTitle = this.projectsCached.find(
                (p) => p.id === selectedProjectId
              )?.title;
              const selectedWorkspaceName = this.workspacesCached.find(
                (w) => w.id === selectedWorkspaceId
              )?.name;

              if (selectedProjectId && selectedWorkspaceId) {
                console.log(
                  chalk.green(
                    `Selected ADC project ${selectedProjectId} and workspace ${selectedWorkspaceId}: ${selectedProjectTitle} - ${selectedWorkspaceName}`
                  )
                );

                const adcOrgId = this._developerConsole
                  ? await this._developerConsole._getAdcOrgId()
                  : null;

                if (adcOrgId) {
                  Config.set(this.CONFIG_ADC_ORG, adcOrgId, storeLocal);
                }

                Config.set(this.CONFIG_ADC_CONFIGURED, true, storeLocal);
                Config.set(this.CONFIG_ADC_PROJECT, selectedProjectId, storeLocal);
                Config.set(this.CONFIG_ADC_WORKSPACE, selectedWorkspaceId, storeLocal);

                const credentials = await this.getCredentialsAndScopes(
                  selectedProjectId,
                  selectedWorkspaceId,
                  storeLocal
                );

                if (credentials) {
                  await this.configureClientSecret(
                    selectedProjectId,
                    selectedWorkspaceId,
                    credentials.credentialId,
                    storeLocal
                  );
                } else {
                  console.log(
                    chalk.yellow(
                      'ADC configuration saved, but credentials could not be retrieved. You can run setup again to configure the client secret.'
                    )
                  );
                }
              }
            }
          }
        } else {
          // Check if ADC configuration exists
          const hasAdcConfig = this.getConfig(this.CONFIG_ADC_CONFIGURED);

          if (hasAdcConfig) {
            const deleteConfig = await confirm({
              message: 'Existing ADC configuration found. Do you want to delete it?',
              default: false
            });

            if (deleteConfig) {
              Config.delete(this.CONFIG_ADC_CONFIGURED, storeLocal);
              Config.delete(this.CONFIG_ADC_ORG, storeLocal);
              Config.delete(this.CONFIG_ADC_PROJECT, storeLocal);
              Config.delete(this.CONFIG_ADC_WORKSPACE, storeLocal);
              Config.delete(this.CONFIG_ADC_CLIENT_ID, storeLocal);
              Config.delete(this.CONFIG_ADC_CLIENT_SECRET, storeLocal);
              Config.delete(this.CONFIG_ADC_SCOPES, storeLocal);
              console.log(chalk.green('✓ ADC configuration deleted.'));
            } else {
              console.log(
                chalk.yellow(
                  'ADC configuration kept. You can delete it later by running setup again.'
                )
              );
            }
          }
        }
      } // end: no adcProjectData

      console.log(
        `Setup complete. Use 'aio help aem edge-functions' to see the available commands.`
      );
    } catch (err) {
      this.spinnerStop();
      throw err;
    }
  }

  async getOrgId() {
    let selectedOrg = null;
    const organizations = await this.getOrganizationsFromToken();
    if (!organizations) {
      return null;
    }
    const nrOfOrganizations = Object.keys(organizations).length;

    if (nrOfOrganizations === 0) {
      selectedOrg = await this.fallbackToManualOrganizationId();
    } else if (nrOfOrganizations === 1) {
      const orgName = Object.keys(organizations)[0];
      const orgId = organizations[orgName];
      console.log(`Selected only organization: ${orgName} - ${orgId}`);
      return orgId;
    } else {
      selectedOrg = await this.chooseOrganizationFromList(organizations);
    }
    console.log(`Selected organization: ${selectedOrg}`);
    return selectedOrg;
  }

  async getOrganizationsFromToken() {
    try {
      const { accessToken } = await this.getTokenAndKey();
      const organizations = await this.getOrganizationsFromIms(accessToken);
      return organizations.reduce((map, org) => {
        map[org.orgName] = org.orgRef.ident + '@' + org.orgRef.authSrc;
        return map;
      }, {});
    } catch (err) {
      if (err.code === 'CONTEXT_NOT_CONFIGURED') {
        console.log('No IMS context found. Please run `aio login` first.');
      }
      return null;
    }
  }

  async getOrganizationsFromIms(accessToken) {
    const { ims } = await Ims.fromToken(accessToken);
    return await ims.getOrganizations(accessToken);
  }

  async fallbackToManualOrganizationId() {
    console.log(chalk.yellow('Could not find an organization ID automatically.'));
    console.log(chalk.yellow('Please enter your organization ID manually.'));
    console.log(chalk.gray(`See ${this.LINK_ORGID}`));
    const openLink = await confirm({
      message: 'Would you like to open the link in your browser?',
      default: false
    });
    if (openLink) {
      const open = (await import('open')).default;
      await open(this.LINK_ORGID);
    }
    const manualOrgId = await input({
      message: 'Manual organization ID:'
    });
    return manualOrgId;
  }

  async chooseOrganizationFromList(organizations) {
    const orgChoices = Object.entries(organizations).map(([name, id]) => ({
      name: `${name} - ${id}`,
      value: id
    }));
    const organizationId = await search({
      message: 'Please choose an organization (type to filter):',
      default: this.getConfig(this.CONFIG_ORG),
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return orgChoices.filter((choice) =>
          choice.name.toLowerCase().includes(input.toLowerCase())
        );
      }
    });
    return organizationId;
  }

  async getProgramId() {
    if (!this.programsCached || this.programsCached?.length === 0) {
      this.spinnerStart('retrieving programs of your organization');
      try {
        this.programsCached = await this.withCloudmanager((cloudmanager) =>
          cloudmanager.listProgramsIdAndName()
        );
      } catch (err) {
        this.spinnerStop();
        console.log(chalk.yellow('Failed to retrieve programs from Cloud Manager API.'));
        console.log(chalk.yellow('Error: ' + err.message));
        return await this.fallbackToManualProgramInput();
      }
      this.spinnerStop();

      if (!this.programsCached || this.programsCached.length === 0) {
        console.log(chalk.yellow('No programs found for the selected organization.'));
        return await this.fallbackToManualProgramInput();
      }
    }

    if (this.programsCached.length === 1) {
      console.log(`Selected only program: ${this.programsCached[0].id}`);
      return this.programsCached[0].id;
    }

    const choices = this.programsCached.map((program) => ({
      name: `${program.id} - ${program.name}`,
      value: program.id
    }));

    const { prevProgramId } = this.getProgramFromConf();

    const selectedProgram = await search({
      message: 'Please choose a program (type to filter):',
      default: prevProgramId,
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return choices.filter((choice) => choice.name.toLowerCase().includes(input.toLowerCase()));
      }
    });

    return selectedProgram;
  }

  async withCloudmanager(fn) {
    if (!this._cloudmanager) {
      const { accessToken, apiKey, data } = await this.getTokenAndKey();
      const cloudManagerUrl = this.getBaseUrl(data?.env === 'stage');
      const orgId = this.getCliOrgId();
      if (!orgId) {
        throw new Error('Organization ID is not set. Please run the setup command to set it.');
      }
      this._cloudmanager = new Cloudmanager(`${cloudManagerUrl}/api`, apiKey, orgId, accessToken);
    }
    return fn(this._cloudmanager);
  }

  getCliOrgId() {
    return this.getConfig(this.CONFIG_ORG) || Config.get('console.org.code');
  }

  getEnvironmentFromConf() {
    const id = this.getConfig(this.CONFIG_ENVIRONMENT);
    return { prevEnvId: id };
  }

  getProgramFromConf() {
    const id = this.getConfig(this.CONFIG_PROGRAM);
    return { prevProgramId: id };
  }

  getSiteFromConf() {
    const id =
      this.getConfig(this.CONFIG_SITE_DOMAIN) || this.getConfig(this.CONFIG_SITE_DOMAIN_LEGACY);
    return { prevSiteId: id };
  }

  async getEnvironmentId(selectedProgram) {
    this.spinnerStart(`retrieving environments of program ${selectedProgram}`);
    try {
      this.environmentsCached = await this.withCloudmanager((cloudmanager) =>
        cloudmanager.listEnvironmentsIdAndName(selectedProgram)
      );
    } catch (err) {
      this.spinnerStop();
      console.log(chalk.yellow('Failed to retrieve environments from Cloud Manager API.'));
      console.log(chalk.yellow('Error: ' + err.message));
      return await this.fallbackToManualEnvironmentInput(selectedProgram);
    }
    this.spinnerStop();

    if (!this.environmentsCached || this.environmentsCached.length === 0) {
      console.log(chalk.yellow(`No environments found for program ${selectedProgram}`));
      return await this.fallbackToManualEnvironmentInput(selectedProgram);
    }

    if (this.environmentsCached.length === 1) {
      console.log(`Selected only environment: ${this.environmentsCached[0].id}`);
      return this.environmentsCached[0].id;
    }

    const choicesEnv = this.environmentsCached.map((env) => ({
      name: `${env.id} ${env.type} (${env.status}) - ${env.name}`,
      value: env.id
    }));

    const { prevEnvId } = this.getEnvironmentFromConf();

    const selectedEnvironment = await search({
      message: 'Please choose an environment (type to filter):',
      default: prevEnvId,
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return choicesEnv.filter((choice) =>
          choice.name.toLowerCase().includes(input.toLowerCase())
        );
      }
    });
    return selectedEnvironment;
  }

  async getSiteId(selectedProgram) {
    this.spinnerStart(`retrieving sites of program ${selectedProgram}`);
    try {
      this.sitesCached = await this.withCloudmanager((cloudmanager) =>
        cloudmanager.listSitesIdAndName(selectedProgram)
      );
    } catch (err) {
      this.spinnerStop();
      console.log(chalk.yellow('Failed to retrieve sites from Cloud Manager API.'));
      console.log(chalk.yellow('Error: ' + err.message));
      return await this.fallbackToManualSiteInput(selectedProgram);
    }
    this.spinnerStop();

    if (!this.sitesCached || this.sitesCached.length === 0) {
      console.log(chalk.yellow(`No Edge Delivery sites found for program ${selectedProgram}`));
      return await this.fallbackToManualSiteInput(selectedProgram);
    }

    if (this.sitesCached.length === 1) {
      console.log(
        `Selected only Edge Delivery site: ${this.sitesCached[0].id} - ${this.sitesCached[0].name}`
      );
      return this.sitesCached[0].id;
    }

    const choicesEnv = this.sitesCached.map((site) => ({
      name: `${site.id} - ${site.name}`,
      value: site.id
    }));

    const { prevSiteId } = this.getSiteFromConf();

    const selectedSite = await search({
      message: 'Please choose an Edge Delivery site (type to filter):',
      default: prevSiteId,
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return choicesEnv.filter((choice) =>
          choice.name.toLowerCase().includes(input.toLowerCase())
        );
      }
    });
    return selectedSite;
  }

  async fallbackToManualProgramInput() {
    console.log(chalk.yellow('Would you like to enter the program information manually?'));
    const useManual = await confirm({
      message: 'Enter program details manually?',
      default: true
    });

    if (!useManual) {
      console.log(chalk.red('Setup cannot continue without program information.'));
      return null;
    }

    const programId = await input({
      message: 'Enter Program ID:',
      default: this.getConfig(this.CONFIG_PROGRAM),
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Program ID is required';
        }
        return true;
      }
    });

    // Cache the manually entered program
    this.programsCached = [
      {
        id: programId,
        name: programId
      }
    ];

    console.log(chalk.green(`Using manual program: ${programId}`));
    return programId;
  }

  async fallbackToManualEnvironmentInput(selectedProgram) {
    console.log(chalk.yellow('Would you like to enter the environment information manually?'));
    const useManual = await confirm({
      message: 'Enter environment details manually?',
      default: true
    });

    if (!useManual) {
      console.log(chalk.red('Setup cannot continue without environment information.'));
      return null;
    }

    const environmentId = await input({
      message: 'Enter Environment ID:',
      default: this.getConfig(this.CONFIG_ENVIRONMENT),
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Environment ID is required';
        }
        return true;
      }
    });

    // Cache the manually entered environment
    this.environmentsCached = [
      {
        id: environmentId,
        name: environmentId,
        type: 'manual',
        status: 'unknown'
      }
    ];

    console.log(chalk.green(`Using manual environment: ${environmentId}`));
    return environmentId;
  }

  async fallbackToManualSiteInput(selectedProgram) {
    console.log(chalk.yellow('Would you like to enter the site information manually?'));
    const useManual = await confirm({
      message: 'Enter site details manually?',
      default: true
    });

    if (!useManual) {
      console.log(chalk.red('Setup cannot continue without site information.'));
      return null;
    }

    const siteName = await input({
      message: 'Enter Site/Domain Name (e.g., www.yourdomain.com):',
      default: this.getConfig(this.CONFIG_SITE_DOMAIN) || 'www.yourdomain.com',
      validate: (value) => {
        if (!value || value.trim() === '') {
          return 'Site/Domain name is required';
        }
        return true;
      }
    });

    // Cache the manually entered site, using the domain name as both ID and name
    this.sitesCached = [
      {
        id: siteName,
        name: siteName
      }
    ];

    console.log(chalk.green(`Using manual site: ${siteName}`));
    return siteName;
  }

  async withDeveloperConsole(fn) {
    if (!this._developerConsole) {
      const { accessToken, apiKey } = await this.getTokenAndKey();
      const orgId = this.getCliOrgId();
      if (!orgId) {
        throw new Error('Organization ID is not set. Please run the setup command to set it.');
      }
      this._developerConsole = new DeveloperConsole(orgId, apiKey, accessToken);
    }
    return fn(this._developerConsole);
  }

  async getADCProjectId() {
    this.spinnerStart('retrieving Adobe Developer Console projects');
    this.projectsCached = await this.withDeveloperConsole((devConsole) =>
      devConsole.listProjects()
    );
    this.spinnerStop();

    if (!this.projectsCached || this.projectsCached.length === 0) {
      console.log(
        chalk.yellow('No Adobe Developer Console projects found for the selected organization.')
      );
      console.log(chalk.yellow('You can create a project at https://developer.adobe.com/console'));
      return null;
    }

    if (this.projectsCached.length === 1) {
      console.log(
        `Selected only ADC project: ${this.projectsCached[0].id} - ${this.projectsCached[0].title}`
      );
      return this.projectsCached[0].id;
    }

    const choices = this.projectsCached.map((project) => ({
      name: `${project.id} - ${project.title}${project.description ? ' (' + project.description + ')' : ''}`,
      value: project.id
    }));

    const prevProjectId = this.getConfig(this.CONFIG_ADC_PROJECT);

    const selectedProject = await search({
      message: 'Please choose an Adobe Developer Console project (type to filter):',
      default: prevProjectId,
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return choices.filter((choice) => choice.name.toLowerCase().includes(input.toLowerCase()));
      }
    });

    return selectedProject;
  }

  async getADCWorkspaceId(projectId) {
    this.spinnerStart(`retrieving workspaces for project ${projectId}`);
    this.workspacesCached = await this.withDeveloperConsole((devConsole) =>
      devConsole.listWorkspaces(projectId)
    );
    this.spinnerStop();

    if (!this.workspacesCached || this.workspacesCached.length === 0) {
      console.log(chalk.yellow(`No workspaces found for project ${projectId}`));
      console.log(chalk.yellow('Using default production workspace'));
      return 'production';
    }

    if (this.workspacesCached.length === 1) {
      console.log(
        `Selected only workspace: ${this.workspacesCached[0].id} - ${this.workspacesCached[0].name}`
      );
      return this.workspacesCached[0].id;
    }

    const choices = this.workspacesCached.map((workspace) => ({
      name: `${workspace.id} - ${workspace.name}${workspace.description ? ' (' + workspace.description + ')' : ''}`,
      value: workspace.id
    }));

    const prevWorkspaceId = this.getConfig(this.CONFIG_ADC_WORKSPACE);

    const selectedWorkspace = await search({
      message: 'Please choose a workspace (type to filter):',
      default: prevWorkspaceId,
      pageSize: 30,
      source: async (term, opt) => {
        const input = term || '';
        return choices.filter((choice) => choice.name.toLowerCase().includes(input.toLowerCase()));
      }
    });

    return selectedWorkspace;
  }

  async getCredentialsAndScopes(projectId, workspaceId, storeLocal) {
    try {
      this.spinnerStart('retrieving OAuth credentials from Adobe Developer Console');
      // Get OAuth credentials
      const credentials = await this.withDeveloperConsole((devConsole) =>
        devConsole.getCredentials(projectId, workspaceId)
      );

      if (!credentials || !credentials.clientId || !credentials.credentialId) {
        this.spinnerStop();
        console.log(
          chalk.yellow('No OAuth Server-to-Server credential found in the selected workspace.')
        );
        console.log(
          chalk.yellow('Please add an OAuth Server-to-Server credential to your workspace first.')
        );
        return null;
      }

      // Get scopes separately
      const scopes = await this.withDeveloperConsole((devConsole) =>
        devConsole.getCredentialScopes(credentials.credentialId)
      );
      this.spinnerStop();

      // Save client ID and scopes for later use (no ADC API call needed at runtime)
      Config.set(this.CONFIG_ADC_CLIENT_ID, credentials.clientId, storeLocal);
      // Store scopes as comma-separated list
      Config.set(this.CONFIG_ADC_SCOPES, (scopes || []).join(','), storeLocal);
      console.log(
        chalk.green('✓ ADC credentials successfully loaded from Adobe Developer Console.')
      );

      return credentials;
    } catch (error) {
      this.spinnerStop();
      console.log(chalk.yellow(`Failed to retrieve OAuth credentials: ${error.message}`));
      return null;
    }
  }

  async configureClientSecret(projectId, workspaceId, credentialId, storeLocal) {
    try {
      // Check if client secret already exists
      const existingSecret = this.getConfig(this.CONFIG_ADC_CLIENT_SECRET);

      if (existingSecret) {
        const updateSecret = await confirm({
          message: 'A client secret is already configured. Do you want to update it?',
          default: false
        });

        if (!updateSecret) {
          console.log(chalk.green('Keeping existing client secret configuration.'));
          return;
        }
      }

      if (credentialId) {
        // Get credential URL
        this.spinnerStart('retrieving credential URL from Adobe Developer Console');
        const credentialUrl = await this.withDeveloperConsole((devConsole) =>
          devConsole.getCredentialUrl(projectId, workspaceId, credentialId)
        );
        this.spinnerStop();

        console.log(chalk.yellow('\nClient secret is required for API authentication.'));
        console.log(`You need to retrieve the Client Secret from Adobe Developer Console.`);
        console.log(`URL: ${chalk.cyan(credentialUrl)}\n`);

        const shouldOpen = await confirm({
          message: 'Would you like to open this URL in your browser?',
          default: true
        });

        if (shouldOpen) {
          const open = (await import('open')).default;
          await open(credentialUrl);
          console.log(chalk.green('✓ Opened in browser.'));
        }
      }

      console.log('\nPlease copy the Client Secret from the OAuth Server-to-Server credential.');
      const clientSecret = await password({
        message: 'Enter the Client Secret:',
        mask: '*',
        validate: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Client secret is required';
          }
          return true;
        }
      });

      if (!clientSecret) {
        console.log(chalk.yellow('Client secret configuration skipped.'));
        return;
      }

      await this.storeClientSecret(clientSecret, storeLocal);
      console.log(chalk.green('✓ ADC client secret configured.'));
    } catch (error) {
      this.spinnerStop();
      console.log(chalk.yellow(`Failed to configure client secret: ${error.message}`));
    }
  }

  async storeClientSecret(clientSecret, storeLocal) {
    const storeChoices = [
      {
        name: 'Environment variable (AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET) - Recommended',
        value: 'env'
      },
      { name: 'Configuration file (plain text - not recommended)', value: 'config' },
      { name: "Don't store (enter each time)", value: 'none' }
    ];

    console.log('');
    const storeChoice = await search({
      message: 'How would you like to store the client secret?',
      default: 'env',
      source: async (term) => {
        const input = term || '';
        return storeChoices.filter((choice) =>
          choice.name.toLowerCase().includes(input.toLowerCase())
        );
      }
    });

    if (storeChoice === 'config') {
      console.log(
        chalk.yellow(
          '\n⚠️  WARNING: The client secret will be stored as plain text in the configuration file.'
        )
      );
      console.log(chalk.yellow('This is not recommended for production use.\n'));

      const confirmStore = await confirm({
        message: 'Do you want to proceed?',
        default: false
      });

      if (confirmStore) {
        Config.set(this.CONFIG_ADC_CLIENT_SECRET, clientSecret, storeLocal);
        console.log(chalk.green('✓ Client secret saved to configuration file.'));
      } else {
        console.log('Client secret not saved. You will need to enter it each time.');
      }
    } else if (storeChoice === 'env') {
      console.log(chalk.cyan('\nTo set the environment variable, run:'));
      console.log(chalk.white(`  export AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET="${clientSecret}"`));
      console.log(
        chalk.cyan('\nOr add it to your shell profile (~/.zshrc, ~/.bashrc, etc.) to persist it.\n')
      );
    } else {
      console.log('Client secret not saved. You will need to enter it each time.');
    }
  }

  /**
   * Read and parse the ADC config file from the --adc-config flag.
   * Supports both the full ADC project format and the credentials-only format.
   * @returns {Object|null} Parsed ADC credentials or null if flag not provided
   */
  readAdcProjectFile() {
    const filePath = this.flags?.['adc-config'];
    if (!filePath) return null;

    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`ADC config file not found: ${resolved}`);
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    } catch (e) {
      throw new Error(`Failed to parse ADC config file as JSON: ${e.message}`);
    }

    const parsed = this.constructor.parseAdcConfigJson(json);
    if (!parsed) {
      throw new Error(
        'Invalid ADC config file: unrecognized format. ' +
          'Expected a full ADC project JSON or a credentials-only JSON (CLIENT_ID, CLIENT_SECRETS, ORG_ID, SCOPES).'
      );
    }
    return parsed;
  }
}

module.exports = SetupCommand;
