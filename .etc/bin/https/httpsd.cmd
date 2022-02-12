@echo off

rem :: "manual" options
set ssl=--ssl-cert "%~dp0.\cert\cert.pem" --ssl-key "%~dp0.\cert\key.pem" --ssl-pass "%~dp0.\cert\pass.phrase"

rem :: "automatic" option, which is exactly equivalent to the "manual" options (above)
set ssl=--ssl

call "%~dp0..\serve.cmd" --config "%~dpn0.json" %ssl% --cors --listen "tcp:0.0.0.0:443" --force-https 80 %*
