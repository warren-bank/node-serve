// Native
const {promisify} = require('util')
const path = require('path')
const {createHash} = require('crypto')
const {realpath, lstat, createReadStream, readdir} = require('fs')

// Packages
const url = require('fast-url-parser')
const slasher = require('./glob-slash')
const minimatch = require('minimatch')
const pathToRegExp = require('path-to-regexp')
const mime = require('mime-types')
const bytes = require('bytes')
const contentDisposition = require('content-disposition')
const isPathInside = require('path-is-inside')
const parseRange = require('range-parser')
const lnk = require('@recent-cli/resolve-lnk')

// Other
const directoryTemplate = require('./directory')
const errorTemplate = require('./error')

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

const sourceMatches = (source, requestPath, allowSegments) => {
  const keys = []
  const slashed = slasher(source)
  const resolvedPath = path.posix.resolve(requestPath)

  let results = null

  if (allowSegments) {
    const normalized = slashed.replace('*', '(.*)')
    const expression = pathToRegExp(normalized, keys)

    results = expression.exec(resolvedPath)

    if (!results) {
      // clear keys so that they are not used
      // later with empty results. this may
      // happen if minimatch returns true
      keys.length = 0
    }
  }

  if (results || minimatch(resolvedPath, slashed)) {
    return {
      keys,
      results
    }
  }

  return null
}

const toTarget = (source, destination, previousPath) => {
  const matches = sourceMatches(source, previousPath, true)

  if (!matches) {
    return null
  }

  const {keys, results} = matches

  const props = {}
  const {protocol} = url.parse(destination)
  const normalizedDest = protocol ? destination : slasher(destination)
  const toPath = pathToRegExp.compile(normalizedDest)

  for (let index = 0; index < keys.length; index++) {
    const {name} = keys[index]
    props[name] = results[index + 1]
  }

  return toPath(props)
}

const applyRewrites = (requestPath, rewrites = [], repetitive) => {
  // We need to copy the array, since we're going to modify it.
  const rewritesCopy = rewrites.slice()

  // If the method was called again, the path was already rewritten
  // so we need to make sure to return it.
  const fallback = repetitive ? requestPath : null

  if (rewritesCopy.length === 0) {
    return fallback
  }

  for (let index = 0; index < rewritesCopy.length; index++) {
    const {source, destination} = rewrites[index]
    const target = toTarget(source, destination, requestPath)

    if (target) {
      // Remove rules that were already applied
      rewritesCopy.splice(index, 1)

      // Check if there are remaining ones to be applied
      return applyRewrites(slasher(target), rewritesCopy, true)
    }
  }

  return fallback
}

const ensureSlashStart = target => (target.startsWith('/') ? target : `/${target}`)

const shouldRedirect = (decodedPath, {redirects = [], trailingSlash}, cleanUrl) => {
  const slashing = typeof trailingSlash === 'boolean'
  const defaultType = 301
  const matchHTML = /(\.html|\/index)$/g

  if (redirects.length === 0 && !slashing && !cleanUrl) {
    return null
  }

  // By stripping the HTML parts from the decoded
  // path *before* handling the trailing slash, we make
  // sure that only *one* redirect occurs if both
  // config options are used.
  if (cleanUrl && matchHTML.test(decodedPath)) {
    decodedPath = decodedPath.replace(matchHTML, '')
    if (decodedPath.indexOf('//') > -1) {
      decodedPath = decodedPath.replace(/\/+/g, '/')
    }
    return {
      target: ensureSlashStart(decodedPath),
      statusCode: defaultType,
      preserveQuery: true,
      preserveHash:  true
    }
  }

  if (slashing) {
    const {ext, name} = path.parse(decodedPath)
    const isTrailed = decodedPath.endsWith('/')
    const isDotfile = name.startsWith('.')

    let target = null

    if (!trailingSlash && isTrailed) {
      target = decodedPath.slice(0, -1)
    }
    else if (trailingSlash && !isTrailed && !ext && !isDotfile) {
      target = `${decodedPath}/`
    }

    if (decodedPath.indexOf('//') > -1) {
      target = decodedPath.replace(/\/+/g, '/')
    }

    if (target) {
      return {
        target: ensureSlashStart(target),
        statusCode: defaultType,
        preserveQuery: true,
        preserveHash:  true
      }
    }
  }

  // This is currently the fastest way to
  // iterate over an array
  for (let index = 0; index < redirects.length; index++) {
    const {source, destination, type, preserveQuery, preserveHash} = redirects[index]
    const target = toTarget(source, destination, decodedPath)

    if (target) {
      return {
        target,
        statusCode:    type || defaultType,
        preserveQuery: !!preserveQuery,
        preserveHash:  !!preserveHash
      }
    }
  }

  return null
}

const appendHeaders = (target, source) => {
  for (let index = 0; index < source.length; index++) {
    const {key, value} = source[index]
    target[key] = value
  }
}

