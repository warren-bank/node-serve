@echo off

set www_root="%~dp0.\www"

call "%~dp0..\bin\http\httpd.cmd" %www_root%
