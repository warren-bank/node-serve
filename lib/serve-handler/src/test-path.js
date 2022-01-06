const minimatch            = require('minimatch')

const {p2r_process_source} = require('./rewrite-path')

// -----------------------------------------------------------------------------
// engine: 'route'
// using:  'path-to-regexp' library

const p2r_test_path = (encoded_url, {source}) => {
  try {
    const matches = p2r_process_source(encoded_url, source)
    return !!matches
  }
  catch(e) {
    return false
  }
}

// -----------------------------------------------------------------------------
// engine: 'glob'
// using:  'minimatch' library

const glob_test_path = (encoded_url, {source}) => {
  try {
    return minimatch(encoded_url, source)
  }
  catch(e) {
    return false
  }
}

// -----------------------------------------------------------------------------
// engine: 'regex'

const regex_test_path = (encoded_url, {source, flags}) => {
  try {
    const regex_search = new RegExp(source, flags || '')

    return regex_search.test(encoded_url)
  }
  catch(e) {
    return false
  }
}

// -----------------------------------------------------------------------------
// engine: 'text'

const text_test_path = (encoded_url, {source, exact}) => {
  try {
    if (encoded_url.indexOf(source) === -1)
      throw 'no match'

    if (exact && (encoded_url !== source))
      throw 'no exact match'

    return true
  }
  catch(e) {
    return false
  }
}

// -----------------------------------------------------------------------------

const test_path = (encoded_url, rule) => {
  if (!(rule instanceof Object))
    return false

  if (!rule.source)
    return false

  rule.engine = rule.engine ? rule.engine.toLowerCase() : ''

  switch(rule.engine) {
    case 'route':
      return p2r_test_path(encoded_url, rule)
      break

    case 'glob':
      return glob_test_path(encoded_url, rule)
      break

    case 'regex':
      return regex_test_path(encoded_url, rule)
      break

    case 'text':
    default:
      return text_test_path(encoded_url, rule)
      break
  }
}

// -----------------------------------------------------------------------------

const process_middleware_rules = (encoded_url, rules) => {
  const matching_rules = []
  let rule

  if (!Array.isArray(rules) || !rules.length)
    return matching_rules

  for (let i=0; i < rules.length; i++) {
    rule = rules[i]

    if (!(rule instanceof Object))
      continue

    if (!rule.middleware)
      continue

    if (test_path(encoded_url, rule))
      matching_rules.push(rule)
  }

  return matching_rules
}

// -----------------------------------------------------------------------------

module.exports = {process_middleware_rules, test_path}