const getHeaders = async (handlers, config, current, absolutePath, stats) => {
  const {headers: customHeaders = [], etag = false} = config
  const related = {}
  const {base} = path.parse(absolutePath)
  const relativePath = path.relative(current, absolutePath)

  if (customHeaders.length > 0) {
    // By iterating over all headers and never stopping, developers
    // can specify multiple header sources in the config that
    // might match a single path.
    for (let index = 0; index < customHeaders.length; index++) {
      const {source, headers} = customHeaders[index]

      if (sourceMatches(source, slasher(relativePath))) {
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

      if (sourceMatches(source, decodedPath)) {
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
    } catch (err) {
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

    if (sourceMatches(source, slashed)) {
      whether = false
      break
    }
  }

  return whether
}

const renderDirectory = async (acceptsJSON, handlers, methods, config, paths) => {
  const {directoryListing, trailingSlash, unlisted = [], renderSingle} = config
  const slashSuffix = typeof trailingSlash === 'boolean' ? (trailingSlash ? '/' : '') : '/'
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
    const file = files[index]

    const filePath = path.resolve(absolutePath, file)
    const details = path.parse(filePath)

    // It's important to indicate that the `stat` call was
    // spawned by the directory listing, as Now is
    // simulating those calls and needs to special-case this.
    let stats = null

    if (methods.lstat) {
      stats = await handlers.lstat(filePath, true)
    }
    else {
      stats = await handlers.lstat(filePath)
    }

    details.relative = path.posix.join(relativePath, details.base)

    if (stats.isDirectory()) {
      details.base += slashSuffix
      details.relative += slashSuffix
      details.type = 'folder'
    }
    else {
      if (canRenderSingle) {
        return {
          singleFile: true,
          absolutePath: filePath,
          stats
        }
      }

      details.ext = details.ext.split('.')[1] || 'txt'
      details.type = 'file'

      details.size = bytes(stats.size, {
        unitSeparator: ' ',
        decimalPlaces: 0
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

    /* istanbul ignore next */
    if (aIsDir && !bIsDir) {
      return -1
    }

    if ((bIsDir && !aIsDir) || (a.base > b.base)) {
      return 1
    }

    /* istanbul ignore next */
    if (a.base < b.base) {
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
  } catch (err) {
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
    } catch (err) {
      console.error(err)
    }
  }

  const headers = await getHeaders(handlers, config, current, absolutePath, null)
  headers['Content-Type'] = 'text/html; charset=utf-8'

  response.writeHead(statusCode, headers)
  response.end(errorTemplate({statusCode, message}))
}

const getHandlers = methods => Object.assign({
  lstat: promisify(lstat),
  realpath: promisify(realpath),
  createReadStream,
  readdir: promisify(readdir),
  sendError
}, methods)

const processSymLinks = async (paths, handlers) => {
  const parts = paths.virtual.relativePath.split('/').filter(dir => !!dir)
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
      relativePath: null
    },
    real: {
      current:      null,
      absolutePath: null,
      stats:        null,
      isSymLink:    false
    },
    redirect:       null
  }

  const cwd = process.cwd()
  paths.real.current = config.public ? path.resolve(cwd, config.public) : cwd

  try {
    paths.virtual.relativePath = decodeURIComponent(url.parse(request.url).pathname)
  }
  catch (err) {
    return {paths, error: getError()}
  }

  paths.real.absolutePath = path.join(paths.real.current, paths.virtual.relativePath)

  // Prevent path traversal vulnerabilities. We could do this
  // by ourselves, but using the package covers all the edge cases.
  if (!isPathInside(paths.real.absolutePath, paths.real.current)) {
    return {paths, error: getError()}
  }

  const cleanUrl = applicable(paths.virtual.relativePath, config.cleanUrls)
  paths.redirect = shouldRedirect(paths.virtual.relativePath, config, cleanUrl)

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

    if (path.extname(paths.virtual.relativePath) !== '') {
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
    const rewrittenPath = applyRewrites(paths.virtual.relativePath, config.rewrites)

    if (cleanUrl || rewrittenPath) {
      try {
        const related = await findRelated(paths.real.current, paths.virtual.relativePath, rewrittenPath, handlers.lstat)

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

module.exports = async (request, response, config = {}, methods = {}) => {
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

    response.writeHead(paths.redirect.statusCode, {
      Location: encodeURI(paths.redirect.target + req_search + req_hash)
    })

    response.end()
    return
  }

  if (paths.real.stats && paths.real.stats.isDirectory()) {
    let directory = null
    let singleFile = null

    try {
      const related = await renderDirectory(acceptsJSON, handlers, methods, config, paths)

      if (related.singleFile) {
        paths.real.absolutePath = related.absolutePath
        paths.real.stats        = related.stats
        singleFile              = related.singleFile
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
  }
  catch (err) {
    return process_error(getError(err))
  }

  const headers = await getHeaders(handlers, config, paths.real.current, paths.real.absolutePath, paths.real.stats)

  // eslint-disable-next-line no-undefined
  if (streamOpts.start !== undefined && streamOpts.end !== undefined) {
    headers['Content-Range'] = `bytes ${streamOpts.start}-${streamOpts.end}/${paths.real.stats.size}`
    headers['Content-Length'] = streamOpts.end - streamOpts.start + 1
  }

  // We need to check for `headers.ETag` being truthy first, otherwise it will
  // match `undefined` being equal to `undefined`, which is true.
  //
  // Checking for `undefined` and `null` is also important, because `Range` can be `0`.
  //
  // eslint-disable-next-line no-eq-null
  if (request.headers.range == null && headers.ETag && headers.ETag === request.headers['if-none-match']) {
    response.statusCode = 304
    response.end()

    return
  }

  response.writeHead(response.statusCode || 200, headers)
  stream.pipe(response)
}
