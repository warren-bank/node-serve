@echo off

set www_root="%~1"

if exist %www_root% (
  cd /D %www_root%
  call "%~dp0.\httpd.cmd" .
)

echo.
pause
