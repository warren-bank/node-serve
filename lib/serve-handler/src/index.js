// Native
const {Buffer}     = require('buffer')
const {createHash} = require('crypto')
const fs           = require('fs')
const path         = require('path')
const url_parse    = require('url').parse
const {promisify}  = require('util')

// Packages
const lnk                = require('@recent-cli/resolve-lnk')
const http_client        = require('@warren-bank/node-request')
const auth               = require('basic-auth')
const bytes              = require('bytes')
const contentDisposition = require('content-disposition')
const destroy            = require('destroy')
const url                = require('fast-url-parser')
const mime               = require('mime-types')
const minimatch          = require('minimatch')
const onFinished         = require('on-finished')
const parseRange         = require('range-parser')

// Other
const directoryTemplate  = require('./directory')
const errorTemplate      = require('./error')
const slasher            = require('./glob-slash')
const {process_rewrite_rules, process_redirect_rules, rewrite_path} = require('./rewrite-path')

const etags = new Map()

const calculateSha = (handlers, absolutePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha1')
    hash.update(path.extname(absolutePath))
    hash.update('-')
    const rs = handlers.createReadStream(absolutePath)
    rs.on('error', reject)
    rs.on('data', buf => hash.update(buf))
    rs.on('end', () => {
      const sha = hash.digest('hex')
      resolve(sha)
    })
  })

const ensureSlashStart = target => (target.startsWith('/') ? target : `/${target}`)

const shouldRedirect = (encoded_path, config, cleanUrl) => {
  const {redirects, trailingSlash} = config
  const slashing     = typeof trailingSlash === 'boolean'
  const defaultType  = 301
  const matchHTML    = /(?:\/index)?\.html$/ig
  let new_path, result

  result = null

  if ((!Array.isArray(redirects) || (redirects.length === 0)) && !slashing && !cleanUrl) {
    return result
  }

  if (!result && cleanUrl && matchHTML.test(encoded_path)) {
    new_path = encoded_path.replace(matchHTML, '')
    new_path = new_path.replace(/[\/]{2,}/g, '/')

    result = {
      target:        ensureSlashStart(new_path),
      statusCode:    defaultType,
      preserveQuery: true,
      preserveHash:  true,
      proxy:         false
    }
  }

  if (!result && slashing) {
    const {ext, name} = path.parse(encoded_path)
    const isTrailed   = encoded_path.endsWith('/')
    const isDotfile   = name.startsWith('.')

    if (!trailingSlash && isTrailed) {
      new_path = encoded_path.slice(0, -1)
    }
    else if (trailingSlash && !isTrailed && !ext && !isDotfile) {
      new_path = encoded_path + '/'
    }

    if (new_path) {
      new_path = new_path.replace(/[\/]{2,}/g, '/')

      result = {
        target:        ensureSlashStart(new_path),
        statusCode:    defaultType,
        preserveQuery: true,
        preserveHash:  true,
        proxy:         false
      }
    }
  }

  if (!result) {
    result = process_redirect_rules(encoded_path, /* rules= */ redirects, /* allow_recursion= */ true, defaultType)
  }

  return result
}

const appendHeaders = (target, source) => {
  for (let index = 0; index < source.length; index++) {
    const {key, value} = source[index]
    target[key] = value
  }
}

