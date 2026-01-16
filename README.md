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

This command will prompt you to select the Cloud Manager organization, program and environment you want to work with. The configuration may be stored locally in a `.aio` file in the current folder if selected, otherwise in the global aio configuration. This allows you to set up a config for each Edge Function project independently.

The deploy and tail-logs commands will use this configuration to identify the correct Cloud Manager environment to deploy to.

## Build

The following command will package your code for deployment to your edge function.

```
aio aem edge-functions build
```

## Deploy

The following command will deploy your package to your edge function. You will need to pass your own function name `<function-name>`, where function-name is the name you gave to your service in the compute configuration file.

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
