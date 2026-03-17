@echo off

set www_root="%~dp0.\www"

call "%~dp0..\bin\https\httpsd.cmd" %www_root%