const getHeaders = async (handlers, config, current, absolutePath, stats) => {
  const {headers: customHeaders = [], etag = false} = config
  const related      = {}
  const {base}       = path.parse(absolutePath)
  const relativePath = slasher(path.relative(current, absolutePath))

  if (customHeaders.length > 0) {
    // By iterating over all headers and never stopping, developers
    // can specify multiple header sources in the config that
    // might match a single path.
    for (let index = 0; index < customHeaders.length; index++) {
      const {source, headers} = customHeaders[index]

      if (minimatch(relativePath, source)) {
        appendHeaders(related, headers)
      }
    }
  }

  let defaultHeaders = {}

  if (stats) {
    defaultHeaders = {
      'Content-Length': stats.size,
      // Default to "inline", which always tries to render in the browser,
      // if that's not working, it will save the file. But to be clear: This
      // only happens if it cannot find a appropiate value.
      'Content-Disposition': contentDisposition(base, {
        type: 'inline'
      }),
      'Accept-Ranges': 'bytes'
    }

    if (etag) {
      let [mtime, sha] = etags.get(absolutePath) || []
      if (Number(mtime) !== Number(stats.mtime)) {
        sha = await calculateSha(handlers, absolutePath)
        etags.set(absolutePath, [stats.mtime, sha])
      }
      defaultHeaders['ETag'] = `W/"${sha}"`
    }
    else {
      defaultHeaders['Last-Modified'] = stats.mtime.toUTCString()
    }

    const contentType = mime.contentType(base)

    if (contentType) {
      defaultHeaders['Content-Type'] = contentType
    }
  }

  const headers = Object.assign(defaultHeaders, related)

  for (const key in headers) {
    if (headers.hasOwnProperty(key) && headers[key] === null) {
      delete headers[key]
    }
  }

  return headers
}

const applicable = (decodedPath, configEntry) => {
  if (typeof configEntry === 'boolean') {
    return configEntry
  }

  if (Array.isArray(configEntry)) {
    for (let index = 0; index < configEntry.length; index++) {
      const source = configEntry[index]

      if (minimatch(decodedPath, source)) {
        return true
      }
    }

    return false
  }

  return true
}

const getPossiblePaths = (relativePath, extension) => [
  path.join(relativePath, `index${extension}`),
  relativePath.endsWith('/') ? relativePath.replace(/\/$/g, extension) : (relativePath + extension)
].filter(item => path.basename(item) !== extension)

const findRelated = async (current, relativePath, rewrittenPath, originalStat) => {
  const possible = rewrittenPath ? [rewrittenPath] : getPossiblePaths(relativePath, '.html')

  let stats = null

  for (let index = 0; index < possible.length; index++) {
    const related = possible[index]
    const absolutePath = path.join(current, related)

    try {
      stats = await originalStat(absolutePath)
    }
    catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        throw err
      }
    }

    if (stats) {
      return {
        stats,
        absolutePath
      }
    }
  }

  return null
}

const canBeListed = (excluded, file) => {
  const slashed = slasher(file)
  let whether = true

  for (let mark = 0; mark < excluded.length; mark++) {
    const source = excluded[mark]

    if (minimatch(slashed, source)) {
      whether = false
      break
    }
  }

  return whether
}

