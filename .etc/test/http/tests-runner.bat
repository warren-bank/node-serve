@echo off

set CURL_HOME=C:\PortableApps\curl
set PATH=%CURL_HOME%;%PATH%

set tests="%~dp0..\tests.bat"
set log="%~dpn0.log.txt"

set serve_url=http://127.0.0.1:80

call %tests% >%log% 2>&1
