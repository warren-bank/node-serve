@echo off

set CURL_HOME=C:\PortableApps\curl
set PATH=%CURL_HOME%;%PATH%

set tests="%~dp0.\1-tests.bat"
set log="%~dp0.\3-tests-output.txt"

call %tests% >%log% 2>&1
