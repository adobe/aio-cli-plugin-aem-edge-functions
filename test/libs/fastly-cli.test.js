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

const assert = require('assert');
const FastlyCli = require('../../src/libs/fastly-cli');

describe('FastlyCli', function () {
  describe('#ensureServiceIdIsSafe', function () {
    it('should not throw an error if the service id is safe', function () {
      const fastlyCli = new FastlyCli();
      fastlyCli.ensureServiceIdIsSafe('compute-pXXXXX-eYYYYY-my-service');
      assert.ok(true);
    });

    it('should throw an error if the service id is not safe', function () {
      const fastlyCli = new FastlyCli();
      assert.throws(function () {
        fastlyCli.ensureServiceIdIsSafe('!xyz!');
      }, Error);
    });
  });
});
