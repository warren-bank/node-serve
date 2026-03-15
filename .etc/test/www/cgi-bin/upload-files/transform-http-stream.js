const {Buffer}    = require('buffer')
const {Transform} = require('stream')

class HttpTransform extends Transform {
  constructor() {
    super()
    this.delimiter = Buffer.from('\n')
    this.buffer    = Buffer.alloc(0)
    this.isBody    = false
  }

  _transform(chunk, encoding, callback) {
    if (this.isBody) {
      this.push(chunk)
    }
    else {
      this.buffer = Buffer.concat([this.buffer, chunk])

      let index
      while ((index = this.buffer.indexOf(this.delimiter)) !== -1) {
        if (index === 0) {
          this.push(
            this.buffer.slice(index + this.delimiter.length)
          )
          this.buffer = Buffer.alloc(0)
          this.isBody = true
          this.emit('headers-complete', true)
        }
        else {
          const header = this.buffer.slice(0, index).toString('utf8')
          this.emit('header', header)

          this.buffer = this.buffer.slice(index + this.delimiter.length)
        }
      }
    }
    callback()
  }

  _flush(callback) {
    if (this.buffer.length > 0) {
      this.push(this.buffer)
    }
    callback()
  }
}

module.exports = HttpTransform
