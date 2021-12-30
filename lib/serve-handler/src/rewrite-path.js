const minimatch       = require('minimatch')
const p2r             = require('path-to-regexp')

const {encodeURLPath} = require('./encoders')

// -----------------------------------------------------------------------------
// engine: 'route'
// using:  'path-to-regexp' library

const p2r_process_source = (source, request_path, p2r_options={}) => {
  const keys    = []
  const regex   = p2r.pathToRegexp(source, keys, p2r_options)
  const results = regex.exec(request_path)

  return (results)
    ? {keys, results}
    : null
}

const p2r_rewrite_path = (request_path, {source, destination, decode}, reencode) => {
  try {
    const p2r_options = {delimiter: '/', validate: false, encode: (decode && reencode) ? encodeURLPath : undefined}
    const matches     = p2r_process_source(source, request_path, p2r_options)

    if (!matches)
      throw 'no match'

    const {keys, results} = matches
    const toPath          = p2r.compile(destination, p2r_options)
    const props           = {}

    for (let index = 0; index < keys.length; index++) {
      const {name} = keys[index]
      props[name] = results[index + 1] || ''
    }

    return toPath(props)
  }
  catch(e) {
    return null
  }
}

// -----------------------------------------------------------------------------
// engine: 'glob'
// using:  'minimatch' library

const glob_rewrite_path = (request_path, {source, destination, decode}, reencode) => {
  try {
    if (!minimatch(request_path, source))
      throw 'no match'

    let new_path = destination

    if (decode && reencode)
      new_path = encodeURLPath(new_path)

    return new_path
  }
  catch(e) {
    return null
  }
}

// -----------------------------------------------------------------------------
// engine: 'regex'
// using:  user-defined regex pattern replacement

const regex_rewrite_path = (request_path, {source, destination, decode, flags}, reencode) => {
  try {
    const regex_search = new RegExp(source, flags || '')

    if (!regex_search.test(request_path))
      throw 'no match'

    let new_path = request_path.replace(regex_search, destination)

    if (decode && reencode)
      new_path = encodeURLPath(new_path)

    return new_path
  }
  catch(e) {
    return null
  }
}

// -----------------------------------------------------------------------------
// engine: 'text'
// using:  user-defined substring replacement

const text_rewrite_path = (request_path, {source, destination, exact, decode}, reencode) => {
  try {
    if (request_path.indexOf(source) === -1)
      throw 'no match'

    if (exact && (request_path !== source))
      throw 'no exact match'

    let new_path = request_path
    while (new_path.indexOf(source) !== -1) {
      new_path = new_path.replace(source, destination)
    }

    if (decode && reencode)
      new_path = encodeURLPath(new_path)

    return new_path
  }
  catch(e) {
    return null
  }
}

// -----------------------------------------------------------------------------

const rewrite_path = (encoded_path, rule, reencode) => {
  if (!(rule instanceof Object))
    return null

  const request_path = rule.decode ? decodeURIComponent(encoded_path) : encoded_path
  let new_path = null

  rule.engine = rule.engine ? rule.engine.toLowerCase() : ''

  switch(rule.engine) {
    case 'route':
      new_path = p2r_rewrite_path(request_path, rule, reencode)
      break

    case 'glob':
      new_path = glob_rewrite_path(request_path, rule, reencode)
      break

    case 'regex':
      new_path = regex_rewrite_path(request_path, rule, reencode)
      break

    case 'text':
    default:
      new_path = text_rewrite_path(request_path, rule, reencode)
      break
  }

  return new_path
}

// -----------------------------------------------------------------------------

const process_rewrite_rules = (encoded_path, rules, allow_recursion) => {
  if (!Array.isArray(rules) || !rules.length)
    return null

  const reencode = false
  let rule, new_path

  for (let i=0; !new_path && (i < rules.length); i++) {
    if (!(rules[i] instanceof Object))
      continue

    rule     = Object.assign({}, rules[i], {decode: true})
    new_path = rewrite_path(encoded_path, rule, reencode)
  }

  if (new_path && allow_recursion && !rule.terminal)
    new_path = process_rewrite_rules(new_path, rules, allow_recursion) || new_path

  return new_path
}

// -----------------------------------------------------------------------------

const process_redirect_rules = (encoded_path, rules, allow_recursion, default_type=301) => {
  if (!Array.isArray(rules) || !rules.length)
    return null

  const reencode = true
  let rule, new_path, result

  for (let i=0; !new_path && (i < rules.length); i++) {
    if (!(rules[i] instanceof Object))
      continue

    rule     = rules[i]
    new_path = rewrite_path(encoded_path, rule, reencode)
  }

  result = new_path
    ? {target: new_path, statusCode: (rule.type || default_type), preserveQuery: !!rule.preserveQuery, preserveHash: !!rule.preserveHash, proxy: !!rule.proxy}
    : null

  if (result && allow_recursion && !rule.terminal)
    result = process_redirect_rules(new_path, rules, allow_recursion) || result

  return result
}

// -----------------------------------------------------------------------------

module.exports = {process_rewrite_rules, process_redirect_rules, rewrite_path}