const renderDirectory = async (acceptsJSON, handlers, methods, config, paths) => {
  const {directoryListing, trailingSlash, unlisted = [], renderSingle} = config
  const slashSuffix             = (typeof trailingSlash === 'boolean') ? (trailingSlash ? '/' : '') : '/'
  const {relativePath}          = paths.virtual
  const {current, absolutePath} = paths.real

  const excluded = [
    '.DS_Store',
    '.git',
    ...unlisted
  ]

  if (!applicable(relativePath, directoryListing) && !renderSingle) {
    return {}
  }

  let files = await handlers.readdir(absolutePath)

  const canRenderSingle = renderSingle && (files.length === 1)

  for (let index = 0; index < files.length; index++) {
    const file    = files[index]
    const details = path.parse(file)
    let filePath  = path.resolve(absolutePath, file)

    details.relative = path.posix.join(relativePath, details.base)

    let stats
    try {
      stats = await handlers.lstat(filePath)

      const file_paths = {
        virtual: {relativePath: details.base},
        real:    {current:      absolutePath}
      }

      await processSymLinks(file_paths, handlers)

      if (file_paths.real.isSymLink) {
        // conditionally ignore
        if (!config.symlinks) {
          throw 'excluded'
        }

        // prevent display of .lnk file extension
        if (details.base.lastIndexOf('.lnk') === details.base.length - 4) {
          details.base = details.base.substring(0, details.base.length - 4)
        }

        filePath = file_paths.real.absolutePath
        stats    = file_paths.real.stats
      }

      if (!stats.isDirectory() && canRenderSingle) {
        paths.virtual.relativePath = details.relative
        paths.real.absolutePath    = filePath
        paths.real.stats           = stats
        paths.real.isSymLink       = file_paths.real.isSymLink

        return {singleFile: true}
      }
    }
    catch(err) {
      continue
    }

    details.stats = {
      mtime: (new Date(stats.mtimeMs)).toLocaleString([], {month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true})
    }

    if (stats.isDirectory()) {
      details.base += slashSuffix
      details.relative += slashSuffix
      details.type = 'folder'
    }
    else {
      details.ext = details.ext.split('.')[1] || 'txt'
      details.type = 'file'

      details.stats.size = bytes(stats.size, {
        unitSeparator: ' ',
        decimalPlaces: 2,
        fixedDecimals: true
      })
    }

    details.title = details.base

    if (canBeListed(excluded, file)) {
      files[index] = details
    }
    else {
      delete files[index]
    }
  }

  const toRoot    = relativePath.split('/').filter(dir => !!dir).join(path.sep)
  const directory = path.join(path.basename(current), toRoot, slashSuffix)
  const pathParts = directory.split(path.sep).filter(Boolean)

  // Sort to list directories first, then sort alphabetically
  files = files.sort((a, b) => {
    const aIsDir = a.type === 'folder'
    const bIsDir = b.type === 'folder'

    // ignore case
    const aName  = a.base.toLowerCase()
    const bName  = b.base.toLowerCase()

    /* istanbul ignore next */
    if (aIsDir && !bIsDir) {
      return -1
    }

    if ((bIsDir && !aIsDir) || (aName > bName)) {
      return 1
    }

    /* istanbul ignore next */
    if (aName < bName) {
      return -1
    }

    /* istanbul ignore next */
    return 0
  }).filter(Boolean)

  // Add parent folder to the head of the sorted files array
  if (toRoot.length > 0) {
    const directoryPath = [...pathParts].slice(1)
    let relative = path.posix.join('/', ...directoryPath, '..', slashSuffix)

    files.unshift({
      type: 'folder',
      base: '..',
      relative,
      title: relative,
      ext: ''
    })
  }

  const subPaths = []

  for (let index = 0; index < pathParts.length; index++) {
    const parents = []
    const isLast = index === (pathParts.length - 1)

    let before = 0

    while (before <= index) {
      parents.push(pathParts[before])
      before++
    }

    parents.shift()

    subPaths.push({
      name: pathParts[index] + (isLast ? slashSuffix : '/'),
      url: index === 0 ? '' : parents.join('/') + slashSuffix
    })
  }

  const spec = {
    files,
    directory,
    paths: subPaths
  }

  const output = acceptsJSON ? JSON.stringify(spec, null, 4) : directoryTemplate(spec)

  return {directory: output}
}

const getError = (val=400) => {
  let error, statusCode, err
  error = null

  if (val instanceof Error) {
    statusCode = 500
    err        = val
  }
  else if (typeof val === 'number') {
    statusCode = val
    err        = null
  }

  if (!statusCode) return error

  switch(statusCode) {
    case 400:
      error = {
        statusCode,
        code:       'bad_request',
        message:    'Bad Request'
      }
      break

    case 401:
      error = {
        statusCode,
        code:       'access_denied',
        message:    'Access Denied'
      }
      break

    case 404:
      error = {
        statusCode,
        code:       'not_found',
        message:    'The requested path could not be found'
      }
      break

    case 500:
      error = {
        statusCode,
        code:       'internal_server_error',
        message:    'A server error has occurred'
      }
      break

    case 502:
      error = {
        statusCode,
        code:       'bad_gateway',
        message:    'Bad Gateway for proxy redirect'
      }
      break
  }

  if (error && err) {
    error.err = err
  }

  return error
}

