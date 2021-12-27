# [serve](https://github.com/warren-bank/node-serve/tree/master/lib/serve)

Assuming you would like to serve a static site, single page application or just a static file (no matter if on your device or on the local network), this package is just the right choice for you.

In general, `serve` also provides a neat interface for listing directory contents, and to easily browse through a directory tree.

## Usage

Get started by installing the package using [yarn](https://yarnpkg.com/lang/en/):

```sh
yarn global add "@warren-bank/serve"
```

You can also use [npm](https://www.npmjs.com/) instead, if you'd like:

```sh
npm install --global "@warren-bank/serve"
```

Once that's done, you can run this command inside your project's directory...

```bash
serve
```

...or specify which folder you want to serve:

```bash
serve folder_name
```

Finally, run this command to see a list of all available options:

```bash
serve --help
```

Now you understand how the package works! :tada:

## Configuration

To customize `serve`'s behavior, create a `serve.json` file in the public folder and insert any of [these properties](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#options).

## API

The core of `serve` is [serve-handler](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler), which can be used as middleware in existing HTTP servers:

```js
const handler = require('@warren-bank/serve/lib/serve-handler');
const http = require('http');

const server = http.createServer((request, response) => {
  // You pass two more arguments for config and middleware
  // More details here: https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#options
  return handler(request, response);
})

server.listen(3000, () => {
  console.log('Running at http://localhost:3000');
});
```

**NOTE:** You can also replace `http.createServer` with [micro](https://github.com/vercel/micro), if you want.
