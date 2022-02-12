#!/usr/bin/env node

// Native
const fs          = require('fs');
const http        = require('http');
const https       = require('https');
const os          = require('os');
const path        = require('path');
const url         = require('url');
const {promisify} = require('util');

// Packages
const Ajv            = require('ajv');
const checkForUpdate = require('update-check');
const chalk          = require('chalk');
const arg            = require('arg');
const {write: copy}  = require('clipboardy');
const boxen          = require('boxen');
const compression    = require('compression');

// Libraries
const schema  = require('../../schemas/deployment/config-static');
const handler = require('../../serve-handler');

// Utilities
const pkg = require('../../../package');

const readFile           = promisify(fs.readFile);
const compressionHandler = promisify(compression());

const interfaces = os.networkInterfaces();

const warning = (message) => chalk`{yellow WARNING:} ${message}`;
const info    = (message) => chalk`{magenta INFO:} ${message}`;
const error   = (message) => chalk`{red ERROR:} ${message}`;

const updateCheck = async (isDebugging) => {
  let update = null;

  try {
    update = await checkForUpdate(pkg);
  }
  catch (err) {
    const suffix = isDebugging ? ':' : ' (use `--debug` to see full error)';
    console.error(warning(`Checking for updates failed${suffix}`));

    if (isDebugging) {
      console.error(err);
    }
  }

  if (!update) {
    return;
  }

  console.log(`${chalk.bgRed('UPDATE AVAILABLE')}`);
  console.log(`  "${update.latest}" is the most recent version of \`${pkg.name}\`.`);
  console.log(`  "${pkg.version  }" is the version currently in use.`);
  console.log()
};

const getHelp = () => chalk`
  {bold.cyan serve} - Static file serving and directory listing

  {bold USAGE}

    {bold $} {cyan serve} --help
    {bold $} {cyan serve} --version
    {bold $} {cyan serve} folder_name
    {bold $} {cyan serve} [-l {underline listen_uri} [-l ...]] [{underline directory}]

    By default, {cyan serve} will listen on {bold tcp:0.0.0.0:3000}
    and serve the current working directory on that address.

    Specifying a single {bold --listen} argument will overwrite the default,
    not supplement it.

  {bold OPTIONS}

    --help
        Shows this help message

    -v, --version
        Displays the current version of serve

    -l, --listen {underline listen_uri}
        Specify a URI endpoint on which to listen (see below) -
        more than one may be specified to listen in multiple places

    -p
        Specify custom port

    -s, --single
        Rewrite all not-found requests to \`index.html\`

    -d, --debug
        Show debugging information

    -c, --config
        Specify custom path to \`serve.json\`

    -n, --no-clipboard
        Do not copy the local address to the clipboard

    -u, --no-compression
        Do not compress files

    --no-etag
        Send \`Last-Modified\` header instead of \`ETag\`

    -S, --symlinks
        Resolve symlinks instead of showing 404 errors

    -C, --cors
        Enable CORS by adding the HTTP response header:
          \`Access-Control-Allow-Origin: *\`

    --no-port-switching
        Do not automatically switch to a different port number
        when the port specified is already in use

    --ssl
        Enable "automatic" SSL.
        Uses a default SSL/TLS certificate (cert/key/pass).

    --ssl-cert
        Optional path to an SSL/TLS certificate to serve with HTTPS

    --ssl-key
        Optional path to the SSL/TLS certificate\'s private key

    --ssl-pass
        Optional path to the SSL/TLS certificate\'s passphrase

    --force-https {underline listen_uri}
        Specify a URI endpoint on which to listen (see below) -
        more than one may be specified to listen in multiple places.
        These are insecure HTTP endpoints,
        which redirect all requests to the first secure HTTPS endpoint
        configured to listen on a numbered port.

  {bold ENDPOINTS}

    Listen endpoints (specified by the {bold --listen}, {bold -l}, or {bold --force-https} options above)
    instruct {cyan serve} to listen on one or more interfaces/ports,
    UNIX domain sockets, or Windows named pipes.

    For TCP ports on hostname "localhost":

      {bold $} {cyan serve} -l {underline 1234}

    For TCP (traditional host/port) endpoints:

      {bold $} {cyan serve} -l tcp://{underline hostname}:{underline 1234}

    For UNIX domain socket endpoints:

      {bold $} {cyan serve} -l unix:{underline /path/to/socket.sock}

    For Windows named pipe endpoints:

      {bold $} {cyan serve} -l pipe:\\\\.\\pipe\\{underline PipeName}
`;

