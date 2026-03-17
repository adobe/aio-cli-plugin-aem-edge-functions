# aio-cli-plugin-aem-edge-functions

[Adobe I/O CLI](https://github.com/adobe/aio-cli) Plugin for interactions with AEM Edge Functions Services.

AEM Edge Functions allow you to execute JavaScript at the CDN layer, bringing data processing closer to the end user. This reduces latency and enables responsive, dynamic experiences at the edge.

The feature is currently beta, if you’re interested in participating or want to learn more, please email aemcs-edgecompute-feedback@adobe.com with a brief description of your use case.

# Requirements

- [Adobe I/O CLI](https://github.com/adobe/aio-cli)
  - 10.3.x or higher
  - 11.x or higher
- Node.js version compatibility:
  - 18.x -- 18.0.0 or higher.
  - 20.x -- 20.11.0 or higher.
  - 22.x -- 22.15.0 or higher.
  - Use with odd Node versions is _not_ recommended.

# Installation

```
$ aio plugins:install @adobe/aio-cli-plugin-aem-edge-functions
```

# Updating

```
$ aio plugins:update
```

# Local Development

```
# Clone the repo and run the following command
$ aio plugins link ./aio-cli-plugin-aem-edge-functions
```

# Getting started

## Setup

You can set up your environment by running the following command:

```
aio aem edge-functions setup
```

This command will prompt you to:

1. Select whether to store configuration locally (`.aio` file) or globally
2. Select the Cloud Manager organization, program and environment you want to work with
3. Optionally configure Adobe Developer Console (ADC) credentials for API authentication

The configuration may be stored locally in a `.aio` file in the current folder if selected, otherwise in the global aio configuration. This allows you to set up an independent config for each Edge Function project.

The deploy and tail-logs commands will use this configuration to identify the correct Cloud Manager environment.

### Adobe Developer Console Integration

ADC credentials are required for API authentication. There are three ways to configure them:

#### Option 1: ADC Config File (`--adc-config` / `-c`)

You can download a configuration file directly from Adobe Developer Console and pass it to the setup command. Two file formats are supported and automatically detected:

**Full project format** — downloaded from the project overview page. Contains the full project, workspace and credential information. All fields are read automatically and no further prompts are shown.

```
aio aem edge-functions setup --adc-config ./adc-project.json
```

**Credentials-only format** — downloaded from the credential page. Contains only the OAuth client ID, secret and scopes. The client ID, secret and scopes are read from the file automatically.

```
aio aem edge-functions setup -c ./adc-credentials.json
```

In both cases, the recognized values are displayed before they are saved. For the client secret, you will be asked how to store it.

#### Option 2: `AEM_EDGE_FUNCTIONS_ADC_CONFIG` Environment Variable

Instead of a file path, you can provide the same JSON content as an environment variable. This is particularly useful in CI/CD pipelines:

```
export AEM_EDGE_FUNCTIONS_ADC_CONFIG='{ ... }'
aio aem edge-functions setup
```

The same two JSON formats are supported. All ADC values read from this variable are automatically available to all commands without running setup — individual environment variables take precedence over this variable if both are set.

#### Option 3: Interactive / Individual Environment Variables

Without a config file or `AEM_EDGE_FUNCTIONS_ADC_CONFIG`, the setup command will interactively guide you through selecting an ADC project and workspace from your organization. You can also override individual values via environment variables:

| Environment Variable                   | Description                             |
| -------------------------------------- | --------------------------------------- |
| `AEM_EDGE_FUNCTIONS_ORG_ID`            | Cloud Manager organization ID           |
| `AEM_EDGE_FUNCTIONS_PROGRAM_ID`        | Cloud Manager program ID                |
| `AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID`    | Cloud Manager environment ID            |
| `AEM_EDGE_FUNCTIONS_EDGE_DELIVERY`     | Use Edge Delivery site (`true`/`false`) |
| `AEM_EDGE_FUNCTIONS_SITE_DOMAIN`       | Edge Delivery site domain               |
| `AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID`     | ADC OAuth client ID                     |
| `AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET` | ADC OAuth client secret                 |
| `AEM_EDGE_FUNCTIONS_ADC_SCOPES`        | ADC OAuth scopes (comma-separated)      |

### Client Secret Storage

When a client secret is available (either from a config file or entered manually), you will be asked how to store it:

- **Environment variable** _(recommended)_ — prints the export command to add to your shell profile for persistence
- **Configuration file** — stores the secret as plain text in the aio config (not recommended for production)
- **Don't store** — the secret is not persisted; you will need to provide it each time via the environment variable

## View Configuration

You can view your current configuration at any time by running:

```
aio aem edge-functions info
```

This command displays:

- Organization ID
- Program ID and Name
- Environment ID and Name
- Edge Delivery configuration and site domain
- ADC Client ID, and project/workspace details if configured
- Cloud Manager URL for quick access to your environment

### Debug Mode

For detailed debugging information use the `--debug` flag:

```
aio aem edge-functions info --debug
```

In debug mode, the command additionally displays:

- ADC credential details (Client ID, secret presence, scopes)
- All active `AEM_EDGE_FUNCTIONS_*` environment variables
- Edge Functions API endpoint
- API connectivity test with token type and HTTP status

### Batch Mode

To display configuration without triggering a login prompt, use the `--batch` / `-b` flag:

```
aio aem edge-functions info --batch
```

In batch mode, any step that requires an interactive login is skipped. This is useful in CI/CD pipelines or scripted environments where interactive login is not possible. Cloud Manager program/environment names and ADC project/workspace names will not be shown. API connectivity is still tested if a token is available via environment variable or ADC OAuth credentials.

## Build

The following command will package your code for deployment to your edge function.

```
aio aem edge-functions build
```

## Deploy

The following command will deploy your package to your edge function. You will need to pass your own function name `<function-name>`, where function-name is the name you gave to your service in the edge functions configuration file.

To be able to deploy, you need to have the "AEM Administrator" product profile for the author instance of your environment for an AEM as a Cloud Service environment. For Edge Delivery Sites with Adobe Managed CDN you need to the Cloud Manager Deployment Manager product profile. To manage product profiles use the [Admin Console](https://adminconsole.adobe.com/).

```
aio aem edge-functions deploy first-function
```

## Local run

The following command will run your edge function code locally and exposed a server at `http://127.0.0.1:7676`

```
aio aem edge-functions serve
```

To automatically rebuild when files change, use the `--watch` flag:

```
aio aem edge-functions serve --watch
```

You can learn more about what is supported by Local runtime on [Fastly documentation](https://www.fastly.com/documentation/reference/cli/compute/serve/).

## Remote debugging

The following command will tail your edge function logs to help you debug your application. You will be able to get runtime `console.log` from your edge function directly in your terminal.

```
aio aem edge-functions tail-logs first-function
```

## CI/CD Setup

In a CI/CD pipeline you can avoid any interactive prompts by supplying all required values as environment variables and using the `--batch` / `-b` flag where applicable.

### 1. Store secrets in your CI/CD provider

Add the following as secret/masked environment variables in your pipeline configuration (GitHub Actions, GitLab CI, Jenkins, etc.):

| Variable                               | Where to find it                                      |
| -------------------------------------- | ----------------------------------------------------- |
| `AEM_EDGE_FUNCTIONS_PROGRAM_ID`        | Cloud Manager program ID                              |
| `AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID`    | Cloud Manager environment ID                          |
| `AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID`     | ADC project credential page                           |
| `AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET` | ADC project credential page                           |
| `AEM_EDGE_FUNCTIONS_ADC_SCOPES`        | ADC project credential page (comma-separated)         |

Alternatively, download the credentials JSON from Adobe Developer Console and expose it as:

```
AEM_EDGE_FUNCTIONS_ADC_CONFIG='{ ... }'
```

### 2. Verify configuration without login (optional)

Optionally use the info command to output the configuration, use `--batch` to no trigger an interactive login:

```
aio aem edge-functions info --batch
```

### 3. Build and deploy

```
aio aem edge-functions build
aio aem edge-functions deploy <function-name>
```

### GitHub Actions example (AEM as a Cloud Service)

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AEM_EDGE_FUNCTIONS_PROGRAM_ID: ${{ secrets.AEM_EDGE_FUNCTIONS_PROGRAM_ID }}
      AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID: ${{ secrets.AEM_EDGE_FUNCTIONS_ENVIRONMENT_ID }}
      AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID }}
      AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET }}
      AEM_EDGE_FUNCTIONS_ADC_SCOPES: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_SCOPES }}
    steps:
      - uses: actions/checkout@v4

      - name: Install aio CLI and plugin
        run: |
          npm install -g @adobe/aio-cli
          aio plugins:install @adobe/aio-cli-plugin-aem-edge-functions

      - name: Build
        run: aio aem edge-functions build

      - name: Deploy
        run: aio aem edge-functions deploy my-function
