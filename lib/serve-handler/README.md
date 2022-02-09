# [serve-handler](https://github.com/warren-bank/node-serve/tree/master/lib/serve-handler)

This package represents the core of [serve](https://github.com/warren-bank/node-serve). It can be plugged into any HTTP server and is responsible for routing requests and handling responses.

In order to customize the default behaviour, you can also pass custom routing rules, provide your own methods for interacting with the file system and much more.

## Usage

Get started by installing the package using [yarn](https://yarnpkg.com/lang/en/):

```sh
yarn add "@warren-bank/serve"
```

You can also use [npm](https://www.npmjs.com/) instead, if you'd like:

```sh
npm install --save "@warren-bank/serve"
```

Next, add it to your HTTP server. Here's an example using [micro](https://github.com/vercel/micro):

```js
const handler = require('@warren-bank/serve/lib/serve-handler');

module.exports = async (request, response) => {
  await handler(request, response);
};
```

That's it! :tada:

## Options

If you want to customize the package's default behaviour, you can use the third argument of the function call to pass any of the configuration options listed below. Here's an example:

```js
await handler(request, response, {
  cleanUrls: true
});
```

You can use any of the following options:

| Property                                             | Description                                                           |
|------------------------------------------------------|-----------------------------------------------------------------------|
| [`public`](#public-string)                           | Directory path to the web root folder                                 |
| [`cleanUrls`](#cleanurls-booleanarray)               | Have the `.html` extension stripped from paths                        |
| [`rewrites`](#rewrites-array)                        | Rewrite paths to different paths                                      |
| [`redirects`](#redirects-array)                      | Forward paths to different paths or external URLs                     |
| [`cgiBin`](#cgibin-array)                            | Execute _cgi-bin_ scripts and return _stdout_ in response             |
| [`proxyMiddleware`](#proxymiddleware-array)          | Modify the text content in responses for proxied redirects            |
| [`proxyCookieJar`](#proxycookiejar-string)           | File path to the persistent text file used to store cookie data       |
| [`headers`](#headers-array)                          | Set custom headers for specific paths                                 |
| [`directoryListing`](#directorylisting-booleanarray) | Disable directory listing or restrict it to certain paths             |
| [`unlisted`](#unlisted-array)                        | Exclude paths from the directory listing                              |
| [`trailingSlash`](#trailingslash-boolean)            | Remove or add trailing slashes to all paths                           |
| [`renderSingle`](#rendersingle-boolean)              | If a directory only contains one file, render it                      |
| [`symlinks`](#symlinks-boolean)                      | Resolve symlinks instead of rendering a 404 error                     |
| [`etag`](#etag-boolean)                              | Calculate a strong `ETag` response header, instead of `Last-Modified` |
| [`auth`](#auth-object)                               | Restrict access using basic auth                                      |
| [`logReq`](#logreq-boolean)                          | Print a log of all inbound requests                                   |
| [`logRes`](#logres-boolean)                          | Print a log of all outbound responses                                 |

### public (String)

By default, the current working directory will be served.
This option can be used to serve a specific directory path.
If the provided directory path is not an absolute path, then it is resolved relative to the current working directory.

For example, if serving a [Jekyll](https://jekyllrb.com/) app, it would look like this:

```json
{
  "public": "_site"
}
```

Using absolute path:

```json
{
  "public": "/path/to/your/_site"
}
```

**NOTE:** The path cannot contain globs or regular expressions.

### cleanUrls (Boolean|Array)

By default, `.html` files can only be accessed by requesting a path that includes this file extension.

When this option is enabled:
* requests that include an `.html` file extension will automatically perform a redirect to the same path, but with the extension dropped
* requests to this _clean_ path will be transparently rewritten to read from the original file path

You can enable the feature like follows:

```json
{
  "cleanUrls": true
}
```

However, you can also restrict it to only certain paths:

```json
{
  "cleanUrls": [
    "/app/**",
    "/!components/**"
  ]
}
```

**NOTE:** The paths can only contain globs that are matched using [minimatch](https://github.com/isaacs/minimatch).

**WARNING:** It is __strongly__ advised to never enable both this option and [`trailingSlash`](#trailingslash-boolean). Doing so will result in broken relative links.

### rewrites (Array)

If you want your visitors to receive a response under a certain path, but actually serve a completely different one behind the curtains, this option is what you need.

It's perfect for [single page applications](https://en.wikipedia.org/wiki/Single-page_application) (SPAs).

You can use `glob` patterns (matched using [minimatch](https://github.com/isaacs/minimatch)) as follows:

```json
{
  "rewrites": [
    { "engine": "glob", "source": "app/**",          "destination": "/index.html"        },
    { "engine": "glob", "source": "projects/*/edit", "destination": "/edit-project.html" }
  ]
}
```

You can also use `route` patterns (matched using [path-to-regexp](https://github.com/pillarjs/path-to-regexp)) that contain _routing segments_ as follows:

```json
{
  "rewrites": [
    { "engine": "route", "source": "/projects/:id/edit", "destination": "/edit-project-:id.html" },
    { "engine": "route", "source": "/foo/:bar*",         "destination": "/:bar"                  }
  ]
}
```

Now, if a visitor accesses `/projects/123/edit`, it will respond with the file `/edit-project-123.html`.

You can also use `regex` patterns as follows:

```json
{
  "rewrites": [
    { "engine": "regex", "source": "^/app/.*$",                 "destination": "/index.html",          "flags": "i" },
    { "engine": "regex", "source": "^/projects/(?:[^/]+)/edit", "destination": "/edit-project.html"                 },
    { "engine": "regex", "source": "^/projects/([^/]+)/edit",   "destination": "/edit-project-$1.html"              },
    { "engine": "regex", "source": "^/foo(/.*)$",               "destination": "$1",                   "flags": "i" }
  ]
}
```

You can also use `text` substrings as follows:

```json
{
  "rewrites": [
    { "engine": "text", "source": "/foo/",        "destination": "/" },
    { "engine": "text", "source": "/favicon.ico", "destination": "data:image/x-icon;base64,AAABAAEAAQEAAAEAGAAwAAAAFgAAACgAAAABAAAAAgAAAAEAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8AAAAAAA==", "exact": true, "terminal": true }
  ]
}
```

**NOTE:** Substrings are case-sensitive. By default, all occurances of `source` will be replaced. The `{"exact": true}` attribute adds the condition that `source` must exactly match the full request path. If this is not the case, then no occurances will be replaced. If this is the case, then exactly one occurance (ie: the full request path) will be replaced by `destination`.

By default, after a rule is used to rewrite the requested path, the set of rules are (once again) applied to the newly rewritten path; this process continues recursively until no rules match. Any rule can override this behavior by adding the attribute: `{"terminal": true}`

### redirects (Array)

The behavior of redirects is very similar to rewrites, but rather than the rewrite happening transparently (ie: behind the curtains).. the visitor is redirected to a new URL.

For example:

```json
{
  "redirects": [
    { "engine": "text",  "source": "/from",            "destination": "/to",           "terminal": true },
    { "engine": "glob",  "source": "/old-pages/**",    "destination": "/home",         "terminal": true },
    { "engine": "route", "source": "/old-docs/:id",    "destination": "/new-docs/:id", "terminal": true },
    { "engine": "regex", "source": "^/old-docs/(.*)$", "destination": "/new-docs/$1",  "terminal": true }
  ]
}
```

By default, rules are applied to the original request path, which may include URL encodings. In most situations, this is desirable.. as the resulting redirect URL should also be properly encoded. However, if a pattern needs to be applied to a decoded request path.. you can change this behavior by setting the `decode` property directly on the rule object:

```json
{
  "redirects": [
    { "engine": "text", "source": "/from/###SHA1###", "destination": "/to/hash.txt", "decode": true }
  ]
}
```

**NOTE:** Reencoding of the resulting redirect URL is handled automatically.

By default, the [status code](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#3xx_redirection) of the response that is used to perform a redirect is conditional upon the [method](https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol#Request_methods) of the request:
* [307](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#307) for methods: POST, PUT, and PATCH
* [301](https://en.wikipedia.org/wiki/List_of_HTTP_status_codes#301) for all other methods

This behavior can be adjusted by setting the `type` property directly on the rule object:

```json
{
  "redirects": [
    { "engine": "text", "source": "/from", "destination": "/to", "type": 302 }
  ]
}
```

By default, the querystring and hash are not preserved by the redirect. The following boolean attributes enable this behavior:

```json
{
  "redirects": [
    { "engine": "text", "source": "/from", "destination": "/to", "preserveQuery": true, "preserveHash": true }
  ]
}
```

Unlike rewrites, which always resolve the requested path to a file or directory that must exist in the local filesystem, redirects can alias any network resource.

For example:

```json
{
  "redirects": [
    { "engine": "regex", "^/search/([^/]+)/?$", "destination": "https://www.google.com/search?q=$1", "terminal": true }
  ]
}
```

When a redirect is an alias for a network resource hosted by a different domain, it is sometimes preferable to proxy the redirected request.. in lieu of sending a `Location` response header. The following boolean attribute enables this behavior:

```json
{
  "redirects": [
    { "engine": "regex", "source": "^/whoami/?$", "destination": "https://httpbin.org/ip", "flags": "i", "terminal": true, "proxy": true }
  ]
}
```

**NOTE:** The request method, headers, and POST/PUT data are included in the proxied redirect request. (see [tests](https://github.com/warren-bank/node-serve/blob/master/.etc/test/tests.bat) using [redirect rule](https://github.com/warren-bank/node-serve/blob/master/.etc/bin/http/httpd.json#L139))

### cgiBin (Array)

After a request is resolved to an absolute file path for a file that exists, which may be the end result of several [`rewrites`](#rewrites-array), this option enables the file path to be used as a parameter to a command-line instruction.. and the resulting output to be returned to the client as a response.

Similar to rewrite and redirect rules, an `engine` attribute is used to determine how `source` will be matched with the absolute file path (normalized to use a '/' directory separator on all platforms):
* _glob_
* _route_
* _regex_
  - supports an optional _flags_ attribute
* _text_
  - supports an optional _exact_ attribute

A `command` attribute holds a string with the command-line instruction to execute. The current working directory is normalized to the directory containing the file. The special token `{{source}}` in the `command` string will be interpolated to the absolute file path using the native directory separator and enclosed by double quotes.

An optional `env` attribute holds an object to define environment variable key/value pairs that should exist during execution.

For example:

```json
{
  "cgiBin": [
    {
      "engine":        "glob",
      "source":        "**/cgi-bin/**/*.pl",
      "command":       "perl {{source}}",
      "env":           { "PATH": "C:/PortableApps/perl/5.10.1" }
    },
    {
      "engine":        "glob",
      "source":        "**/cgi-bin/**/*.php",
      "command":       "php {{source}}",
      "env":           { "PATH": "C:/PortableApps/php/8.0.0" }
    },
    {
      "engine":        "glob",
      "source":        "**/cgi-bin/**/*.sh",
      "command":       "bash --noprofile --norc --noediting {{source}}",
      "env":           { "PATH": "C:/PortableApps/PortableGit/2.16.2/bin" }
    },
    {
      "engine":        "glob",
      "source":        "**/cgi-bin/**/*.bat",
      "command":       "cmd.exe /c {{source}}"
    }
  ],

  "headers": [
    {
      "source":  "**/cgi-bin/**/*.+(pl|sh|bat)",
      "headers": [
        {
          "key":   "Content-Type",
          "value": "text/plain"
        }
      ]
    },
    {
      "source":  "**/cgi-bin/**/*.php",
      "headers": [
        {
          "key":   "Content-Type",
          "value": "text/html"
        }
      ]
    }
  ]
}
```

**NOTE:** If the absolute file path matches `source` in more than one rule, the `command` in only the first matching rule will be executed.

### proxyMiddleware (Array)

When a redirect request is proxied, the text content in its response can be modified by middleware before it is returned to the client.

Similar to rewrite and redirect rules, an `engine` attribute is used to determine how `source` will be matched with the URL of the redirected request:
* _glob_
* _route_
* _regex_
  - supports an optional _flags_ attribute
* _text_
  - supports an optional _exact_ attribute

The format of the text in a response will determine which `middleware` functions will be called to apply modifications,
as well as the format of the singular parameter passed to the `middleware` functions.

For simplicity, _content-types_ that represent the same text format are grouped together and given a name.
The following groups are currently supported:
* _html_
* _json_
* _js_
* _text_

For any `middleware` function to be called:
* the URL of the redirected request must match `source` using `engine`
* the name of the group for the _content-type_ of the proxied response must match `type`

If called, then the format of the singular parameter (ex: `param`) passed to the `middleware` function is determined by `type` as follows:
* _html_
  - an instance of [cheerio](https://github.com/cheeriojs/cheerio) to enable direct manipulation of DOM elements
* _json_
  - an object: `{response: data}`
  - where `param.response` is the data structure obtained by parsing the JSON response
* _js_ and _text_
  - an object: `{response: data}`
  - where `param.response` is the raw text response

For example:

```js
{
  "proxyMiddleware": [
    {
      "engine":        "text",
      "source":        "https://www.google.com/search?q=",
      "type":          "html",
      "middleware":    "function($) { const results = $('#search'); $('body').empty().append(results); $('div[jscontroller], h2, script, style').remove(); }",
      "terminal":      true
    },
    {
      "engine":        "text",
      "source":        "https://httpbin.org/ip",
      "type":          "json",
      "middleware":    "function(data) { if (data.response instanceof Object) Object.assign(data.response, {hello: 'world'}); }",
      "terminal":      true
    }
  ]
}
```

**NOTE:** All `middleware` functions that match a particular proxied request/response are called sequentially in the same order that the rules are defined. The same singular parameter is passed by reference to all, and changes to its value accumulate. Any rule can prevent further modification by adding the attribute: `{"terminal": true}`

**NOTE:** [`serve`](https://github.com/warren-bank/node-serve/tree/master/lib/serve) reads its config object from a text file containing JSON, which is validated against a schema and then parsed. Since a function isn't a valid JSON data type, `middleware` values need to be converted to string (using [`Function.prototype.toString()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString)); the [`stringify-middleware` utility](https://github.com/warren-bank/node-serve/tree/master/.etc/util) simplifies this task.

### proxyCookieJar (String)

File path to the persistent text file used by proxied redirect requests to store cookie data in JSON format.

By default, no cookie jar is used.
This option can be used to enable this feature.
If the provided file path is not an absolute path, then it is resolved relative to the current working directory.

**NOTE:** [`serve`](https://github.com/warren-bank/node-serve/tree/master/lib/serve) reads its config object from a text file containing JSON, which is validated against a schema and then parsed. If the file path for `proxyCookieJar` in this JSON file is not an absolute path, then it is resolved relative to the directory containing the JSON file.

### headers (Array)

Allows you to set custom headers (and overwrite the default ones) for certain paths:

```json
{
  "headers": [
    {
      "source" : "**/*.@(jpg|jpeg|gif|png)",
      "headers" : [{
        "key" : "Cache-Control",
        "value" : "max-age=7200"
      }]
    }, {
      "source" : "404.html",
      "headers" : [{
        "key" : "Cache-Control",
        "value" : "max-age=300"
      }]
    }
  ]
}
```

If you define the `ETag` header for a path, the handler will automatically reply with status code `304` for that path if a request comes in with a matching `If-None-Match` header.

If you set a header `value` to `null` it removes any previous defined header with the same key.

**NOTE:** The paths can only contain globs that are matched using [minimatch](https://github.com/isaacs/minimatch).

### directoryListing (Boolean|Array)

For paths are not files, but directories, the package will automatically render a good-looking list of all the files and directories contained inside that directory.

If you'd like to disable this for all paths, set this option to `false`. Furthermore, you can also restrict it to certain directory paths if you want:

```json
{
  "directoryListing": [
    "/assets/**",
    "/!assets/private"
  ]
}
```

**NOTE:** The paths can only contain globs that are matched using [minimatch](https://github.com/isaacs/minimatch).

### unlisted (Array)

In certain cases, you might not want a file or directory to appear in the directory listing. In these situations, there are two ways of solving this problem.

Either you disable the directory listing entirely (like shown [here](#directorylisting-booleanarray)), or you exclude certain paths from those listings by adding them all to this config property.

```json
{
  "unlisted": [
    ".DS_Store",
    ".git"
  ]
}
```

The items shown above are excluded from the directory listing by default.

**NOTE:** The paths can only contain globs that are matched using [minimatch](https://github.com/isaacs/minimatch).

### trailingSlash (Boolean)

By default, the package will try to make assumptions for when to add trailing slashes to your URLs or not. If you want to remove them, set this property to `false` and `true` if you want to force them on all URLs:

```js
{
  "trailingSlash": true
}
```

With the above config, a request to `/test` would now result in a redirect to `/test/`.

### renderSingle (Boolean)

Sometimes you might want to have a directory path actually render a file, if the directory only contains one. This is only useful for any files that are not `.html` files (for those, [`cleanUrls`](#cleanurls-booleanarray) is faster).

This is disabled by default and can be enabled like this:

```js
{
  "renderSingle": true
}
```

After that, if you access your directory `/test` (for example), you will see an image being rendered if the directory contains a single image file.

### symlinks (Boolean)

For security purposes, symlinks are disabled by default. If `serve-handler` encounters a symlink, it will treat it as if it doesn't exist in the first place. In turn, a 404 error is rendered for that path.

However, this behavior can easily be adjusted:

```js
{
  "symlinks": true
}
```

Once this property is set as shown above, all symlinks will automatically be resolved to their targets.

### etag (Boolean)

HTTP response headers will contain a strong [`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) response header, instead of a [`Last-Modified`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Last-Modified) header. Opt-in because calculating the hash value may be computationally expensive for large files.

Sending an `ETag` header is disabled by default and can be enabled like this:

```js
{
  "etag": true
}
```

### auth (Object)

Restrict access to visitors with [basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication) (using [basic-auth](https://github.com/jshttp/basic-auth)), which presents a username/password challenge prompt.

The required username/password combination can be configured like this:

```js
"auth": {
  "name": "required_username",
  "pass": "required_password"
}
```

### logReq (Boolean)

Printing a log of all inbound requests is disabled by default and can be enabled like this:

```js
{
  "logReq": true
}
```

### logRes (Boolean)

Printing a log of all outbound responses is disabled by default and can be enabled like this:

```js
{
  "logRes": true
}
```

## Error Templates

The handler will automatically determine the right error format if one occurs and then sends it to the client in that format.

Furthermore, this allows you to not just specifiy an error template for `404` errors, but also for all other errors that can occur (e.g. `400` or `500`).

Just add a `<status-code>.html` file to the root directory and you're good.

## Dependency Injection

If you want to replace the methods the package is using for interacting with the file system and sending responses, you can pass them as the fourth argument to the function call.

These are the methods used by the package (they can all return a `Promise` or be asynchronous):

```js
await handler(request, response, undefined, {
  lstat(path) {},
  realpath(path) {},
  createReadStream(path, config) {}
  readdir(path) {},
  sendError(absolutePath, response, acceptsJSON, root, handlers, config, error) {}
});
```

**NOTE:** It's important that – for native methods like `createReadStream` – all arguments are passed on to the native call.
