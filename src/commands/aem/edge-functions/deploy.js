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
const { Args } = require('@oclif/core');

class DeployCommand extends BaseCommand {
  static description = 'Deploy your code to your AEM edge function.';
  static args = {
    serviceId: Args.string({
      description: 'AEM Edge Function name (e.g. my-service)',
      required: true
    })
  };

  async run() {
    const fastly = await this.getFastlyCli();
    await fastly.deploy(this.args.serviceId);
  }
}

module.exports = DeployCommand;
