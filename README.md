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
    * add: (boolean) `symlinks`
    * add: (boolean) `etag`
    * add: (object)  `auth`
      - restrict access using basic auth
      - attributes:
        * (string) `name`
        * (string) `pass`
    * add: (string) `proxyCookieJar`
      - file path to a persistent text file used by proxied redirects to store cookie data in JSON format
    * add: (array) `proxyMiddleware`
      - rewrite the HTML DOM in responses for proxied redirects
      - shape: array of objects
      - attributes of each object:
        * (string) `engine`
        * (string) `source`
        * (string) `middleware`
          - holds a stringified function
            * produced by: [`Function.prototype.toString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString)
    * add: (boolean) `logReq`
      - print a log of all inbound requests
    * add: (boolean) `logRes`
      - print a log of all outbound responses
* [serve](https://github.com/vercel/serve)
  - forked from tag: [13.0.2](https://github.com/vercel/serve/releases/tag/13.0.2)
  - changes:
    * update the `serve-handler` and `schemas` dependencies to use the modified versions (above)
    * adds a [`reviver` function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#using_the_reviver_parameter) to reconstruct/rehydrate [`middleware`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxymiddleware-array) functions in the config object from JSON
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

#### Older Releases:

* [`@warren-bank/serve@130002.7.3`](https://github.com/warren-bank/node-serve/tree/130002.7.3)
  - final stable release that does not include:
    * the ~2MB dependency: [cheerio](https://github.com/cheeriojs/cheerio)
  - notes:
    * perfectly good version to install for a user who will never write custom [`middleware`](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler#proxymiddleware-array)

#### Legal:

* all code belonging to the original projects:
  - original copyright and license apply
* all code that I've contributed:
  - copyright: [Warren Bank](https://github.com/warren-bank)
  - license: [GPL-2.0](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)
