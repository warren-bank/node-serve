### [serve](https://github.com/warren-bank/node-serve)

Static file serving and directory listing

#### Fork:

* [serve-handler](https://github.com/vercel/serve-handler)
  - forked from tag: [6.1.3](https://github.com/vercel/serve-handler/releases/tag/6.1.3)
  - changes:
    * extensive amount of refactoring, rewriting, bug fixes, and new features (too many to list)
    * added the dependency [resolve-lnk](https://github.com/ashbeats/resolve-lnk)
      - when the [`symlinks` option](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#symlinks-boolean) is enabled (ex: `serve --symlinks`), Windows shortcuts are processed in the same way as symbolic links
      - a Windows shortcut to a file will retrieve its contents
      - a Windows shortcut to a directory will list its contents
        * nesting multiple Windows directory shortcuts works as expected
    * added the dependency [basic-auth](https://github.com/jshttp/basic-auth)
      - to allow the [`auth` option](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#auth-object) to restrict access using [basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication)
    * added the dependency [strong-data-uri](https://github.com/strongloop/strong-data-uri)
      - to allow [rewrite](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#rewrites-array) and [redirect](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#redirects-array) rules to specify a `data:` URI destination
      - the `data:` URI is parsed and returned in the response
    * added the dependency [cheerio](https://github.com/cheeriojs/cheerio)
      - to allow the [`proxyMiddleware` option](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxymiddleware-array) to rewrite the HTML DOM in responses for proxied redirects
* [schemas](https://github.com/vercel/schemas)
  - forked from tag: [2.19.0](https://github.com/vercel/schemas/releases/tag/2.19.0)
  - files:
    * [config-static.js](https://github.com/vercel/schemas/blob/2.19.0/deployment/config-static.js)
  - changes:
    * add: (boolean) [`symlinks`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#symlinks-boolean)
    * add: (boolean) [`etag`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#etag-boolean)
    * add: (object)  [`auth`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#auth-object)
      - restrict access using basic auth
      - attributes:
        * (string) `name`
        * (string) `pass`
    * add: (string) [`proxyCookieJar`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxycookiejar-string)
      - file path to a persistent text file used by proxied redirects to store cookie data in JSON format
    * add: (array) [`proxyMiddleware`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxymiddleware-array)
      - apply custom middleware to modify the text content in responses for proxied redirects
      - shape: array of objects
      - attributes of each object:
        * (string) `engine`
          - must be one of the following values:
            * _glob_
            * _route_
            * _regex_
            * _text_
        * (string) `source`
          - pattern to compare with the URL of proxied redirect requests
        * (string) `type`
          - must be one of the following values:
            * _html_
            * _json_
            * _js_
            * _text_
        * (string) `middleware`
          - holds a stringified function
            * produced by: [`Function.prototype.toString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString)
        * (boolean) `terminal`
      - usage:
        * a `middleware` function is only called for a proxied response when:
          - `source` matches the URL of the redirected request
            * `engine` determines the methodology that is used to match `source` with the URL
              - _glob_
                * uses [minimatch](https://github.com/isaacs/minimatch)
              - _route_
                * uses [path-to-regexp](https://github.com/pillarjs/path-to-regexp)
              - _regex_
                * uses a standard regular expression pattern
                * an optional (string) `flags` attribute can add regex modifiers (ex: "i")
              - _text_
                * uses the presence of a case-sensitive substring
                * an optional (boolean) `exact` attribute can add the requirement that the substring must match the entire URL
          - `type` matches the generalized grouping of _content-type_ values to which the data in the response is categorized
        * a `middleware` function is passed a single parameter, which depends upon the `type` of response data
          - _html_
            * is passed an instance of [cheerio](https://github.com/cheeriojs/cheerio)
            * allows direct manipulation of DOM elements
          - _json_
            * is passed: `{response: data}`
            * where `data` is the data structure obtained by parsing the JSON response
            * allows direct manipulation of the data structure
          - _js_ and _text_
            * are passed: `{response: data}`
            * where `data` is the raw text response
            * allows direct manipulation of the text response
    * add: (array) [`cgiBin`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#cgibin-array)
      - execute _cgi-bin_ scripts and return _stdout_ in response
      - shape: array of objects
      - attributes of each object:
        * (string) `engine`
          - must be one of the following values:
            * _glob_
            * _route_
            * _regex_
            * _text_
        * (string) `source`
          - pattern to compare with the absolute file path for a file that exists and will otherwise be served
        * (string) `command`
          - the command-line instruction to execute
        * (object) `env`
          - an optional key/value map for environment variables that should exist during execution
      - usage:
        * a `command` is only executed for a requested file path when:
          - `source` matches the absolute file path for a file that exists and will otherwise be served
            * this file path may be the end result of several [`rewrites`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#rewrites-array)
            * this file path is normalized to use a '/' directory separator on all platforms
            * `engine` determines the methodology that is used to match `source` with the absolute file path
              - _glob_
                * uses [minimatch](https://github.com/isaacs/minimatch)
              - _route_
                * uses [path-to-regexp](https://github.com/pillarjs/path-to-regexp)
              - _regex_
                * uses a standard regular expression pattern
                * an optional (string) `flags` attribute can add regex modifiers (ex: "i")
              - _text_
                * uses the presence of a case-sensitive substring
                * an optional (boolean) `exact` attribute can add the requirement that the substring must match the entire URL
        * a `command` can be any command-line instruction that can execute and write a response to standard output
          - the absolute file path that matches `source` can be easily embedded into this instruction using a special token
            * all instances of the substring `{{source}}` in `command` will interpolate to the absolute file path using the native directory separator and enclosed by double quotes
          - the current working directory is normalized to the directory that contains the `{{source}}` file
    * add: (boolean) [`logReq`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#logreq-boolean)
      - print a log of all inbound requests
    * add: (boolean) [`logRes`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#logres-boolean)
      - print a log of all outbound responses
    * remove: regex patterns to restrict the set of characters permitted in `key` and `value` attributes of each [header](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#headers-array)
* [serve](https://github.com/vercel/serve)
  - forked from tag: [13.0.2](https://github.com/vercel/serve/releases/tag/13.0.2)
  - changes:
    * update the `serve-handler` and `schemas` dependencies to use the modified versions (above)
    * update the headers added to all responses when using the `--cors` command-line option
      - permit requests that include credentials when the 'origin' header is also present
    * add: a [`reviver` function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter) to reconstruct/rehydrate [`middleware`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxymiddleware-array) functions in the config object from JSON
    * add: command-line option `--force-https <listen_uri>`
      - this option is only enabled when `--ssl-cert` and `--ssl-key` are used to `--listen` on one or more secure endpoints
      - this option allows the server to also listen on one or more insecure endpoints,
        which will automatically redirect all requests to the first secure endpoint configured to listen on a numbered port
    * add: command-line option `--ssl`
      - this option was originally added upstream
        * in: [commit](https://github.com/vercel/serve/commit/c6336eaf184feeda7699a541f02bed2d74eabe14)
        * from: [pull request](https://github.com/vercel/serve/pull/274)
        * on: Oct 17, 2017
      - its original implementation _automatically_ included a static OpenSSL certificate
        * published by the external dependency: [openssl-self-signed-certificate](https://github.com/neverendingqs/openssl-self-signed-certificate)
      - this option was subsequently removed upstream
        * in: [commit](https://github.com/vercel/serve/commit/70d957b47ffe5f1912d221039b5338c2995a6650)
        * from: [pull request](https://github.com/vercel/serve/pull/520)
        * on: Sep 26, 2019
      - its updated implementation
        * replaced the (old) `--ssl` option with (new) options: `--ssl-cert`, `--ssl-key`, and `--ssl-pass`
        * removed the external dependency: [openssl-self-signed-certificate](https://github.com/neverendingqs/openssl-self-signed-certificate)
        * enabled `serve` to be _manually_ configured to use any OpenSSL certificate
      - this option has been restored
        * as a shorthand way to _automatically_ configure `serve` to use the OpenSSL certificate included in both the git repo and npm package
          - in directory: `.etc/bin/https/cert`
  - bug fixes:
    * SSL certificates with passphrase
    * logic to resolve the [`public` option](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#public-string) from a command-line argument

#### Install:

```bash
  npm install --global "@warren-bank/serve"
```

#### Usage:

* the short version:
  ```bash
    serve <options>
  ```
* the [long version](./lib/serve/README.md#usage)
* the easy way, using some [preconfigured scripts](https://github.com/warren-bank/node-serve/tree/master/.etc/bin)

#### Legal:

* all code belonging to the original projects:
  - original copyright and license apply
* all code that I've contributed:
  - copyright: [Warren Bank](https://github.com/warren-bank)
  - license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
