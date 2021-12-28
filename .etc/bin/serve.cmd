@echo off
set NO_UPDATE_CHECK=1
node "%~dp0..\..\lib\serve\bin\serve.js" %*