const parseEndpoint = (str) => {
  if (str && !isNaN(str)) {
    return [parseInt(str, 10)];
  }

  // We cannot use `new URL` here, otherwise it will not
  // parse the host properly and it would drop support for IPv6.
  const parsed_url = url.parse(str);

  switch (parsed_url.protocol) {
    case 'pipe:': {
      // some special handling
      const cutStr = str.replace(/^pipe:/, '');

      if (cutStr.slice(0, 4) !== '\\\\.\\') {
        throw new Error(`Invalid Windows named pipe endpoint: ${str}`);
      }

      return [cutStr];
    }
    case 'unix:':
      if (!parsed_url.pathname) {
        throw new Error(`Invalid UNIX domain socket endpoint: ${str}`);
      }

      return [parsed_url.pathname];
    case 'tcp:':
      parsed_url.port = parsed_url.port || '3000';
      return [parseInt(parsed_url.port, 10), parsed_url.hostname];
    default:
      throw new Error(`Unknown --listen endpoint scheme (protocol): ${parsed_url.protocol}`);
  }
};

const registerShutdown = (fn) => {
  let run = false;

  const wrapper = () => {
    if (!run) {
      run = true;
      fn();
    }
  };

  process.on('SIGINT', wrapper);
  process.on('SIGTERM', wrapper);
  process.on('exit', wrapper);
};

const getNetworkAddress = () => {
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      const {address, family, internal} = interface;
      if (family === 'IPv4' && !internal) {
        return address;
      }
    }
  }
};

const corsHandler = (args, request, response) => {
  if (args['--cors']) {
    const origin = request.headers.origin;

    if (origin) {
      response.setHeader('access-control-allow-credentials', 'true');
    }

    response.setHeader('access-control-allow-origin',  !origin ? '*' : origin);
    response.setHeader('access-control-allow-methods', !origin ? '*' : 'GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH');
    response.setHeader('access-control-allow-headers', !origin ? '*' : 'Host, Origin, Referer, X-Requested-With, Content-Type, Accept, Range, If-None-Match');
    response.setHeader('access-control-max-age',       '600');
  }
};

const forceHTTPS = (endpoint, args) => {
  const httpMode = args['--ssl-cert'] && args['--ssl-key'] ? 'https' : 'http';
  if (httpMode === 'http') return;

  const secure_endpoint = args['--listen'].find(secure_endpoint => !isNaN(secure_endpoint[0]));
  if (!secure_endpoint) return;

  const getDefaultRedirectType = (request_method = '', methods_307 = ["POST","PUT","PATCH"]) => {
    return (methods_307.indexOf(request_method.toUpperCase()) === -1) ? 301 : 307;
  }

  const serverHandler = async (request, response) => {
    const defaultType = getDefaultRedirectType(request.method);
    let req_url;

    req_url          = url.parse(request.url);
    req_url.protocol = 'https:';
    req_url.port     = String(secure_endpoint[0]);

    req_url.hostname = ((secure_endpoint.length > 1) && (secure_endpoint[1] !== '0.0.0.0'))
      ? secure_endpoint[1]
      : request.headers.host;

    if (!req_url.hostname)
      req_url.hostname = 'localhost';

    req_url.host = `${req_url.hostname}:${req_url.port}`;
    req_url      = url.format(req_url);

    corsHandler(args, request, response);

    response.writeHead(defaultType, {
      Location: req_url
    });

    response.end();
  };

  const server = http.createServer(serverHandler);
  server.listen(...endpoint);
}

