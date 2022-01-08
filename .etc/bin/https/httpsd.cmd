@echo off

set ssl=--ssl-cert "%~dp0.\cert\cert.pem" --ssl-key "%~dp0.\cert\key.pem" --ssl-pass "%~dp0.\cert\pass.phrase"

call "%~dp0..\serve.cmd" --config "%~dpn0.json" %ssl% --listen "tcp:0.0.0.0:443" %*