const sendError = async (absolutePath, response, acceptsJSON, current, handlers, config, spec) => {
  const {err: original, message, code, statusCode} = spec

  /* istanbul ignore next */
  if (original && process.env.NODE_ENV !== 'test') {
    console.error(original)
  }

  response.statusCode = statusCode

  if (acceptsJSON) {
    response.setHeader('Content-Type', 'application/json; charset=utf-8')

    response.end(JSON.stringify({
      error: {
        code,
        message
      }
    }))

    return
  }

  let stats = null

  const errorPage = path.join(current, `${statusCode}.html`)

  try {
    stats = await handlers.lstat(errorPage)
  }
  catch (err) {
    if (err.code !== 'ENOENT') {
      console.error(err)
    }
  }

  if (stats) {
    let stream = null

    try {
      stream = await handlers.createReadStream(errorPage)

      const headers = await getHeaders(handlers, config, current, errorPage, stats)

      response.writeHead(statusCode, headers)
      stream.pipe(response)

      return
    }
    catch (err) {
      console.error(err)
    }
  }

  const headers = await getHeaders(handlers, config, current, absolutePath, null)
  headers['Content-Type'] = 'text/html; charset=utf-8'

  response.writeHead(statusCode, headers)
  response.end(errorTemplate({statusCode, message}))
}

const getHandlers = methods => Object.assign({
  lstat: promisify(fs.lstat),
  realpath: promisify(fs.realpath),
  readdir: promisify(fs.readdir),
  createReadStream: fs.createReadStream,
  sendError
}, methods)

const processSymLinks = async (paths, handlers) => {
  const parts = (paths.virtual.rewrittenPath || paths.virtual.relativePath).split('/').filter(dir => !!dir)
  let current_dir, absolutePath, stats

  if (!parts.length)
    return paths

  if (paths.real.stats) {
    // short-circuit: only need to process last component in virtual filepath
    current_dir = parts.length - 1

    absolutePath = (parts.length === 1)
      ? paths.real.current
      : path.join(paths.real.current, ...parts.slice(0, parts.length - 2))
  }
  else {
    current_dir  = 0
    absolutePath = paths.real.current
  }

  for (; current_dir < parts.length; current_dir++) {
    absolutePath = path.join(absolutePath, parts[current_dir])

    try {
      stats = await handlers.lstat(absolutePath)
    }
    catch (err) {
      stats = null
    }

    // stop walking the directory tree; hit a dead end.
    if (!stats)
      return paths

    if (stats.isSymbolicLink()) {
      paths.real.isSymLink = true
      absolutePath = await handlers.realpath(absolutePath)
    }
    else if (stats.isFile() && (process.platform === 'win32') && (path.extname(absolutePath) === '.lnk')) {
      paths.real.isSymLink = true
      absolutePath = await lnk.resolve(absolutePath)
    }
  }

  if (paths.real.isSymLink) {
    try {
      stats = await handlers.lstat(absolutePath)

      paths.real.absolutePath = absolutePath
      paths.real.stats        = stats
    }
    catch (err) {
      stats = null
    }
  }
}

