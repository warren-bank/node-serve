const fs   = require('fs')
const path = require('path')

const config = require('./data/in')

if (Array.isArray(config.proxyMiddleware)) {
  config.proxyMiddleware.forEach(rule => {
    if (rule.middleware && (typeof rule.middleware === 'function')) {
      rule.middleware = rule.middleware.toString()
    }
  })
}

fs.writeFileSync(
  path.join(__dirname, 'data', 'out.json'),
  JSON.stringify(config, null, 2)
)
