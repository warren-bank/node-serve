// Native
const {Buffer}      = require('buffer')
const {createHash}  = require('crypto')
const fs            = require('fs')
const path          = require('path')
const url_parse     = require('url').parse
const {promisify}   = require('util')

// Packages
const lnk                = require('@recent-cli/resolve-lnk')
const http_client        = require('@warren-bank/node-request')
const auth               = require('basic-auth')
const bytes              = require('bytes')
const cheerio            = require('cheerio')
const contentDisposition = require('content-disposition')
const destroy            = require('destroy')
const url                = require('fast-url-parser')
const mime               = require('mime-types')
const minimatch          = require('minimatch')
const onFinished         = require('on-finished')
const parseRange         = require('range-parser')
const dataUri            = require('strong-data-uri')

// Other
const {process_exec}      = require('./child-process')
const {minimatch_options} = require('./constants')
const directoryTemplate   = require('./directory')
const errorTemplate       = require('./error')
const {slasher}           = require('./glob-slash')
const {process_rewrite_rules, process_redirect_rules}  = require('./rewrite-path')
const {process_middleware_rules, process_cgibin_rules} = require('./test-path')

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

const ensureSlashStart = (target, slash='/') => (target.startsWith(slash) ? target : `${slash}${target}`)

const ensureSlashEnd = (target, slash='/') => (target.endsWith(slash) ? target : `${target}${slash}`)

const ensureNoSlashEnd = (target, slash='/') => {
  while (target.endsWith(slash))
    target = target.slice(0, -slash.length)
  return target
}

const replaceAll = (haystack, needle, replacement) => {
  if (replacement.indexOf(needle) === -1) {
    while (haystack.indexOf(needle) >= 0) {
      haystack = haystack.replace(needle, replacement)
    }
  }
  return haystack
}

const getDefaultRedirectType = (req_method = '', req_methods_307 = ["POST","PUT","PATCH"]) => {
  return (req_methods_307.indexOf(req_method.toUpperCase()) === -1) ? 301 : 307
}

