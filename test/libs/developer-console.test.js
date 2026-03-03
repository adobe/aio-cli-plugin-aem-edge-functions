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
const sinon = require('sinon');
const consoleLib = require('@adobe/aio-lib-console');

describe('DeveloperConsole', function () {
  let initStub;
  let mockConsoleClient;
  let DeveloperConsole;

  // Mock organization data based on actual API response structure
  const mockOrganization = {
    id: '123456',
    code: 'MOCK123456789ABCD@AdobeOrg',
    name: 'Test Organization',
    description: null,
    type: 'entp',
    imsType: 'entp',
    roles: [
      {
        principal: 'MOCK123456789ABCD@AdobeOrg:12345678',
        organization: 'MOCK123456789ABCD@AdobeOrg',
        target: 'MOCK123456789ABCD@AdobeOrg',
        named_role: 'org_admin',
        target_type: 'TRG_ORG',
        target_data: {}
      }
    ],
    role: 'ADMIN',
    maxApps: null,
    apps: null,
    authenticatingAccountId: null
  };

  before(function () {
    // Stub the init function before requiring DeveloperConsole
    initStub = sinon.stub(consoleLib, 'init');
    // Now require DeveloperConsole after stubbing
    DeveloperConsole = require('../../src/libs/developer-console').DeveloperConsole;
  });

  after(function () {
    sinon.restore();
  });

  beforeEach(function () {
    // Reset the stub before each test
    initStub.reset();

    // Create fresh mock client for each test
    mockConsoleClient = {
      getOrganizations: sinon.stub(),
      getProjectsForOrg: sinon.stub(),
      getProject: sinon.stub(),
      getWorkspacesForProject: sinon.stub(),
      getCredentials: sinon.stub(),
      getIntegration: sinon.stub()
    };

    // Configure the stub to return the mock client
    initStub.resolves(mockConsoleClient);
  });

  describe('#constructor', function () {
    it('should create a DeveloperConsole instance', function () {
      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      assert.ok(devConsole);
      assert.strictEqual(devConsole.orgId, 'org123');
      assert.strictEqual(devConsole.apiKey, 'apiKey123');
      assert.strictEqual(devConsole.accessToken, 'token123');
    });
  });

  describe('#listProjects', function () {
    it('should return an empty array on error', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));
      mockConsoleClient.getProjectsForOrg.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      const projects = await devConsole.listProjects();
      assert.ok(Array.isArray(projects));
      assert.strictEqual(projects.length, 0);
    });

    it('should return formatted projects on success', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [
          {
            id: '123456',
            code: 'MOCK123456789ABCD@AdobeOrg',
            name: 'Test Organization',
            description: null,
            type: 'entp',
            imsType: 'entp',
            role: 'ADMIN'
          }
        ]
      });
      mockConsoleClient.getProjectsForOrg.resolves({
        body: [
          {
            id: '1111111111111111111',
            name: '123MockProject',
            title: 'Mock Test Project',
            description: 'Test project description',
            type: 'default',
            enabled: true,
            deleted: false,
            org_id: 123456,
            date_created: '2025-12-17T13:50:27Z',
            date_last_modified: '2025-12-18T12:07:45Z',
            date_last_activity: '2026-01-15T13:40:20Z',
            who_created: 'MOCK1234567890ABCD@techacct.adobe.com',
            who_last_modified: 'MOCK1234567890ABCD@techacct.adobe.com',
            notifications_enabled: true
          },
          {
            id: '2222222222222222222',
            name: 'AEMTestProject',
            title: 'AEM Test Environment',
            description: '',
            type: 'default',
            enabled: true,
            deleted: false,
            org_id: 123456,
            date_created: '2026-02-10T15:00:37Z',
            date_last_modified: '2026-02-10T15:00:46Z',
            date_last_activity: '2026-03-02T19:21:11Z',
            who_created: 'MOCKTECHACCT123456@techacct.adobe.com',
            who_last_modified: 'MOCKTECHACCT123456@techacct.adobe.com',
            notifications_enabled: true
          }
        ]
      });

      const devConsole = new DeveloperConsole(
        'MOCK123456789ABCD@AdobeOrg',
        'apiKey123',
        'token123'
      );
      const projects = await devConsole.listProjects();

      assert.ok(Array.isArray(projects));
      assert.strictEqual(projects.length, 2);
      assert.strictEqual(projects[0].id, '1111111111111111111');
      assert.strictEqual(projects[0].name, '123MockProject');
      assert.strictEqual(projects[0].title, 'Mock Test Project');
      assert.strictEqual(projects[1].id, '2222222222222222222');
      assert.strictEqual(projects[1].name, 'AEMTestProject');
    });
  });

  describe('#listWorkspaces', function () {
    it('should return an empty array on error', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));
      mockConsoleClient.getWorkspacesForProject.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      const workspaces = await devConsole.listWorkspaces('project123');
      assert.ok(Array.isArray(workspaces));
      assert.strictEqual(workspaces.length, 0);
    });

    it('should return formatted workspaces on success', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [
          {
            id: '123456',
            code: 'MOCK123456789ABCD@AdobeOrg',
            name: 'Test Organization',
            type: 'entp',
            role: 'ADMIN'
          }
        ]
      });
      mockConsoleClient.getWorkspacesForProject.resolves({
        body: [
          {
            id: '4444444444444444444',
            name: 'Production',
            enabled: true,
            title: 'Production',
            description: 'Project production workspace',
            quota_usage: 'Quota usage for workspace',
            runtime_enabled: false,
            date_created: '2025-12-17T13:50:27Z',
            date_last_modified: '2025-12-17T20:44:28Z',
            date_last_activity: '2026-01-15T13:40:20Z',
            who_created: 'MOCKUSER123@86031f62631c0cb7495e71.e',
            who_last_modified: 'MOCKUSER123@86031f62631c0cb7495e71.e'
          },
          {
            id: '5555555555555555555',
            name: 'Stage',
            enabled: true,
            title: 'Stage',
            description: 'Project staging workspace',
            quota_usage: 'Quota usage for workspace',
            runtime_enabled: true,
            date_created: '2025-12-18T10:30:00Z',
            date_last_modified: '2025-12-19T15:22:10Z',
            date_last_activity: '2026-02-01T09:15:30Z',
            who_created: 'MOCKUSER456@86031f62631c0cb7495e71.e',
            who_last_modified: 'MOCKUSER456@86031f62631c0cb7495e71.e'
          }
        ]
      });

      const devConsole = new DeveloperConsole(
        'MOCK123456789ABCD@AdobeOrg',
        'apiKey123',
        'token123'
      );
      const workspaces = await devConsole.listWorkspaces('project123');

      assert.ok(Array.isArray(workspaces));
      assert.strictEqual(workspaces.length, 2);
      assert.strictEqual(workspaces[0].id, '4444444444444444444');
      assert.strictEqual(workspaces[0].name, 'Production');
      assert.strictEqual(workspaces[1].id, '5555555555555555555');
      assert.strictEqual(workspaces[1].name, 'Stage');
    });
  });

  describe('#getProject', function () {
    it('should return null on error', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));
      mockConsoleClient.getProject.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      const project = await devConsole.getProject('project123');
      assert.strictEqual(project, null);
    });

    it('should return project details on success', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getProject.resolves({
        body: {
          id: '1111111111111111111',
          name: '123MockProject',
          title: 'Mock Test Project',
          description: 'Test project description',
          type: 'default',
          enabled: true,
          deleted: false,
          org_id: 123456,
          date_created: '2025-12-17T13:50:27Z',
          date_last_modified: '2025-12-18T12:07:45Z',
          date_last_activity: '2026-01-15T13:40:20Z',
          who_created: 'MOCK1234567890ABCD@techacct.adobe.com',
          who_last_modified: 'MOCK1234567890ABCD@techacct.adobe.com',
          notifications_enabled: true
        }
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const project = await devConsole.getProject('1111111111111111111');

      assert.ok(project);
      assert.strictEqual(project.id, '1111111111111111111');
      assert.strictEqual(project.name, '123MockProject');
      assert.strictEqual(project.title, 'Mock Test Project');
    });
  });

  describe('#getWorkspaceCredentials', function () {
    it('should return an empty array on error', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));
      mockConsoleClient.getCredentials.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123', 'apiKey123', 'token123');
      const credentials = await devConsole.getWorkspaceCredentials('project123', 'workspace123');
      assert.ok(Array.isArray(credentials));
      assert.strictEqual(credentials.length, 0);
    });

    it('should return credentials on success', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({
        body: [
          {
            client_id: 'aaaabbbbccccdddd1111222233334444',
            flow_type: 'entp',
            date_created: '2025-12-17T14:31:43.000Z',
            date_last_modified: '2025-12-17T20:44:28.000Z',
            last_token_generated: '2026-01-15T13:40:20.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '777777',
            integration_type: 'oauth_server_to_server',
            integration_name: 'OAuth Server-to-Server Credential',
            integration_description: 'OAuth credential for testing'
          }
        ]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getWorkspaceCredentials('proj1', 'ws1');

      assert.ok(Array.isArray(credentials));
      assert.strictEqual(credentials.length, 1);
      assert.strictEqual(credentials[0].client_id, 'aaaabbbbccccdddd1111222233334444');
      assert.strictEqual(credentials[0].integration_type, 'oauth_server_to_server');
    });
  });

  describe('#getCredentials', function () {
    it('should return null when no OAuth credentials found', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({
        body: [
          {
            client_id: 'bbbbccccddddeeee5555666677778888',
            flow_type: 'entp',
            date_created: '2025-11-10T10:00:00.000Z',
            date_last_modified: '2025-11-10T10:00:00.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '888888',
            integration_type: 'service_account',
            integration_name: 'Service Account Credential',
            integration_description: 'Legacy service account'
          }
        ]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      assert.strictEqual(credentials, null);
    });

    it('should return OAuth credentials when found', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({
        body: [
          {
            client_id: 'ccccddddeeeeffff9999000011112222',
            flow_type: 'entp',
            date_created: '2025-12-17T14:31:43.000Z',
            date_last_modified: '2025-12-17T20:44:28.000Z',
            last_token_generated: '2026-01-15T13:40:20.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '777777',
            integration_type: 'oauth_server_to_server',
            integration_name: 'OAuth Server-to-Server Credential',
            integration_description: 'OAuth credential for testing',
            name: 'OAuth Server-to-Server Credential'
          }
        ]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      assert.ok(credentials);
      assert.strictEqual(credentials.clientId, 'ccccddddeeeeffff9999000011112222');
      assert.strictEqual(credentials.credentialId, '777777');
      assert.strictEqual(credentials.name, 'OAuth Server-to-Server Credential');
    });
  });

  describe('#getIntegration', function () {
    it('should return integration details on success', async function () {
      const mockIntegration = {
        id: '999999',
        orgId: '123456',
        orgCode: 'MOCK123456789ABCD@AdobeOrg',
        apiKey: 'aaaabbbbccccdddd11112222333344445',
        name: 'Test Credential in Project',
        description: 'Test credential description',
        status: 'ENABLED',
        type: 'entp',
        integrationType: 'oauth_server_to_server',
        production: true,
        createdDate: 1700000000000,
        lastModifiedDate: 1700100000000,
        lastTokenDate: 1700200000000,
        readOnly: false,
        technicalAccountId: 'MOCKTECH123456789@techacct.adobe.com',
        technicalAccountEmail: 'mock-uuid-1234-5678@techacct.adobe.com',
        serviceProperties: [
          {
            sdkCode: 'TEST-API',
            name: 'Test API Service',
            roles: [
              {
                id: 1001,
                code: 'test.role.one',
                name: 'Test Role One',
                description: 'First test role'
              },
              {
                id: 1002,
                code: 'test.role.two',
                name: 'Test Role Two',
                description: 'Second test role'
              },
              {
                id: 1003,
                code: 'openid',
                name: null,
                description: 'Sign in a user'
              }
            ],
            scopes: ['test.role.one', 'test.role.two', 'openid'],
            licenseConfigs: [
              {
                id: '11111111',
                name: 'Test License Config',
                productId: 'TESTPROD123456',
                description: 'Test product license'
              }
            ]
          }
        ],
        sdkList: ['TEST-API']
      };

      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const integration = await devConsole.getIntegration(mockOrganization.id, '999999');

      assert.ok(integration);
      assert.strictEqual(integration.id, '999999');
      assert.strictEqual(integration.integrationType, 'oauth_server_to_server');
      assert.strictEqual(integration.name, 'Test Credential in Project');
      assert.ok(Array.isArray(integration.serviceProperties));
      assert.strictEqual(integration.serviceProperties.length, 1);
      assert.ok(Array.isArray(integration.serviceProperties[0].scopes));
      assert.strictEqual(integration.serviceProperties[0].scopes.length, 3);
      assert.strictEqual(integration.serviceProperties[0].sdkCode, 'TEST-API');
    });

    it('should return null on API error', async function () {
      mockConsoleClient.getIntegration = sinon.stub().rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const integration = await devConsole.getIntegration(mockOrganization.id, '999999');

      assert.strictEqual(integration, null);
    });

    it('should return null when response body is missing', async function () {
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: null
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const integration = await devConsole.getIntegration(mockOrganization.id, '999999');

      assert.strictEqual(integration, null);
    });
  });

  describe('#getCredentialScopes', function () {
    it('should return scopes from integration service properties', async function () {
      const mockIntegration = {
        id: '888888',
        orgId: '123456',
        orgCode: 'MOCK123456789ABCD@AdobeOrg',
        apiKey: 'testapikeyaabbccdd11223344',
        name: 'Test OAuth Credential',
        integrationType: 'oauth_server_to_server',
        serviceProperties: [
          {
            sdkCode: 'TEST-SERVICE-1',
            name: 'Test Service One',
            scopes: ['scope.one', 'scope.two', 'openid']
          },
          {
            sdkCode: 'TEST-SERVICE-2',
            name: 'Test Service Two',
            scopes: ['scope.three', 'scope.four']
          }
        ]
      };

      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 5);
      assert.ok(scopes.includes('scope.one'));
      assert.ok(scopes.includes('scope.two'));
      assert.ok(scopes.includes('scope.three'));
      assert.ok(scopes.includes('scope.four'));
      assert.ok(scopes.includes('openid'));
    });

    it('should return empty array when integration has no service properties', async function () {
      const mockIntegration = {
        id: '888888',
        orgId: '123456',
        integrationType: 'oauth_server_to_server',
        serviceProperties: []
      };

      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should return empty array when integration has service properties without scopes', async function () {
      const mockIntegration = {
        id: '888888',
        orgId: '123456',
        integrationType: 'oauth_server_to_server',
        serviceProperties: [
          {
            sdkCode: 'TEST-SERVICE',
            name: 'Test Service'
            // No scopes property
          }
        ]
      };

      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should return empty array when getIntegration returns null', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: null
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should return empty array on API error from getIntegration', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should return empty array on error from _getAdcOrgId', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('Organization lookup failed'));

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should return empty array when getIntegration throws during scopes extraction', async function () {
      const mockIntegration = {
        id: '888888',
        orgId: '123456',
        integrationType: 'oauth_server_to_server',
        serviceProperties: [
          {
            sdkCode: 'TEST-SERVICE',
            name: 'Test Service',
            // Mock a property that will cause an error when accessed
            get scopes() {
              throw new Error('Error accessing scopes');
            }
          }
        ]
      };

      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });

    it('should handle integration with undefined serviceProperties', async function () {
      const mockIntegration = {
        id: '888888',
        orgId: '123456',
        integrationType: 'oauth_server_to_server'
        // serviceProperties is undefined
      };

      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getIntegration = sinon.stub().resolves({
        body: mockIntegration
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const scopes = await devConsole.getCredentialScopes('888888');

      assert.ok(Array.isArray(scopes));
      assert.strictEqual(scopes.length, 0);
    });
  });

  describe('#getCredentialUrl', function () {
    it('should return the correct URL', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const url = await devConsole.getCredentialUrl('proj1', 'cred1');

      assert.strictEqual(
        url,
        `https://developer.adobe.com/console/projects/${mockOrganization.id}/proj1/credentials/cred1/details/oauthservertoserver`
      );
    });

    it('should use fallback orgId when ADC lookup fails', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const url = await devConsole.getCredentialUrl('proj1', 'cred1');

      assert.strictEqual(
        url,
        'https://developer.adobe.com/console/projects/org123@AdobeOrg/proj1/credentials/cred1/details/oauthservertoserver'
      );
    });
  });

  describe('#_getAdcOrgId', function () {
    it('should cache the ADC org ID after first lookup', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');

      // Call twice to verify caching
      const firstCall = await devConsole._getAdcOrgId();
      const secondCall = await devConsole._getAdcOrgId();

      assert.strictEqual(firstCall, mockOrganization.id);
      assert.strictEqual(secondCall, mockOrganization.id);
      // Should only call getOrganizations once due to caching
      assert.strictEqual(mockConsoleClient.getOrganizations.callCount, 1);
    });

    it('should fallback to orgId when no matching org found', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [{ id: '99999', code: 'different@AdobeOrg', name: 'Different Org' }]
      });

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const adcOrgId = await devConsole._getAdcOrgId();

      assert.strictEqual(adcOrgId, 'org123@AdobeOrg');
    });

    it('should fallback to orgId when response has no body', async function () {
      mockConsoleClient.getOrganizations.resolves({ body: null });

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const adcOrgId = await devConsole._getAdcOrgId();

      assert.strictEqual(adcOrgId, 'org123@AdobeOrg');
    });

    it('should fallback to orgId when response is null', async function () {
      mockConsoleClient.getOrganizations.resolves(null);

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const adcOrgId = await devConsole._getAdcOrgId();

      assert.strictEqual(adcOrgId, 'org123@AdobeOrg');
    });

    it('should fallback to orgId when matching org has no id', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [{ code: 'org123@AdobeOrg', name: 'Test Org' }]
      });

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const adcOrgId = await devConsole._getAdcOrgId();

      assert.strictEqual(adcOrgId, 'org123@AdobeOrg');
    });
  });

  describe('#_getClient', function () {
    it('should cache the console client after initialization', async function () {
      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');

      // Call multiple times to verify caching
      const client1 = await devConsole._getClient();
      const client2 = await devConsole._getClient();

      assert.strictEqual(client1, client2);
      assert.strictEqual(initStub.callCount, 1);
    });
  });

  describe('#listProjects - edge cases', function () {
    it('should handle null response', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getProjectsForOrg.resolves(null);

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const projects = await devConsole.listProjects();

      assert.ok(Array.isArray(projects));
      assert.strictEqual(projects.length, 0);
    });

    it('should handle empty body array', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getProjectsForOrg.resolves({ body: [] });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const projects = await devConsole.listProjects();

      assert.ok(Array.isArray(projects));
      assert.strictEqual(projects.length, 0);
    });
  });

  describe('#listWorkspaces - edge cases', function () {
    it('should handle null response', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getWorkspacesForProject.resolves(null);

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const workspaces = await devConsole.listWorkspaces('proj1');

      assert.ok(Array.isArray(workspaces));
      assert.strictEqual(workspaces.length, 0);
    });
  });

  describe('#getProject - edge cases', function () {
    it('should handle null response', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getProject.resolves(null);

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const project = await devConsole.getProject('proj1');

      assert.strictEqual(project, null);
    });

    it('should handle response with null body', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getProject.resolves({ body: null });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const project = await devConsole.getProject('proj1');

      assert.strictEqual(project, null);
    });
  });

  describe('#getWorkspaceCredentials - edge cases', function () {
    it('should handle null response', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves(null);

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getWorkspaceCredentials('proj1', 'ws1');

      assert.ok(Array.isArray(credentials));
      assert.strictEqual(credentials.length, 0);
    });

    it('should handle response with null body', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({ body: null });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getWorkspaceCredentials('proj1', 'ws1');

      assert.ok(Array.isArray(credentials));
      assert.strictEqual(credentials.length, 0);
    });
  });

  describe('#getCredentials - edge cases', function () {
    it('should return null on error', async function () {
      mockConsoleClient.getOrganizations.rejects(new Error('API Error'));
      mockConsoleClient.getCredentials.rejects(new Error('API Error'));

      const devConsole = new DeveloperConsole('org123@AdobeOrg', 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      assert.strictEqual(credentials, null);
    });

    it('should return null when credentials array is empty', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({ body: [] });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      assert.strictEqual(credentials, null);
    });

    it('should handle multiple credentials and return the OAuth one', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      mockConsoleClient.getCredentials.resolves({
        body: [
          {
            client_id: 'eeeeffffaaaa11112222333344445555',
            flow_type: 'entp',
            date_created: '2025-09-01T12:00:00.000Z',
            date_last_modified: '2025-09-01T12:00:00.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '111111',
            integration_type: 'service_account',
            integration_name: 'Service Account',
            integration_description: 'Legacy credential'
          },
          {
            client_id: 'ffffaaaa22223333444455556666bbbb',
            flow_type: 'entp',
            date_created: '2025-12-17T14:31:43.000Z',
            date_last_modified: '2025-12-17T20:44:28.000Z',
            last_token_generated: '2026-01-15T13:40:20.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '222222',
            integration_type: 'oauth_server_to_server',
            integration_name: 'Primary OAuth Credential',
            integration_description: 'Main OAuth credential',
            name: 'Primary OAuth Credential',
            scopes: ['openid', 'AdobeID']
          },
          {
            client_id: 'aaaa11112222333344445555eeeebbbb',
            flow_type: 'entp',
            date_created: '2025-08-15T09:30:00.000Z',
            date_last_modified: '2025-08-15T09:30:00.000Z',
            id_workspace: '4444444444444444444',
            id_integration: '333333',
            integration_type: 'api_key',
            integration_name: 'API Key',
            integration_description: 'API key credential'
          }
        ]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      assert.ok(credentials);
      assert.strictEqual(credentials.clientId, 'ffffaaaa22223333444455556666bbbb');
      assert.strictEqual(credentials.credentialId, '222222');
      assert.strictEqual(credentials.name, 'Primary OAuth Credential');
    });

    it('should handle error during credentials find operation', async function () {
      mockConsoleClient.getOrganizations.resolves({
        body: [mockOrganization]
      });
      // Create malformed data that will cause an error during the find operation
      mockConsoleClient.getCredentials.resolves({
        body: [
          null, // This null will cause issues when trying to access .integration_type
          {
            client_id: 'bbbbcccc33334444555566667777aaaa',
            flow_type: 'entp',
            id_workspace: '4444444444444444444',
            id_integration: '444444',
            integration_type: 'oauth_server_to_server',
            integration_name: 'OAuth After Null'
          }
        ]
      });

      const devConsole = new DeveloperConsole(mockOrganization.code, 'apiKey123', 'token123');
      const credentials = await devConsole.getCredentials('proj1', 'ws1');

      // Should handle the error gracefully and return null
      assert.strictEqual(credentials, null);
    });
  });
});
