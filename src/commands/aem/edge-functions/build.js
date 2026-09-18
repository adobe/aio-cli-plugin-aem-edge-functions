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
const FastlyCli = require('../../../libs/fastly-cli');
const { Flags } = require('@oclif/core');

class BuildCommand extends BaseCommand {
  static description = 'Build edge function package.';

  static flags = {
    aot: Flags.boolean({
      description:
        'Build with ahead-of-time (AOT) compilation (--enable-aot) for faster runtime performance. ' +
        'Builds in a throwaway temporary directory, leaving the project (including fastly.toml) ' +
        'untouched. Opt-in: produces a larger package and a slower build.',
      default: false
    }),
    'aot-in-place': Flags.boolean({
      description:
        'AOT build that modifies fastly.toml in place (original backed up to fastly.toml.bak) ' +
        'instead of using a temporary directory. Implies --aot. The AOT build script is left in ' +
        'fastly.toml; restore the .bak to revert.',
      default: false
    })
  };

  async run() {
    const fastly = new FastlyCli();
    const inPlace = this.flags['aot-in-place'];
    await fastly.build({ aot: this.flags.aot || inPlace, aotInPlace: inPlace });
  }
}

module.exports = BuildCommand;