const getPaths = async (request, config, handlers) => {
  const paths = {
    virtual: {
      originalPath:  null,
      relativePath:  null,
      rewrittenPath: null
    },
    real: {
      current:       null,
      absolutePath:  null,
      stats:         null,
      isSymLink:     false
    },
    redirect:        null
  }

  const cwd = process.cwd()
  paths.real.current = config.public ? path.resolve(cwd, config.public) : cwd

  try {
    const parsed_url = url.parse(request.url)

    paths.virtual.originalPath  = parsed_url.pathname
    paths.virtual.relativePath  = decodeURIComponent(paths.virtual.originalPath)
    paths.virtual.rewrittenPath = process_rewrite_rules(paths.virtual.originalPath, /* rules= */ config.rewrites, /* allow_recursion= */ true)
  }
  catch (err) {
    return {paths, error: getError()}
  }

  paths.real.absolutePath = path.join(paths.real.current, paths.virtual.rewrittenPath || paths.virtual.relativePath)

  const cleanUrl = applicable(paths.virtual.relativePath, config.cleanUrls)
  paths.redirect = shouldRedirect(paths.virtual.originalPath, config, cleanUrl)

  if (paths.redirect) {
    return {paths, error: null}
  }

  if (config.symlinks)
    await processSymLinks(paths, handlers)

  if (!paths.real.stats) {
    // It's extremely important that we're doing multiple stat calls. This one
    // right here could technically be removed, but then the program
    // would be slower. Because for directories, we always want to see if a related file
    // exists and then (after that), fetch the directory itself if no
    // related file was found. However (for files, of which most have extensions), we should
    // always stat right away.
    //
    // When simulating a file system without directory indexes, calculating whether a
    // directory exists requires loading all the file paths and then checking if
    // one of them includes the path of the directory. As that's a very
    // performance-expensive thing to do, we need to ensure it's not happening if not really necessary.

    if (path.extname(paths.real.absolutePath) !== '') {
      try {
        paths.real.stats = await handlers.lstat(paths.real.absolutePath)
      }
      catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          return {paths, error: getError(err)}
        }
      }
    }
  }

  if (!paths.real.stats) {
    if (cleanUrl || paths.virtual.rewrittenPath) {
      try {
        const related = await findRelated(paths.real.current, paths.virtual.relativePath, paths.virtual.rewrittenPath, handlers.lstat)

        if (related) {
          paths.real.absolutePath = related.absolutePath
          paths.real.stats        = related.stats
        }
      }
      catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
          return {paths, error: getError(err)}
        }
      }
    }
  }

  if (!paths.real.stats && paths.real.absolutePath) {
    try {
      paths.real.stats = await handlers.lstat(paths.real.absolutePath)
    }
    catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
        return {paths, error: getError(err)}
      }
    }
  }

  return {paths, error: null}
}

const copyRequestData = (request, methods) => {
  return new Promise((resolve, reject) => {
    // restrict copying of data to only certain request methods (ex: ["POST","PUT"])
    if (Array.isArray(methods) && methods.length) {
      let method = (request.method || '').toUpperCase()
      if (methods.indexOf(method) === -1) resolve('')
    }

    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      resolve(chunks.length ? Buffer.concat(chunks) : '')
    })
  })
}

