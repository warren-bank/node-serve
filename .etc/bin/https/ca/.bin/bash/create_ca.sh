#!/usr/bin/env bash

# https://www.baeldung.com/openssl-self-signed-cert
# https://stackoverflow.com/a/4300425
# https://stackoverflow.com/a/31990313

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# https://download.firedaemon.com/FireDaemon-OpenSSL/openssl-3.1.3.zip
OPENSSL_HOME='/c/PortableApps/OpenSSL/3.1.3'
export OPENSSL_CONF="${OPENSSL_HOME}/openssl.cnf"
export PATH="${OPENSSL_HOME}:${PATH}"

ca_dir="${DIR}/../.."

cd "$ca_dir"

# =================================
# remove old key and certificate:
# =================================

[ -e 'rootCA.key' ]  && rm 'rootCA.key'
[ -e 'rootCA.crt' ]  && rm 'rootCA.crt'
[ -e 'pass.phrase' ] && rm 'pass.phrase'

# =================================
# generate new key and certificate:
# =================================

passphrase='@warren-bank/serve'

countryName='US'
stateOrProvinceName='California'
localityName='Sausalito'
organizationName='serve'
organizationalUnitName='serve'
commonName='serve'

subject="//C=${countryName}\ST=${stateOrProvinceName}\L=${localityName}\O=${organizationName}\OU=${organizationalUnitName}\CN=${commonName}"

echo -n "$passphrase" >"pass.phrase"

openssl req -config "$OPENSSL_CONF" -x509 -sha256 -days 1825 -newkey 'rsa:2048' -passout "pass:${passphrase}" -keyout 'rootCA.key' -out 'rootCA.crt' -subj "$subject"

# ===========================
# log content of certificate:
# ===========================

logfile="${DIR}/../.logs/rootCA.crt.txt"

[ -e "$logfile" ] && rm "$logfile"

openssl x509 -text -in "rootCA.crt" -out "$logfile"
