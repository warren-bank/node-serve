const child_process = require('child_process')

const process_exec = (command, options) => {
  let resolve, reject

  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve
    reject  = _reject
  })

  const callback = (error, stdout, stderr) => {
    if (error)
      reject(error)
    else
      resolve({stdout, stderr})
  }

  const subprocess = child_process.exec(command, options, callback)

  return {subprocess, promise}
}

module.exports = {process_exec}
