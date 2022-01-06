module.exports = {
  "proxyMiddleware": [
    { "engine": "text",  "source": "https://www.google.com/search?q=", "middleware": function($) {
      // https://github.com/cheeriojs/cheerio

      const results = $('#search')
      $('body').empty().append(results)
    }}
  ]
}
