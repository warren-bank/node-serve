@echo off

rem :: https://www.baeldung.com/openssl-self-signed-cert
rem :: https://stackoverflow.com/a/4300425

rem :: https://download.firedaemon.com/FireDaemon-OpenSSL/openssl-3.1.3.zip
set OPENSSL_HOME=C:\PortableApps\OpenSSL\3.1.3
set OPENSSL_CONF=%OPENSSL_HOME%\openssl.cnf
set PATH=%OPENSSL_HOME%;%PATH%

set ca_dir="%~dp0..\.."

cd /D "%ca_dir%"

rem :: =================================
rem :: remove old key and certificate:
rem :: =================================

if exist "rootCA.key"  del "rootCA.key"
if exist "rootCA.crt"  del "rootCA.crt"
if exist "pass.phrase" del "pass.phrase"

rem :: =================================
rem :: generate new key and certificate:
rem :: =================================

set passphrase=@warren-bank/serve

set countryName=US
set stateOrProvinceName=California
set localityName=Sausalito
set organizationName=serve
set organizationalUnitName=serve
set commonName=serve

set subject="/C=%countryName%/ST=%stateOrProvinceName%/L=%localityName%/O=%organizationName%/OU=%organizationalUnitName%/CN=%commonName%"

echo %passphrase%>"pass.phrase"

openssl req -config "%OPENSSL_CONF%" -x509 -sha256 -days 1825 -newkey "rsa:2048" -passout "pass:%passphrase%" -keyout "rootCA.key" -out "rootCA.crt" -subj %subject%

rem :: ===========================
rem :: log content of certificate:
rem :: ===========================

set logfile="%~dp0..\.logs\rootCA.crt.txt"

if exist %logfile% del %logfile%

openssl x509 -text -in "rootCA.crt" -out %logfile%

echo.
pause
