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
const { confirm, input, search } = require('@inquirer/prompts');
const open = require('open');
const chalk = require('chalk');
const { Cloudmanager } = require('../../../libs/cloudmanager');

class SetupCommand extends BaseCommand {
  static description = 'Setup your AEM Edge Functions environment.';

  constructor(argv, config) {
    super(argv, config);
    this.programsCached = [];
    this.environmentsCached = [];
  }

  async run() {
    try {
      console.log(`Setup the CLI configuration necessary to use the Edge Functions commands.`);

      const storeLocal = await confirm({
        message: 'Do you want to store the information you enter in this setup procedure locally?',
        default: true
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
        default:
          Config.get(this.CONFIG_EDGE_DELIVERY) || Config.get(this.CONFIG_EDGE_DELIVERY_LEGACY)
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
      open(this.LINK_ORGID);
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
      default: Config.get(this.CONFIG_ORG),
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
    return Config.get('cloudmanager_orgid') || Config.get('console.org.code');
  }

  getEnvironmentFromConf() {
    const id = Config.get(this.CONFIG_ENVIRONMENT);
    return { prevEnvId: id };
  }

  getProgramFromConf() {
    const id = Config.get(this.CONFIG_PROGRAM);
    return { prevProgramId: id };
  }

  getSiteFromConf() {
    const id = Config.get(this.CONFIG_SITE_DOMAIN) || Config.get(this.CONFIG_SITE_DOMAIN_LEGACY);
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
      default: Config.get(this.CONFIG_PROGRAM),
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
      default: Config.get(this.CONFIG_ENVIRONMENT),
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
      default: Config.get(this.CONFIG_SITE_DOMAIN) || 'www.yourdomain.com',
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
}

module.exports = SetupCommand;
