@echo off

if [%1]==[] (
  echo ERROR: directory path is required
  goto :done
)

set www_root="%~1"

if not exist %www_root% (
  echo ERROR: directory path does not exist
  goto :done
)

call "%~dp0.\httpd.cmd" %www_root%

:done
echo.
pause
