const path = require('path')

const normalize_slashes = value => {
  return (path.sep === path.posix.sep)
    ? value
    : value.split(path.sep).join(path.posix.sep)
}

const normalize_leading_slash = value => {
  return path.posix.normalize(
    path.posix.join(path.posix.sep, value)
  )
}

const slasher = value => {
  const isNegated = (value.charAt(0) === '!')

  if (isNegated)
    value = value.substring(1, value.length)

  value = normalize_slashes(value)
  value = normalize_leading_slash(value)

  if (isNegated)
    value = '!' + value

  return value
}

module.exports = {slasher, normalize_slashes, normalize_leading_slash}
