const staticTemplateStrings = {
  head: {
    pre_title: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>Files within `,
    post_title: `</title>

    <style>
      body {
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif;
        font-size: 16px;
        -webkit-font-smoothing: antialiased;
        margin: 0;
        padding: 1.5em;
      }
      body > main > header > h1 {
        line-height: 30px;
      }
      body > main > header > h1 > img#layout_list_grid_toggle,
      body > main > header > h1 > i,
      body > main > header > h1 > a {
        vertical-align: middle;
      }
      body > main > header > h1 > img#layout_list_grid_toggle {
        display: none;
        width: 30px;
        height: 30px;
        margin-right: 10px;
        cursor: pointer;
      }
      body > main > header > h1,
      body > main > header > h1 > a {
        font-size: 18px;
        font-weight: 500;
        margin-top: 0;
        color: #000;
      }
      body > main > header > h1 > i {
        font-style: normal;
      }
      body > main > ul#files {
        margin: 0;
        padding: 1.5em 0 0 0;
      }
      body > main > ul#files > li {
        list-style: none;
        font-size: 14px;
      }
      body > main > header > h1 > a,
      body > main > ul#files > li > a {
        text-decoration: none;
      }
      body > main > header > h1 > a {
        display: inline-block;
        line-height: 20px;
      }
      body > main > ul#files > li > a {
        color: #000;
        padding: 10px 0;
        margin: 0;
        white-space: nowrap;
        overflow: hidden;
        display: block;
        width: 100%;
        text-overflow: ellipsis;
      }
      body > main > ul#files > li > a:hover {
        text-decoration: underline;
      }
      body > main > ul#files > li > a::before {
        display: inline-block;
        vertical-align: middle;
        margin-right: 10px;
        width: 24px;
        text-align: center;
        line-height: 12px;
      }
      body > main > ul#files > li > svg {
        height: 13px;
        vertical-align: text-bottom;
      }
      /* file-icon – svg inlined here, but it should also be possible to separate out. */
      body > main > ul#files > li > a.file::before {
        content: url("data:image/svg+xml;utf8,<svg width='15' height='19' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M10 8C8.34 8 7 6.66 7 5V1H3c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V8h-4zM8 5c0 1.1.9 2 2 2h3.59L8 1.41V5zM3 0h5l7 7v9c0 1.66-1.34 3-3 3H3c-1.66 0-3-1.34-3-3V3c0-1.66 1.34-3 3-3z' fill='black'/></svg>");
      }
      /* folder-icon */
      body > main > ul#files > li > a.folder::before {
        content: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 347.479 347.479' style='enable-background:new 0 0 347.479 347.479' xml:space='preserve'><path style='fill:#e0b03b' d='M292.251 79.766H103.644v-8.544c0-5.974-4.888-10.862-10.862-10.862H30.414c-5.975 0-10.862 4.888-10.862 10.862v8.544h-3.258C7.332 79.766 0 87.098 0 96.059v174.766c0 8.961 7.332 16.293 16.293 16.293h275.958c8.961 0 16.293-7.332 16.293-16.293V96.059c.001-8.961-7.331-16.293-16.293-16.293z'/><path style='fill:#fff' d='M23.243 95.385h262.059v176.113H23.243z'/><path style='fill:#ffc843' d='M312.426 271.293c-2.135 8.704-11.213 15.825-20.175 15.825H16.293c-8.961 0-14.547-7.121-12.412-15.825l34.598-141.05c2.135-8.704 11.213-15.825 20.175-15.825h275.958c8.961 0 14.547 7.121 12.412 15.825l-34.598 141.05z'/></svg>");
      }
      body > main > ul#files > li > a.lambda::before {
        content: url("data:image/svg+xml; utf8,<svg width='15' height='19' fill='none' xmlns='http://www.w3.org/2000/svg'><path d='M3.5 14.4354H5.31622L7.30541 9.81311H7.43514L8.65315 13.0797C9.05676 14.1643 9.55405 14.5 10.7 14.5C11.0171 14.5 11.291 14.4677 11.5 14.4032V13.1572C11.3847 13.1766 11.2622 13.2024 11.1541 13.2024C10.6351 13.2024 10.3829 13.0281 10.1595 12.4664L8.02613 7.07586C7.21171 5.01646 6.54865 4.5 5.11441 4.5C4.83333 4.5 4.62432 4.53228 4.37207 4.59038V5.83635C4.56667 5.81052 4.66036 5.79761 4.77568 5.79761C5.64775 5.79761 5.9 6.0042 6.4045 7.19852L6.64234 7.77954L3.5 14.4354Z' fill='black'/><rect x='0.5' y='0.5' width='14' height='18' rx='2.5' stroke='black'/></svg>");
      }
      /* image-icon */
      body > main > ul#files > li > a.file.gif::before,
      body > main > ul#files > li > a.file.jpg::before,
      body > main > ul#files > li > a.file.png::before,
      body > main > ul#files > li > a.file.svg::before {
        content: url("data:image/svg+xml;utf8,<svg width='16' height='16' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg' fill='none' stroke='black' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'><rect x='6' y='6' width='68' height='68' rx='5' ry='5'/><circle cx='24' cy='24' r='8'/><path d='M73 49L59 34 37 52m16 20L27 42 7 58'/></svg>");
      }
      ::selection {
        background-color: #79FFE1;
        color: #000;
      }
      ::-moz-selection {
        background-color: #79FFE1;
        color: #000;
      }
      @media (min-width: 768px) {
        body > main > header > h1 > img#layout_list_grid_toggle {
          display: inline-block;
        }
        body > main.grid > ul#files {
          display: flex;
          flex-wrap: wrap;
        }
        body > main.grid > ul#files > li {
          width: 230px;
          padding-right: 1.5em;
          box-sizing: border-box;
          justify-content: flex-start;
        }
      }
    </style>
    <script>
      window.addEventListener('DOMContentLoaded', function() {
        var toggle = document.getElementById('layout_list_grid_toggle')
        if (!toggle) return

        var main = document.querySelector('body > main')
        if (!main) return

        var grid_enabled = false

        toggle.addEventListener('click', function() {
          grid_enabled   = !grid_enabled
          main.className = grid_enabled ? 'grid' : ''
        })
      })
    </script>
  </head>`
  },
  body: {
    pre_header: `
  <body>
    <main>
      <header>
        <h1>
          <img id="layout_list_grid_toggle" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='24' height='24' viewBox='0 0 24 24'><path d='M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z' /></svg>" />
          <i>Index of&nbsp;</i>`,
    post_header: `
        </h1>
      </header>`,
    pre_files: `
      <ul id="files">`,
    post_files: `
      </ul>
  </main>
  </body>
