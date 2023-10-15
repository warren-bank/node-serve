@echo off

set FQDN=serve.local

rem :: https://www.baeldung.com/openssl-self-signed-cert
rem :: https://stackoverflow.com/a/4300425
rem :: https://stackoverflow.com/q/30426586

rem :: https://download.firedaemon.com/FireDaemon-OpenSSL/openssl-3.1.3.zip
set OPENSSL_HOME=C:\PortableApps\OpenSSL\3.1.3
set OPENSSL_CONF=%OPENSSL_HOME%\openssl.cnf
set PATH=%OPENSSL_HOME%;%PATH%

set common_dir=%~dp0..\.common
set cert_dir=%~dp0..\..
set ca_dir=%~dp0..\..\..\ca

cd /D "%cert_dir%"

rem :: =================================
rem :: remove old key and certificate:
rem :: =================================

if exist "key.pem"     del "key.pem"
if exist "cert.pem"    del "cert.pem"
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
set commonName=%FQDN%

set subject="/C=%countryName%/ST=%stateOrProvinceName%/L=%localityName%/O=%organizationName%/OU=%organizationalUnitName%/CN=%commonName%"

echo %passphrase%>"pass.phrase"

openssl req -config "%OPENSSL_CONF%" -newkey "rsa:2048" -passout "pass:%passphrase%" -keyout "key.pem" -out "cert.pem" -subj %subject%

rem :: ==============================
rem :: sign certificate with root CA:
rem :: ==============================

openssl x509 -req -CA "%ca_dir%\rootCA.crt" -CAkey "%ca_dir%\rootCA.key" -passin "file:%ca_dir%\pass.phrase" -in "cert.pem" -out "cert.pem" -days 397 -CAcreateserial -extfile "%common_dir%\domain.ext"

rem :: ===========================
rem :: log content of certificate:
rem :: ===========================

set logfile="%~dp0..\.logs\cert.pem.txt"

if exist %logfile% del %logfile%

openssl x509 -text -in "cert.pem" -out %logfile%

echo.
pause