const serve_handler = async (request, response, config = {}, methods = {}) => {
  const handlers       = getHandlers(methods)
  const {paths, error} = await getPaths(request, config, handlers)

  let acceptsJSON = null
  if (request.headers.accept) {
    acceptsJSON = request.headers.accept.includes('application/json')
  }

  const process_error = error => {
    if (error instanceof Object)
      sendError(paths.real.absolutePath || '/', response, acceptsJSON, paths.real.current, handlers, config, error)
  }

  if (error) {
    return process_error(error)
  }

  if (paths.redirect) {
    // conditionally preserve search and hash
    let req_url, req_search, req_hash

    if (paths.redirect.preserveQuery || paths.redirect.preserveHash) {
      req_url = url.parse(request.url)
    }

    req_search = (paths.redirect.preserveQuery && req_url.search) ? req_url.search : ''
    req_hash   = (paths.redirect.preserveHash  && req_url.hash)   ? req_url.hash   : ''
    req_url    = paths.redirect.target + req_search + req_hash

    if (paths.redirect.proxy && (req_url.substring(0, 4).toLowerCase() === 'http')) {
      const proxy_request = {
        options: Object.assign(
          {
            headers: request.headers || {},
            method:  request.method  || 'GET'
          },
          url_parse(req_url)
        ),
        config: {
          binary: true,
          stream: true
        }
      }

      proxy_request.POST_data = await copyRequestData(request, ["POST","PUT"])

      try {
        // monkey patch "paths" to obtain relevant response headers
        paths.real.current      = '/'
        paths.real.absolutePath = paths.virtual.relativePath
        paths.real.stats        = null

        const data = await http_client.request(proxy_request.options, proxy_request.POST_data, proxy_request.config)

        const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)
        for (const key in headers) {
          response.setHeader(key, headers[key])
        }

        const stream = data.response
        stream.pipe(response)
      }
      catch(err) {
        process_error(getError(502))
      }
    }
    else {
      response.writeHead(paths.redirect.statusCode, {
        Location: req_url
      })

      response.end()
    }
    return
  }

  // Basic Authentication
  if (config.auth) {
    if ((config.auth instanceof Object) && config.auth.name && config.auth.pass) {
      const credentials = auth(request)

      if (!credentials || !(credentials instanceof Object) || (credentials.name !== config.auth.name) || (credentials.pass !== config.auth.pass)) {
        response.setHeader('WWW-Authenticate', 'Basic realm="User Visible Realm"')

        return process_error(getError(401))
      }
    }
    else {
      const err = new Error('Basic Authentication is enabled, but "config.auth" is not correctly configured')

      return process_error(getError(err))
    }
  }

  if (paths.real.stats && paths.real.stats.isDirectory()) {
    let directory = null
    let singleFile = null

    try {
      const related = await renderDirectory(acceptsJSON, handlers, methods, config, paths)

      if (related.singleFile) {
        singleFile = related.singleFile
      }
      else {
        directory = related.directory
      }
    }
    catch (err) {
      if (err.code !== 'ENOENT') {
        return process_error(getError(err))
      }
    }

    if (directory) {
      const contentType = acceptsJSON ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'

      response.statusCode = 200
      response.setHeader('Content-Type', contentType)
      response.end(directory)

      return
    }

    if (!singleFile) {
      // The directory listing is disabled, so we want to render a 404 error.
      paths.real.stats = null
    }
  }

  // There are two scenarios in which we want to reply with
  // a 404 error: Either the path does not exist, or it is a
  // symlink while the `symlinks` option is disabled (which it is by default).
  if (!paths.real.stats) {
    // allow for custom 404 handling
    return process_error(getError(404))
  }

  const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)

  if (!request.headers.range && headers.ETag && (headers.ETag === request.headers['if-none-match'])) {
    response.statusCode = 304
    response.end()

    return
  }

  const streamOpts = {}

  // TODO ? if-range
  if (request.headers.range && paths.real.stats.size) {
    const range = parseRange(paths.real.stats.size, request.headers.range)

    if (typeof range === 'object' && range.type === 'bytes') {
      const {start, end} = range[0]

      streamOpts.start = start
      streamOpts.end   = end

      response.statusCode = 206
    }
    else {
      response.statusCode = 416
      response.setHeader('Content-Range', `bytes */${paths.real.stats.size}`)
    }
  }

  // TODO ? multiple ranges

  let stream = null

  try {
    stream = await handlers.createReadStream(paths.real.absolutePath, streamOpts)

    onFinished(response, () => {
      destroy(stream)
    })
  }
  catch (err) {
    return process_error(getError(err))
  }

  // eslint-disable-next-line no-undefined
  if (streamOpts.start !== undefined && streamOpts.end !== undefined) {
    headers['Content-Range'] = `bytes ${streamOpts.start}-${streamOpts.end}/${paths.real.stats.size}`
    headers['Content-Length'] = streamOpts.end - streamOpts.start + 1
  }

  response.writeHead(response.statusCode || 200, headers)
  stream.pipe(response)
}

const format_headers = (headers, indent=`\n    `) => {
  if (!(headers instanceof Object)) return ''

  const keys = Object.keys(headers)
  if (!keys.length) return ''

  return `${indent}${keys.map(name => `${name}: ${(typeof headers[name] === 'string') ? headers[name] : JSON.stringify(headers[name])}`).join(indent)}`
}

const logging_serve_handler = async (request, response, config = {}, methods = {}) => {
  if (config.logReq) {
    let headers = request.headers

    console.log(`
request:
  method: ${request.method || ''}
  path:   ${request.url    || ''}
  headers:${format_headers(headers)}
`)
  }

  const result = await serve_handler(request, response, config, methods)

  if (config.logRes) {
    /*
     * https://nodejs.org/api/http.html#responsegetheaders
     *   response.getHeaders() returns an object that does not prototypically inherit from the JavaScript Object
     */
    let headers = Object.assign({}, response.getHeaders())

    console.log(`
response:
  status: ${response.statusCode || ''} ${response.statusMessage || ''}
  headers:${format_headers(headers)}
`)
  }

  return result
}

module.exports = logging_serve_handler
