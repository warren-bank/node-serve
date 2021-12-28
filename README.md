### [serve](https://github.com/warren-bank/node-serve)

Static file serving and directory listing

#### Fork:

* [serve-handler](https://github.com/vercel/serve-handler)
  - forked from tag: [6.1.3](https://github.com/vercel/serve-handler/releases/tag/6.1.3)
  - changes:
    * extensive amount of refactoring, rewriting, bug fixes, and new features (too many to list)
    * added the dependency [resolve-lnk](https://github.com/ashbeats/resolve-lnk)
      - when `config.symlinks` is enabled (ex: `serve --symlinks`), Windows shortcuts are processed in the same way as symbolic links
      - a Windows shortcut to a file will retrieve its contents
      - a Windows shortcut to a directory will list its contents
        * nesting multiple Windows directory shortcuts works as expected
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
    * add: (boolean) `logReq`
      - print a log of all inbound requests
    * add: (boolean) `logRes`
      - print a log of all outbound responses
* [serve](https://github.com/vercel/serve)
  - forked from tag: [13.0.2](https://github.com/vercel/serve/releases/tag/13.0.2)
  - changes:
    * update the `serve-handler` and `schemas` dependencies to use the modified versions (above)
    * bug fixes: SSL certificates with passphrase

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
