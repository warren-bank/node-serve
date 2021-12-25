const matchHTML = {
  with_encoded: /[&<>"'\/]/g,
  skip_encoded: /&(?!#?\w+;)|[<>"'\/]/g
}

const encodeHTMLRules = {
  "&": "&#38;",
  "<": "&#60;",
  ">": "&#62;",
  '"': "&#34;",
  "'": "&#39;",
  "/": "&#47;"
}

const matchURLPath       = /[ <>%#\?]/g
const encodeURLPathRules = {
  " ": "%20",
  "<": "%3C",
  ">": "%3E",
  '%': "%25",
  "#": "%23",
  "?": "%3F"
}

const encodeString = (text, charset_regex, charset_map) => {
  return (!text || (typeof text !== 'string'))
    ? ''
    : text.toString().replace(charset_regex, function(char_value) {
        return charset_map[char_value] || char_value
      })
}

const encodeHTML = (text, with_encoded) => {
  const charset_regex = with_encoded
    ? matchHTML.with_encoded
    : matchHTML.skip_encoded

  return encodeString(text, charset_regex, encodeHTMLRules)
}

const encodeURLPath = text => encodeString(text, matchURLPath, encodeURLPathRules)

module.exports = {encodeHTML, encodeURLPath}
