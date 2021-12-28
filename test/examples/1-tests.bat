@echo off

curl --silent -X POST "http://127.0.0.1:80/post/" -H "content-type: application/x-www-form-urlencoded" --data-binary "hello=world"

curl --silent -X POST "http://127.0.0.1:80/post/" -H "content-type: application/octet-stream" --data-binary "hello=world"

curl --silent "https://github.githubassets.com/favicons/favicon.png" | curl --silent -X POST "http://127.0.0.1:80/post/" -H "content-type: image/png" --data-binary @-
