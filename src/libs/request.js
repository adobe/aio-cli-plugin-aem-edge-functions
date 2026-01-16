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

const { createFetch } = require('@adobe/aio-lib-core-networking');
const FormData = require('form-data');
const fetch = createFetch();

class Request {
  /**
   * Initializes a Request object and returns it.
   *
   * @param {string} url the base URL to access the API
   * @param {object} headers headers to always send with this client
   */
  constructor(url, headers = {}) {
    this._baseUrl = url;
    this._headers = headers;
  }

  async get(path, body) {
    return this.request('get', path, body);
  }

  async post(path, body) {
    return this.request('post', path, body);
  }

  async put(path, body) {
    return this.request('put', path, body);
  }

  async options(path, body) {
    return this.request('options', path, body);
  }

  async patch(path, body) {
    return this.request('patch', path, body);
  }

  async delete(path) {
    return this.request('delete', path);
  }

  async request(method, path, body) {
    const url = `${this._baseUrl}${path}`;
    let headers = { ...this._headers };
    const options = {
      method,
      headers
    };

    if (body instanceof FormData) {
      options.body = body;
    } else if (body) {
      options.body = JSON.stringify(body);
      headers['content-type'] = 'application/json';
    }
    return fetch(url, options);
  }
}

module.exports = {
  Request: Request
};
