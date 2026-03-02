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

1. Select the Cloud Manager organization, program and environment you want to work with
2. Optionally configure an Adobe Developer Console (ADC) project for API credentials

The configuration may be stored locally in a `.aio` file in the current folder if selected, otherwise in the global aio configuration. This allows you to set up a config for each Edge Function project independently.

The deploy and tail-logs commands will use this configuration to identify the correct Cloud Manager environment to deploy to.

### Adobe Developer Console Integration

During setup, you can optionally configure an Adobe Developer Console project and workspace. This allows you to:

- Associate your edge functions with a specific ADC project
- Use project-specific API credentials
- Manage multiple environments with different ADC projects

When prompted, you can:

- Select an existing ADC project from your organization
- Choose a workspace within that project
- Skip ADC configuration if not needed

The ADC project information will be stored alongside your Cloud Manager configuration for future reference.

## View Configuration

You can view your current configuration at any time by running:

```
aio aem edge-functions info
```

This command displays:

- Organization ID
- Program ID and Name
- Environment ID and Name
- Edge Delivery site configuration status
- Cloud Manager URL for quick access to your environment

### Debug Mode

For detailed debugging information, including API endpoint details and token verification, use the `--debug` flag:

```
aio aem edge-functions info --debug
```

In debug mode, the command will additionally:

- Display the computed API endpoint
- Show any environment variable overrides
- Test API connectivity and validate your authentication token

This is useful for troubleshooting authentication issues or verifying your setup before deploying.

## Build

The following command will package your code for deployment to your edge function.

```
aio aem edge-functions build
```

## Deploy

The following command will deploy your package to your edge function. You will need to pass your own function name `<function-name>`, where function-name is the name you gave to your service in the compute configuration file.

To be able to deploy, you need to have the "AEM Administrator" product profile for the author instance of your environment for an AEM as a Cloud Service environment. For Edge Delivery Sites with Adobe Managed CDN you need to the Cloud Manager Deployment Manager product profile. To manage product profiles use the [Admin Console](https://adminconsole.adobe.com/).

```
aio aem edge-functions deploy first-compute
```

## Local run

The following command will run your edge function code locally and exposed a server at `http://127.0.0.1:7676`

```
aio aem edge-functions serve
```

You can learn more about what is supported by Local runtime on [Fastly documentation](https://www.fastly.com/documentation/reference/cli/compute/serve/).

## Remote debugging

The following command will tail your edge function logs to help you debug your application. You will be able to get runtime `console.log` from your edge function directly in your terminal.

```
aio aem edge-functions tail-logs first-compute
```
