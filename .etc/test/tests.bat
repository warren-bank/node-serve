@echo off

if not defined serve_url (
  echo ERROR: 'serve' URL is required
  exit /b 1
)

curl --silent --insecure -X POST "%serve_url%/post/" -H "content-type: application/x-www-form-urlencoded" --data-binary "hello=world"

curl --silent --insecure -X POST "%serve_url%/post/" -H "content-type: application/octet-stream" --data-binary "hello=world"

curl --silent --insecure "https://github.githubassets.com/favicons/favicon.png" |                                                                                                            curl --silent --insecure -X POST "%serve_url%/post/" -H "content-type: image/png"                                 --data-binary @-
curl --silent --insecure "https://github.githubassets.com/favicons/favicon.png" | curl --silent --insecure -X POST "%serve_url%/cgi-bin/echo-post-data/echo-post-data.pl" --data-binary @- | curl --silent --insecure -X POST "%serve_url%/post/" -H "content-type: image/png" -H "x-requested-with: perl cgi" --data-binary @-
curl --silent --insecure "https://github.githubassets.com/favicons/favicon.png" | curl --silent --insecure -X POST "%serve_url%/cgi-bin/echo-post-data/echo-post-data.sh" --data-binary @- | curl --silent --insecure -X POST "%serve_url%/post/" -H "content-type: image/png" -H "x-requested-with: bash cgi" --data-binary @-

curl --silent --insecure -X GET "%serve_url%/jsonp/data.json?callback=cb"