const startEndpoint = (endpoint, config, args, previous) => {
  const {isTTY} = process.stdout;
  const clipboard = args['--no-clipboard'] !== true;
  const compress = args['--no-compression'] !== true;
  const httpMode = args['--ssl-cert'] && args['--ssl-key'] ? 'https' : 'http';

  const serverHandler = async (request, response) => {
    corsHandler(args, request, response);

    if (compress) {
      await compressionHandler(request, response);
    }

    return handler(request, response, config);
  };

  const sslPass = args['--ssl-pass'];

  const server = httpMode === 'https'
    ? https.createServer(
        {
          key:        fs.readFileSync(args['--ssl-key']),
          cert:       fs.readFileSync(args['--ssl-cert']),
          passphrase: sslPass ? fs.readFileSync(sslPass, 'utf8') : ''
        },
        serverHandler
      )
    : http.createServer(serverHandler);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && endpoint.length === 1 && !isNaN(endpoint[0]) && args['--no-port-switching'] !== true) {
      startEndpoint([0], config, args, endpoint[0]);
      return;
    }

    console.error(error(`Failed to serve: ${err.stack}`));
    process.exit(1);
  });

  server.listen(...endpoint, async () => {
    const details = server.address();
    registerShutdown(() => server.close());

    let localAddress = null;
    let networkAddress = null;

    if (typeof details === 'string') {
      localAddress = details;
    }
    else if (typeof details === 'object' && details.port) {
      const address = details.address === '::' ? 'localhost' : details.address;
      const ip = getNetworkAddress();

      localAddress = `${httpMode}://${address}:${details.port}`;
      networkAddress = ip ? `${httpMode}://${ip}:${details.port}` : null;
    }

    if (isTTY && process.env.NODE_ENV !== 'production') {
      let message = chalk.green('Serving!');

      if (localAddress) {
        const prefix = networkAddress ? '- ' : '';
        const space = networkAddress ? '            ' : '  ';

        message += `\n\n${chalk.bold(`${prefix}Local:`)}${space}${localAddress}`;
      }

      if (networkAddress) {
        message += `\n${chalk.bold('- On Your Network:')}  ${networkAddress}`;
      }

      if (previous) {
        message += chalk.red(`\n\nThis port was picked because ${chalk.underline(previous)} is in use.`);
      }

      if (clipboard) {
        try {
          await copy(localAddress);
          message += `\n\n${chalk.grey('Copied local address to clipboard!')}`;
        }
        catch (err) {
          console.error(error(`Cannot copy to clipboard: ${err.message}`));
        }
      }

      console.log(boxen(message, {
        padding: 1,
        borderColor: 'green',
        margin: 1
      }));
    }
    else {
      const suffix = localAddress ? ` at ${localAddress}` : '';
      console.log(info(`Accepting connections${suffix}`));
    }
  });
};

const reviveConfig = (key, value) => {
  if (key !== 'middleware')      return value
  if (typeof value !== 'string') return value

  let val = value.trim()
  if ((val.substring(0,9) !== 'function(') || (val.substring(val.length - 1, val.length) !== '}')) return value

  try {
    val = eval('(' + val + ')')
    if (typeof val !== 'function') throw ''
  }
  catch(e) {return value}

  return val
}

const loadConfig = async (entry, args) => {
  const files = [
    'serve.json',
    'now.json',
    'package.json'
  ];

  if (args['--config']) {
    files.unshift(args['--config']);
  }

  let config      = {};
  let config_file = null;

  for (const file of files) {
    const location = path.resolve(entry, file);
    let content = null;

    try {
      content = await readFile(location, 'utf8');
    }
    catch (err) {
      if (err.code === 'ENOENT') {
        continue;
      }

      console.error(error(`Not able to read ${location}: ${err.message}`));
      process.exit(1);
    }

    try {
      content = JSON.parse(content, reviveConfig);
    }
    catch (err) {
      console.error(error(`Could not parse ${location} as JSON: ${err.message}`));
      process.exit(1);
    }

    if (typeof content !== 'object') {
      console.error(warning(`Didn't find a valid object in ${location}. Skipping...`));
      continue;
    }

    try {
      switch (file) {
        case 'now.json':
          content = content.static;
          break;
        case 'package.json':
          content = content.now.static;
          break;
      }
    }
    catch (err) {
      continue;
    }

    config      = content
    config_file = location

    if (file === 'now.json' || file === 'package.json') {
      console.error(warning('The config files `now.json` and `package.json` are deprecated. Please use `serve.json`.'));
    }

    break;
  }

  if (config_file) {
    console.log(info(`Configuration loaded from file:\n  ${config_file}`));

    // ---------------------------------
    // resolve "proxyCookieJar" filepath relative to directory containing the config file; no effect on absolute filepath.
    // ---------------------------------
    if (config.proxyCookieJar) {
      const config_dir = path.dirname(config_file)
      config.proxyCookieJar = path.resolve(config_dir, config.proxyCookieJar)
    }
  }

  // -----------------------------------
  // resolve "public" dirpath relative to entry; no effect on absolute filepath.
  //   notes:
  //    * it is an edge case to hard-code "public" in JSON config file
  //   example use case:
  //    * directory hierarchy:
  //        /path/to/entry/
  //        /path/to/entry/serve.json
  //        /path/to/entry/www-root/
  //    * config.public = "www-root"
  //    * command-line:
  //        serve /path/to/entry
  // -----------------------------------
  config.public = config.public ? path.resolve(entry, config.public) : entry

  // -----------------------------------
  // apply command-line flags to override values in config file..
  // -----------------------------------

  // -----------------------------------
  // "ETag" headers are enabled by default
  // -----------------------------------
  config.etag = args['--no-etag']
    ? false
    : (typeof config.etag === 'boolean')
      ? config.etag
      : true

  // -----------------------------------
  // rewrite all requests to load a single page: "/index.html"
  // -----------------------------------
  if (args['--single']) {
    const existingRewrites = Array.isArray(config.rewrites) ? config.rewrites : [];

    config.rewrites = [{
      engine:      'glob',
      source:      '**',
      destination: '/index.html',
      terminal:    true
    }, ...existingRewrites];
  }

  // -----------------------------------
  // resolve symlinks and Windows shortcuts
  // -----------------------------------
  if (args['--symlinks']) {
    config.symlinks = true;
  }

  if (Object.keys(config).length !== 0) {
    const ajv = new Ajv({allowUnionTypes: true});
    const validateSchema = ajv.compile(schema);

    if (!validateSchema(config)) {
      const defaultMessage = error('The configuration you provided is wrong:');
      const {message, params} = validateSchema.errors[0];

      console.error(`${defaultMessage}\n${message}\n${JSON.stringify(params)}`);
      process.exit(1);
    }
  }

  return config;
};