const shouldRedirect = (encoded_path, config, cleanUrl, defaultType = 301) => {
  const {redirects, trailingSlash} = config
  const slashing     = typeof trailingSlash === 'boolean'
  const matchHTML    = /(?:\/index)?\.html?$/ig
  let new_path, result

  result = null

  if ((!Array.isArray(redirects) || (redirects.length === 0)) && !slashing && !cleanUrl) {
    return result
  }

  if (!result) {
    result = process_redirect_rules(encoded_path, /* rules= */ redirects, /* allow_recursion= */ true, defaultType)
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
      new_path = ensureNoSlashEnd(encoded_path)
    }
    else if (trailingSlash && !isTrailed && !ext && !isDotfile) {
      new_path = ensureSlashEnd(encoded_path)
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

  return result
}

const appendHeaders = (target, source) => {
  for (let index = 0; index < source.length; index++) {
    const {key, value} = source[index]
    target[key.toLowerCase()] = value
  }
}

const getHeaders = async (handlers, config, current, absolutePath, stats) => {
  const {headers: allCustomHeaders = [], etag = false} = config
  const relativePath = slasher(path.relative(current, absolutePath))
  const {base}       = path.parse(absolutePath)
  const headers      = {}

  if (allCustomHeaders.length > 0) {
    for (let index = 0; index < allCustomHeaders.length; index++) {
      const {source, headers: someCustomHeaders} = allCustomHeaders[index]

      if (minimatch(relativePath, source, minimatch_options)) {
        appendHeaders(headers, someCustomHeaders)
      }
    }
  }

  if (stats) {
    if (headers['content-length'] === undefined)
      headers['content-length'] = String(stats.size)

    if (headers['last-modified'] === undefined)
      headers['last-modified'] = stats.mtime.toUTCString()

    if (headers['content-disposition'] === undefined)
      headers['content-disposition'] = contentDisposition(base, {type: 'inline'})  // render in browser if possible, save download if required

    if (headers['accept-ranges'] === undefined)
      headers['accept-ranges'] = 'bytes'

    if (etag && (headers['etag'] === undefined)) {
      let [mtime, sha] = etags.get(absolutePath) || []
      if (Number(mtime) !== Number(stats.mtime)) {
        sha = await calculateSha(handlers, absolutePath)
        etags.set(absolutePath, [stats.mtime, sha])
      }
      headers['etag'] = `W/"${sha}"`
    }

    if (headers['content-type'] === undefined) {
      const contentType = mime.contentType(base)

      if (contentType) {
        headers['content-type'] = contentType
      }
    }
  }

  for (const key in headers) {
    if (headers.hasOwnProperty(key) && headers[key] === null) {
      delete headers[key]
    }
  }

  return headers
}

const applicable = (decodedPath, configEntry, defaultValue=true) => {
  if (typeof configEntry === 'boolean') {
    return configEntry
  }

  if (Array.isArray(configEntry)) {
    for (let index = 0; index < configEntry.length; index++) {
      const source = configEntry[index]

      if (minimatch(decodedPath, source, minimatch_options)) {
        return true
      }
    }

    return false
  }

  return defaultValue
}

const findRelated = async (paths, handlers, config) => {
  const possible = []

  if (paths.real.stats && paths.real.stats.isDirectory()) {
    possible.push(
      path.join(paths.real.absolutePath, 'index.htm' ),
      path.join(paths.real.absolutePath, 'index.html')
    )
  }
  else {
    let relativePath, dirname, filename, absolutePath

    relativePath = ensureNoSlashEnd(paths.virtual.rewrittenPath || paths.virtual.relativePath)
    dirname      = path.dirname(relativePath)
    filename     = path.basename(relativePath)
    absolutePath = path.join(paths.real.current, dirname)

    if (config.symlinks) {
      const file_paths = {
        virtual: {relativePath: dirname},
        real:    {current:      paths.real.current}
      }

      await processSymLinks(file_paths, handlers)

      if (file_paths.real.absolutePath) {
        absolutePath = file_paths.real.absolutePath
      }
    }

    possible.push(
      path.join(absolutePath, filename + '.htm' ),
      path.join(absolutePath, filename + '.html'),
      path.join(absolutePath, filename          ),
    )
  }

  for (let index = 0; index < possible.length; index++) {
    const absolutePath = possible[index]
    let stats          = null

    try {
      stats = await handlers.lstat(absolutePath)
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

    if (minimatch(slashed, source, minimatch_options)) {
      whether = false
      break
    }
  }

  return whether
}

const renderDirectory = async (acceptsJSON, handlers, config, paths) => {
  const {directoryListing, trailingSlash, unlisted = [], renderSingle} = config
  const slashSuffix             = (typeof trailingSlash === 'boolean') ? (trailingSlash ? '/' : '') : '/'
  const {relativePath}          = paths.virtual
  const {current, absolutePath} = paths.real

  const excluded = [
    '.DS_Store',
    '.git',
    ...unlisted
  ]

  if (!applicable(relativePath, directoryListing, true) && !renderSingle) {
    return {}
  }

  let files = await handlers.readdir(absolutePath)

  const canRenderSingle = renderSingle && (files.length === 1)

  for (let index = 0; index < files.length; index++) {
    const file    = files[index]
    const details = path.parse(file)
    let filePath  = path.join(absolutePath, file)

    details.relative = path.posix.join(relativePath, details.base)

    let stats
    try {
      if (!canBeListed(excluded, file))
        throw 'excluded'

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

        if (!file_paths.real.absolutePath) {
          throw 'failed to lstat'
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
    catch (err) {
      delete files[index]
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

    files[index] = details
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
        message:    'Not Found'
      }
      break

    case 405:
      error = {
        statusCode,
        code:       'not_allowed',
        message:    'Method Not Allowed'
      }
      break

    case 500:
      error = {
        statusCode,
        code:       'internal_server_error',
        message:    'Internal Server Error'
      }
      break

    case 502:
      error = {
        statusCode,
        code:       'bad_gateway',
        message:    'Bad Gateway for Proxy Redirect'
      }
      break
  }

  if (error && err) {
    error.err = err
  }

  return error
}

const redirectError = (statusCode, response, config) => {
  const result = process_redirect_rules(`statusCode:${statusCode}`, /* rules= */ config.redirects, /* allow_recursion= */ false)

  if (result) {
    response.setHeader('location', result.target)
    sendDataPayload('GET', response, null, result.statusCode)
  }

  return !!result
}

const sendError = async (absolutePath, response, acceptsJSON, current, handlers, config, spec) => {
  const {err: original, message, code, statusCode} = spec

  /* istanbul ignore next */
  if (original && process.env.NODE_ENV !== 'test') {
    console.error(original)
  }

  if (redirectError(statusCode, response, config)) return

  response.statusCode = statusCode

  if (acceptsJSON) {
    response.setHeader('content-type', 'application/json; charset=utf-8')

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
  headers['content-type'] = 'text/html; charset=utf-8'

  response.writeHead(statusCode, headers)
  response.end(errorTemplate({statusCode, message}))
}

const sendDataPayload = (req_method, response, data, statusCode, headers) => {
  try {
    if (statusCode) {
      if (headers)
        response.writeHead(statusCode, headers)
      else
        response.statusCode = statusCode
    }

    if (!data || (req_method === 'HEAD'))
      response.end()
    else
      response.end(data)
  }
  catch (err) {
    process_error(getError(err))
  }
}

const sendDataUri = async (uri, req_method, response, handlers, config, paths) => {
  try {
    updatePathsForProxyResponse(paths)

    const buffer  = dataUri.decode(uri)
    const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)

    headers['content-type']   = buffer.mediatype || buffer.mimetype
    headers['content-length'] = String(buffer.length)

    sendDataPayload(req_method, response, buffer, 200, headers)
  }
  catch (err) {
    process_error(getError(err))
  }
}

const getHandlers = dependency_injection => {
  return Object.assign(
    {
      lstat:            promisify(fs.lstat),
      realpath:         promisify(fs.realpath),
      readdir:          promisify(fs.readdir),
      exec:             process_exec,
      createReadStream: fs.createReadStream,
      sendError
    },
    dependency_injection
  )
}

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

  paths.real.current = config.public ? path.resolve(config.public) : process.cwd()

  try {
    const parsed_url = url.parse(request.url)

    paths.virtual.originalPath  = path.posix.normalize(parsed_url.pathname)
    paths.virtual.relativePath  = path.posix.normalize(decodeURIComponent(paths.virtual.originalPath))
    paths.virtual.rewrittenPath = process_rewrite_rules(paths.virtual.originalPath, /* rules= */ config.rewrites, /* allow_recursion= */ true)
  }
  catch (err) {
    return {paths, error: getError()}
  }

  if (paths.virtual.rewrittenPath && (paths.virtual.rewrittenPath.substring(0,5).toLowerCase() === 'data:')) {
    return {paths, error: null}
  }

  paths.real.absolutePath = path.join(paths.real.current, paths.virtual.rewrittenPath || paths.virtual.relativePath)

  const cleanUrl    = applicable(paths.virtual.relativePath, config.cleanUrls, false)
  const defaultType = getDefaultRedirectType(request.method)
  paths.redirect    = shouldRedirect(paths.virtual.originalPath, config, cleanUrl, defaultType)

  if (paths.redirect) {
    return {paths, error: null}
  }

  if (config.symlinks)
    await processSymLinks(paths, handlers)

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

  if (cleanUrl && (!paths.real.stats || paths.real.stats.isDirectory())) {
    try {
      const related = await findRelated(paths, handlers, config)

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

  return {paths, error: null}
}

const updatePathsForProxyResponse = (paths) => {
  // monkey patch "paths" to obtain relevant response headers
  paths.real.current      = '/'
  paths.real.absolutePath = paths.virtual.relativePath
  paths.real.stats        = null
}

const copyRequestData = (request, req_method_whitelist = ["POST","PUT","PATCH"]) => {
  return new Promise((resolve, reject) => {
    // restrict copying of data to only the specified set of request methods
    if (Array.isArray(req_method_whitelist) && req_method_whitelist.length) {
      const req_method = (request.method || 'GET').toUpperCase()
      if (req_method_whitelist.indexOf(req_method) === -1) resolve('')
    }

    const chunks = []
    request.on('data', chunk => chunks.push(chunk))
    request.on('end', () => {
      resolve(chunks.length ? Buffer.concat(chunks) : '')
    })
  })
}

const get_mime_types_regex = types => Array.isArray(types) ? new RegExp('^(?:' + types.join('|') + ').*$') : null

const mime_types_regex = {
  html: get_mime_types_regex(['text/html', 'text/xml', 'application/xhtml', 'application/xml']),
  json: get_mime_types_regex(['application/json', 'text/json', 'text/x-json']),
  js:   get_mime_types_regex(['text/ecmascript', 'text/javascript', 'text/jscript', 'application/ecmascript', 'application/javascript', 'application/x-javascript']),
  text: get_mime_types_regex(['text/'])
}

const is_method_not_allowed = (response, process_error, req_method, req_method_allowed_whitelist = ["HEAD","GET"]) => {
  const not_allowed = (req_method_allowed_whitelist.indexOf(req_method) === -1)

  if (not_allowed) {
    response.setHeader('allow', req_method_allowed_whitelist.join(', '))
    process_error(getError(405))
  }

  return not_allowed
}

const interpolate_cgi_environment_variables = (old_env = {}, config = {}) => {
  config['{{serve-root}}'] = path.join(__dirname, '..', '..', '..')

  const new_env = {}

  for (const key in old_env) {
    let new_val = old_env[key]

    for (const token in config) {
      new_val = replaceAll(new_val, token, config[token])
    }

    new_env[key] = new_val
  }

  return new_env
}

const serve_handler = async (request, response, config = {}, dependency_injection = {}) => {
  const req_method = (request.method || 'GET').toUpperCase()

  if (req_method === 'OPTIONS')
    return sendDataPayload(req_method, response, null, 200)

  const handlers       = getHandlers(dependency_injection)
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

  if (paths.virtual.rewrittenPath && (paths.virtual.rewrittenPath.substring(0,5).toLowerCase() === 'data:')) {
    if (is_method_not_allowed(response, process_error, req_method)) return

    const uri = paths.virtual.rewrittenPath
    return await sendDataUri(uri, req_method, response, handlers, config, paths)
  }

  if (paths.redirect && (paths.redirect.target.substring(0,5).toLowerCase() === 'data:')) {
    if (is_method_not_allowed(response, process_error, req_method)) return

    const uri = paths.redirect.target
    return await sendDataUri(uri, req_method, response, handlers, config, paths)
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
      // bypass proxy request
      if (req_method === 'HEAD')
        return sendDataPayload(req_method, response, null, 200)

      const proxyMiddleware = process_middleware_rules(req_url, config.proxyMiddleware)

      const proxy_request = {
        options: Object.assign(
          {
            headers: request.headers || {},
            method:  req_method
          },
          url_parse(req_url)
        ),
        config: {
          binary: true,
          stream: true
        }
      }

      proxy_request.options.headers['host'] = proxy_request.options.hostname

      proxy_request.POST_data = await copyRequestData(request)

      if (config.proxyCookieJar) {
        proxy_request.config.cookieJar = path.resolve(config.proxyCookieJar)
      }

      if (proxyMiddleware.length) {
        proxy_request.config.stream = false
      }

      try {
        updatePathsForProxyResponse(paths)

        const data = await http_client.request(proxy_request.options, proxy_request.POST_data, proxy_request.config)

        const response_headers_blacklist = ['connection', 'set-cookie', 'content-encoding', 'transfer-encoding']
        for (const key in data.response.headers) {
          if (response_headers_blacklist.indexOf(key) === -1)
            response.setHeader(key, data.response.headers[key])
        }

        const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)
        for (const key in headers) {
          response.setHeader(key, headers[key])
        }

        if (proxyMiddleware.length) {
          let response_value = data.response

          const mime_type = data.response.headers['content-type'] ? data.response.headers['content-type'].toLowerCase() : ''
          if (mime_type) {

            const is_mime_type = {
              html: mime_types_regex.html && mime_types_regex.html.test(mime_type),
              json: mime_types_regex.json && mime_types_regex.json.test(mime_type),
              js:   mime_types_regex.js   && mime_types_regex.js.test(  mime_type),
              text: mime_types_regex.text && mime_types_regex.text.test(mime_type)
            }

            if (is_mime_type.html || is_mime_type.json || is_mime_type.js || is_mime_type.text) {
              // apply middleware to text response in various data formats

              try {
                // convert response from Buffer to string
                response_value = response_value.toString('utf8')

                let middleware_parameter
                if (is_mime_type.html)
                  middleware_parameter = cheerio.load(response_value)
                else if (is_mime_type.json)
                  middleware_parameter = {response: JSON.parse(response_value)}
                else
                  middleware_parameter = {response: response_value}

                for (let i=0; i < proxyMiddleware.length; i++) {
                  const rule = proxyMiddleware[i]

                  if (!rule.type) continue

                  try {
                    switch (rule.type.toLowerCase()) {
                      case 'html':
                        if (is_mime_type.html) {
                          rule.middleware(middleware_parameter, req_url, paths.virtual.originalPath)
                          if (rule.terminal) throw 1
                        }
                        break

                      case 'json':
                        if (is_mime_type.json) {
                          rule.middleware(middleware_parameter, req_url, paths.virtual.originalPath)
                          if (rule.terminal) throw 1
                        }
                        break

                      case 'js':
                        if (is_mime_type.js) {
                          rule.middleware(middleware_parameter, req_url, paths.virtual.originalPath)
                          if (rule.terminal) throw 1
                        }
                        break

                      case 'text':
                        if (is_mime_type.js || is_mime_type.text) {
                          rule.middleware(middleware_parameter, req_url, paths.virtual.originalPath)
                          if (rule.terminal) throw 1
                        }
                        break
                    }
                  }
                  catch (e2) {
                    if (e2 === 1) break
                    else          continue
                  }
                }

                if (is_mime_type.html)
                  response_value = middleware_parameter.html()
                else if (is_mime_type.json)
                  response_value = JSON.stringify(middleware_parameter.response, null, 2)
                else
                  response_value = middleware_parameter.response

                // convert response from string to Buffer
                response_value = Buffer.from(response_value, 'utf8')

                // update 'content-length' header
                response.setHeader('content-length', String(response_value.length))
              }
              catch (e1) {}
            }
          }

          sendDataPayload(req_method, response, response_value, 200)
        }
        else {
          const stream = data.response
          stream.pipe(response)
        }
      }
      catch (err) {
        process_error(getError(502))
      }
    }
    else {
      response.setHeader('location', req_url)
      sendDataPayload(req_method, response, null, paths.redirect.statusCode)
    }
    return
  }

  // Basic Authentication
  if (config.auth) {
    if ((config.auth instanceof Object) && config.auth.name && config.auth.pass) {
      const credentials = auth(request)

      if (!credentials || !(credentials instanceof Object) || (credentials.name !== config.auth.name) || (credentials.pass !== config.auth.pass)) {
        response.setHeader('www-authenticate', 'Basic realm="User Visible Realm"')

        return process_error(getError(401))
      }
    }
    else {
      const err = new Error('Basic Authentication is enabled, but "config.auth" is not correctly configured')

      return process_error(getError(err))
    }
  }

  if (paths.real.stats && paths.real.stats.isDirectory()) {
    if (is_method_not_allowed(response, process_error, req_method)) return

    // bypass dynamic page render
    if (req_method === 'HEAD')
      return sendDataPayload(req_method, response, null, 200)

    let directory = null
    let singleFile = null

    try {
      const related = await renderDirectory(acceptsJSON, handlers, config, paths)

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
      response.setHeader('content-type', contentType)
      return sendDataPayload(req_method, response, directory, 200)
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

  const cgiBin = process_cgibin_rules(
    replaceAll(paths.real.absolutePath, path.sep, '/'),
    config.cgiBin
  )
  if (cgiBin.length) {
    if (is_method_not_allowed(response, process_error, req_method, ["HEAD","GET","POST"])) return

    // insulate implementation details of cgi-bin script to prevent leakage
    const headers = await getHeaders(handlers, {headers: config.headers}, paths.real.current, paths.real.absolutePath, null)

    // additions and tweaks
    headers['cache-control'] = 'no-cache'

    if (!headers['content-type'])
      headers['content-type'] = 'text/html'

    // bypass execution of cgi-bin script
    if (req_method === 'HEAD')
      return sendDataPayload(req_method, response, null, 200, headers)

    let command
    command = cgiBin[0].command
    command = replaceAll(command, '{{source}}',   `"${paths.real.absolutePath}"`)
    command = replaceAll(command, '{{www-root}}',     paths.real.current        )
    command = replaceAll(command, '{{req-url}}',  `"${request.url}"`            )

    const options = {
      cwd:         path.dirname(paths.real.absolutePath),
      maxBuffer:   (1024 * 1024 * 5),
      encoding:    'buffer',
      timeout:     (1000 * 30),
      windowsHide: true
    }

    if (cgiBin[0].env instanceof Object)
      options.env = interpolate_cgi_environment_variables(cgiBin[0].env, {'{{www-root}}': paths.real.current})

    try {
      const {subprocess, promise} = handlers.exec(command, options)

      if ((req_method === 'POST') && (request.readableLength > 0))
        request.pipe(subprocess.stdin)
      else
        subprocess.stdin.end("\n")

      const {stdout, stderr} = await promise
      const response_buffer  = (stdout && stdout.length)
        ? stdout
        : (stderr && stderr.length)
          ? stderr
          : null

      if (!response_buffer) throw 'no output'

      headers['content-length'] = String(response_buffer.length)
      return sendDataPayload(req_method, response, response_buffer, 200, headers)
    }
    catch (err) {
      return process_error(getError(err))
    }
  }

  const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)

  if (headers['etag'] && (request.headers['if-match'] || request.headers['if-none-match'])) {
    const is_weak = headers['etag'].substring(0,2) === 'W/'

    if (!is_weak && request.headers['if-match']) {
      const is_match = request.headers['if-match'].indexOf(headers['etag']) >= 0

      if (!is_match) {
        const statusCode = request.headers.range
          ? 416 // Range Not Satisfiable
          : 412 // Precondition Failed

        return sendDataPayload(req_method, response, null, statusCode, headers)
      }
    }

    if (request.headers['if-none-match']) {
      const is_match = request.headers['if-none-match'].indexOf(headers['etag']) >= 0

      if (is_match) {
        const statusCode = 304 // Not Modified

        return sendDataPayload(req_method, response, null, statusCode, headers)
      }

      if (request.headers['if-modified-since']) {
        delete request.headers['if-modified-since']
      }
    }
  }

  if (headers['last-modified'] && (request.headers['if-modified-since'] || request.headers['if-unmodified-since'])) {
    const date_modified = Date.parse(headers['last-modified'])

    if (request.headers['if-modified-since']) {
      const date_since = Date.parse(request.headers['if-modified-since'])

      if (!isNaN(date_modified) && !isNaN(date_since) && (date_modified <= date_since)) {
        const statusCode = 304 // Not Modified

        return sendDataPayload(req_method, response, null, statusCode, headers)
      }
    }

    if (request.headers['if-unmodified-since']) {
      const date_since = Date.parse(request.headers['if-unmodified-since'])

      if (!isNaN(date_modified) && !isNaN(date_since) && (date_modified > date_since)) {
        const statusCode = 412 // Precondition Failed

        return sendDataPayload(req_method, response, null, statusCode, headers)
      }
    }
  }

  if (request.headers.range && request.headers['if-range']) {
    const is_etag   = request.headers['if-range'].substring(0,1) === '"'
    let allow_range = true

    if (is_etag && headers['etag']) {
      const is_weak = headers['etag'].substring(0,2) === 'W/'

      if (!is_weak) {
        allow_range = request.headers['if-range'] === headers['etag']
      }
    }

    if (!is_etag && headers['last-modified']) {
      const date_modified  = Date.parse(headers['last-modified'])
      const date_assertion = Date.parse(headers['if-range'])

      if (!isNaN(date_modified) && !isNaN(date_assertion)) {
        allow_range = date_modified === date_assertion
      }
    }

    if (!allow_range) {
      delete request.headers.range
    }
  }

  const streamOpts = {}

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
      response.setHeader('content-range', `bytes */${paths.real.stats.size}`)
    }
  }

  // TODO: multiple ranges

  // eslint-disable-next-line no-undefined
  if (streamOpts.start !== undefined && streamOpts.end !== undefined) {
    headers['content-range']  = `bytes ${streamOpts.start}-${streamOpts.end}/${paths.real.stats.size}`
    headers['content-length'] = String(streamOpts.end - streamOpts.start + 1)
  }

  if (is_method_not_allowed(response, process_error, req_method)) return

  // bypass reading file content
  if (req_method === 'HEAD')
    return sendDataPayload(req_method, response, null, response.statusCode || 200, headers)

  {
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

    response.writeHead(response.statusCode || 200, headers)
    stream.pipe(response)
  }
}

const format_headers = (headers, indent=`\n    `) => {
  if (!(headers instanceof Object)) return ''

  const keys = Object.keys(headers)
  if (!keys.length) return ''

  return `${indent}${keys.map(name => `${name}: ${(typeof headers[name] === 'string') ? headers[name] : JSON.stringify(headers[name])}`).join(indent)}`
}

const logging_serve_handler = async (request, response, config = {}, dependency_injection = {}) => {
  if (config.logReq) {
    let headers = request.headers

    console.log(`
request:
  method: ${request.method || ''}
  path:   ${request.url    || ''}
  headers:${format_headers(headers)}
`)
  }

  const result = await serve_handler(request, response, config, dependency_injection)

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
