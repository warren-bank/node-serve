const busboy        = require('busboy')
const fs            = require('fs')
const path          = require('path')
const HttpTransform = require('./transform-http-stream')

const save_to_dir = path.resolve(__dirname, '../../uploads')
const headers     = {}
let files_count   = 0

const process_stdin = () => {
  const ht  = new HttpTransform()
  const sep = /\s*:\s*/

  ht.on('header', (header) => {
    const [name, value] = header.split(sep, 2)
    headers[name] = value
  })

  ht.on('headers-complete', () => {
    const bb = busboy({headers})

    bb.on('file', (name, file, info) => {
      files_count += 1
      const filepath = get_filepath(info.filename)

      file.pipe(fs.createWriteStream(filepath))
    })

    bb.on('close', () => {
      console.log(`${files_count} files uploaded and saved to disk`)
    })

    ht.pipe(bb)
  })

  process.stdin.pipe(ht)
}

const get_filepath = (filename, index) => {
  index = index || 0
  const filepath = path.join(save_to_dir, index ? `${filename}.${index}` : filename)
  return fs.existsSync(filepath)
    ? get_filepath(filename, index+1)
    : filepath
}

if (!fs.existsSync(save_to_dir)) {
  console.log('ERROR: The directory path in which to save file uploads does not exist!')
  process.exit(1)
}

process_stdin()
