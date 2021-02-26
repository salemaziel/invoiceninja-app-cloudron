# Invoice Ninja Cloudron App

This repository contains the Cloudron app package source for [Invoice Ninja](https://www.invoiceninja.com).

## Installation

[![Install](https://cloudron.io/img/button.svg)](https://cloudron.io/button.html?app=com.invoiceninja.cloudronapp)

or using the [Cloudron command line tooling](https://cloudron.io/references/cli.html)

```
cloudron install --appstore-id com.invoiceninja.cloudronapp
```

## Building

The app package can be built using the [Cloudron command line tooling](https://cloudron.io/references/cli.html).

```
cd invoiceninja-app

cloudron build
cloudron install
```

## Testing

The e2e tests are located in the `test/` folder and require [nodejs](http://nodejs.org/). They are creating a fresh build, install the app on your Cloudron, perform tests, backup, restore and test if the docs are ok.

```
cd invoiceninja-app

npm install
npm test
```