</html>`
  }
}

const doNotSkipEncoded = false
const matchHTML        = doNotSkipEncoded ? /[&<>"'\/]/g : /&(?!#?\w+;)|[<>"'\/]/g
const encodeHTMLRules  = {
//"/": "&#47;",
  "&": "&#38;",
  "<": "&#60;",
  ">": "&#62;",
  '"': "&#34;",
  "'": "&#39;"
}

const encodeHTML = code => {
  return (!code || (typeof code !== 'string'))
    ? ''
    : code.toString().replace(matchHTML, function(m) {
        return encodeHTMLRules[m] || m
      })
}

const directoryTemplate = spec => {
  const {paths, files} = spec
  const title          = encodeHTML(spec.directory)
  let html = ''

  html += staticTemplateStrings.head.pre_title
  html += title
  html += staticTemplateStrings.head.post_title
  html += staticTemplateStrings.body.pre_header

  if (Array.isArray(paths) && paths.length) {
    for (let path of paths) {
      html += `<a href="/${encodeHTML(path.url)}">${encodeHTML(path.name)}</a>`
    }
  }

  html += staticTemplateStrings.body.post_header
  html += staticTemplateStrings.body.pre_files

  if (Array.isArray(files) && files.length) {
    for (let file of files) {
      html += `<li><a href="${encodeHTML(file.relative)}" title="${encodeHTML(file.title)}" class="${encodeHTML(file.type)} ${encodeHTML(file.ext)}">${encodeHTML(file.base)}</a></li>`
    }
  }

  html += staticTemplateStrings.body.post_files

  return html
}

module.exports = directoryTemplate
