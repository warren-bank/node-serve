@echo off

call "%~dp0.\serve.cmd" --config "%~dpn0.json" --listen "tcp:0.0.0.0:80" --symlinks --no-etag