```

### GitHub Actions example (Edge Delivery Site)

For an Edge Delivery Site with Adobe Managed CDN, add `AEM_EDGE_FUNCTIONS_EDGE_DELIVERY` and `AEM_EDGE_FUNCTIONS_SITE_DOMAIN` to the environment:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      AEM_EDGE_FUNCTIONS_PROGRAM_ID: ${{ secrets.AEM_EDGE_FUNCTIONS_PROGRAM_ID }}
      AEM_EDGE_FUNCTIONS_EDGE_DELIVERY: true
      AEM_EDGE_FUNCTIONS_SITE_DOMAIN: ${{ secrets.AEM_EDGE_FUNCTIONS_SITE_DOMAIN }}
      AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_CLIENT_ID }}
      AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_CLIENT_SECRET }}
      AEM_EDGE_FUNCTIONS_ADC_SCOPES: ${{ secrets.AEM_EDGE_FUNCTIONS_ADC_SCOPES }}
    steps:
      - uses: actions/checkout@v4

      - name: Install aio CLI and plugin
        run: |
          npm install -g @adobe/aio-cli
          aio plugins:install @adobe/aio-cli-plugin-aem-edge-functions

      - name: Build
        run: aio aem edge-functions build

      - name: Deploy
        run: aio aem edge-functions deploy my-function
```
