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
const { version } = require('../../../../package.json');

const TOPIC = 'aem:edge-functions';

class HelpCommand extends BaseCommand {
  static description = 'Display help for AEM Edge Functions commands.';

  async run() {
    const commands = this.config.commands
      .filter((cmd) => cmd.id.startsWith(TOPIC + ':') && cmd.id !== this.id)
      .sort((a, b) => a.id.localeCompare(b.id));

    const nameWidth =
      Math.max(...commands.map((cmd) => cmd.id.replace(TOPIC + ':', '').length)) + 2;

    const section = (title) => console.log(chalk.bold(title));
    const cmd$ = (line) => `  ${chalk.gray('$')} ${chalk.cyan(line)}`;

    console.log(chalk.bold(`\nAEM Edge Functions Plugin v${version}\n`));

    section('USAGE');
    console.log(cmd$('aio aem edge-functions <command>'));

    console.log(`\n`);
    section('COMMANDS');
    for (const cmd of commands) {
      const name = cmd.id.replace(TOPIC + ':', '');
      console.log(`  ${chalk.cyan(name.padEnd(nameWidth))}${chalk.dim(cmd.description || '')}`);
    }

    console.log(`\n`);
    section('EXAMPLES');

    console.log(`\n  ${chalk.bold('1. First-time setup')}`);
    console.log(chalk.dim('     Configure your Cloud Manager environment and ADC credentials'));
    console.log(cmd$('aio aem edge-functions setup'));

    console.log(`\n  ${chalk.bold('2. Local development')}`);
    console.log(chalk.dim('     Serve your function locally and watch for file changes'));
    console.log(cmd$('aio aem edge-functions serve --watch'));

    console.log(`\n  ${chalk.bold('3. List configured functions')}`);
    console.log(chalk.dim('     Show all Edge Functions available in your environment'));
    console.log(cmd$('aio aem edge-functions list'));

    console.log(`\n  ${chalk.bold('4. Build and deploy')}`);
    console.log(chalk.dim('     Package your code and push it to a named edge function'));
    console.log(cmd$('aio aem edge-functions build'));
    console.log(cmd$('aio aem edge-functions deploy my-function'));

    console.log(`\n  ${chalk.bold('5. Remote debugging')}`);
    console.log(chalk.dim('     Stream live logs from a deployed edge function'));
    console.log(cmd$('aio aem edge-functions tail-logs my-function'));

    console.log('');
  }
}

module.exports = HelpCommand;