(async () => {
  let args = null;

  try {
    args = arg({
      '--help':              Boolean,
      '--version':           Boolean,
      '--listen':            [parseEndpoint],
      '--single':            Boolean,
      '--debug':             Boolean,
      '--config':            String,
      '--no-clipboard':      Boolean,
      '--no-compression':    Boolean,
      '--no-etag':           Boolean,
      '--symlinks':          Boolean,
      '--cors':              Boolean,
      '--no-port-switching': Boolean,
      '--ssl':               Boolean,
      '--ssl-cert':          String,
      '--ssl-key':           String,
      '--ssl-pass':          String,
      '--force-https':       [parseEndpoint],

      '-h': '--help',
      '-v': '--version',
      '-l': '--listen',
      '-s': '--single',
      '-d': '--debug',
      '-c': '--config',
      '-n': '--no-clipboard',
      '-u': '--no-compression',
      '-S': '--symlinks',
      '-C': '--cors',

      // deprecated, maintained for backwards-compatibility
      '-p': '--listen'
    });
  }
  catch (err) {
    console.error(error(err.message));
    process.exit(1);
  }

  if (args['--ssl']) {
    if (!(args['--ssl-cert'] && args['--ssl-key'])) {
      const cert_dirpath = path.resolve(__dirname, '../../..', '.etc/bin/https/cert');

      args['--ssl-cert'] = path.join(cert_dirpath, 'cert.pem');
      args['--ssl-key']  = path.join(cert_dirpath, 'key.pem');
      args['--ssl-pass'] = path.join(cert_dirpath, 'pass.phrase');
    }
  }

  if (process.env.NO_UPDATE_CHECK !== '1') {
    await updateCheck(args['--debug']);
  }

  if (args['--version']) {
    console.log(pkg.version);
    return;
  }

  if (args['--help']) {
    console.log(getHelp());
    return;
  }

  if (!args['--listen'] || !args['--listen'].length) {
    // Default endpoint
    let port = 3000;
    if (process.env.PORT && !isNaN(process.env.PORT)) {
      port = parseInt(process.env.PORT, 10);
    }
    args['--listen'] = [[port]];
  }

  if (args._.length > 1) {
    console.error(error('Please provide one path argument at maximum'));
    process.exit(1);
  }

  const entry  = args._.length > 0 ? path.resolve(args._[0]) : process.cwd();
  const config = await loadConfig(entry, args);

  for (const endpoint of args['--listen']) {
    startEndpoint(endpoint, config, args);
  }

  if (args['--force-https'] && args['--force-https'].length) {
    for (const endpoint of args['--force-https']) {
      forceHTTPS(endpoint, args);
    }
  }

  registerShutdown(() => {
    console.log(`\n${info('Gracefully shutting down. Please wait...')}`);

    process.on('SIGINT', () => {
      console.log(`\n${warning('Force-closing all open sockets...')}`);
      process.exit(0);
    });
  });
})();
