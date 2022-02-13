// -------------------------------------
// https://github.com/isaacs/minimatch#options
// -------------------------------------
const minimatch_options = {
  dot:        true,
  nocase:     true,
  matchBase:  true,

  noglobstar: false,
  nobrace:    false,
  noext:      false,
  nonegate:   false,
  nonull:     false
}

module.exports = {minimatch_options}
