# [serve](https://github.com/warren-bank/node-serve/tree/master/lib/serve)

Assuming you would like to serve a static site, single page application or just a static file (no matter if on your device or on the local network), this package is just the right choice for you.

In general, `serve` also provides a neat interface for listing directory contents, and to easily browse through a directory tree.

## Install

Get started by installing the package using [yarn](https://yarnpkg.com/):

```sh
yarn global add "@warren-bank/serve"
```

You can also use [npm](https://www.npmjs.com/) instead, if you'd prefer:

```sh
npm install --global "@warren-bank/serve"
```

## Usage (by example)

* serve the current directory
  ```bash
    cd /path/to/www-root
    serve
  ```
  - HTTP port 3000
    * bind to all network interfaces

* serve the current directory
  ```bash
    cd /path/to/www-root
    serve --ssl
  ```
  - HTTPS port 3000
    * bind to all network interfaces

* serve the current directory
  ```bash
    cd /path/to/www-root
    serve --listen 80
  ```
  - HTTP port 80
    * bind to all network interfaces

* serve the current directory
  ```bash
    cd /path/to/www-root
    serve --listen tcp:localhost:80
  ```
  - HTTP port 80
    * bind only to _loopback_ interface

* serve the current directory
  ```bash
    cd /path/to/www-root
    serve --cors --symlinks --listen 80
  ```
  - HTTP port 80
    * bind to all network interfaces
  - allow access from other websites
  - resolve symbolic file and directory links

* serve a specified directory
  ```bash
    serve --cors --symlinks --listen 80 /path/to/www-root
  ```
  - HTTP port 80
    * bind to all network interfaces
  - allow access from other websites
  - resolve symbolic file and directory links

* serve a specified directory
  ```bash
    serve --cors --symlinks --ssl --listen 443 /path/to/www-root
  ```
  - HTTPS port 443
    * bind to all network interfaces
  - allow access from other websites
  - resolve symbolic file and directory links

* serve a specified directory
  ```bash
    serve --cors --symlinks --ssl --listen 443 --force-https 80 /path/to/www-root
  ```
  - HTTPS port 443
    * bind to all network interfaces
  - HTTP port 80
    * bind to all network interfaces
    * force HTTPS
      - redirect all requests to HTTPS port 443
  - allow access from other websites
  - resolve symbolic file and directory links

## Usage

all available options:

```bash
serve --help

  serve - Static file serving and directory listing

  USAGE

    $ serve --help
    $ serve --version
    $ serve folder_name
    $ serve [-l listen_uri [-l ...]] [directory]

    By default, serve will listen on tcp:0.0.0.0:3000
    and serve the current working directory on that address.

    Specifying a single --listen argument will overwrite the default,
    not supplement it.

  OPTIONS

    --help
        Shows this help message

    -v, --version
        Displays the current version of serve

    -l, --listen <listen_uri>
        Specify a URI endpoint on which to listen (see below) -
        more than one may be specified to listen in multiple places

    -p <port_number>
        Specify custom port

    -s, --single
        Rewrite all not-found requests to `index.html`

    -d, --debug
        Show debugging information

    -c, --config <file_path>
        Specify custom path to `serve.json`

    -n, --no-clipboard
        Do not copy the local address to the clipboard

    -u, --no-compression
        Do not compress files

    --no-etag
        Send `Last-Modified` header instead of `ETag`

    -S, --symlinks
        Resolve symlinks instead of showing 404 errors

    -C, --cors
        Enable CORS by adding the HTTP response header:
          `Access-Control-Allow-Origin: *`

    --no-port-switching
        Do not automatically switch to a different port number
        when the port specified is already in use

    --ssl
        Enable "automatic" SSL.
        Uses a default SSL/TLS certificate (cert/key/pass).

    --ssl-cert <file_path>
        Optional path to an SSL/TLS certificate to serve with HTTPS

    --ssl-key <file_path>
        Optional path to the SSL/TLS certificate's private key

    --ssl-pass <file_path>
        Optional path to the SSL/TLS certificate's passphrase

    --force-https <listen_uri>
        Specify a URI endpoint on which to listen (see below) -
        more than one may be specified to listen in multiple places.
        These are insecure HTTP endpoints,
        which redirect all requests to the first secure HTTPS endpoint
        configured to listen on a numbered port.

    --delay <ms>
        Specify a delay in milliseconds,
        which is applied to all requests to simulate network latency

  ENDPOINTS

    Listen endpoints (specified by the --listen, -l, or --force-https options above)
    instruct serve to listen on one or more interfaces/ports,
    UNIX domain sockets, or Windows named pipes.

    For TCP ports on hostname "localhost":

      $ serve -l 1234

    For TCP (traditional host/port) endpoints:

      $ serve -l tcp://hostname:1234

    For UNIX domain socket endpoints:

      $ serve -l unix:/path/to/socket.sock

    For Windows named pipe endpoints:

      $ serve -l pipe:\\.\pipe\PipeName
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
