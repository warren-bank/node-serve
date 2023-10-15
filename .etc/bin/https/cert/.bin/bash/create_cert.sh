#!/usr/bin/env bash

FQDN='serve.local'

# https://www.baeldung.com/openssl-self-signed-cert
# https://stackoverflow.com/a/4300425
# https://stackoverflow.com/q/30426586
# https://stackoverflow.com/a/31990313

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# https://download.firedaemon.com/FireDaemon-OpenSSL/openssl-3.1.3.zip
OPENSSL_HOME='/c/PortableApps/OpenSSL/3.1.3'
export OPENSSL_CONF="${OPENSSL_HOME}/openssl.cnf"
export PATH="${OPENSSL_HOME}:${PATH}"

common_dir="${DIR}/../.common"
cert_dir="${DIR}/../.."
ca_dir="${DIR}/../../../ca"

cd "$cert_dir"

# =================================
# remove old key and certificate:
# =================================

[ -e 'key.pem' ]     && rm 'key.pem'
[ -e 'cert.pem' ]    && rm 'cert.pem'
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
commonName="$FQDN"

subject="//C=${countryName}\ST=${stateOrProvinceName}\L=${localityName}\O=${organizationName}\OU=${organizationalUnitName}\CN=${commonName}"

echo -n "$passphrase" >"pass.phrase"

openssl req -config "$OPENSSL_CONF" -newkey 'rsa:2048' -passout "pass:${passphrase}" -keyout 'key.pem' -out 'cert.pem' -subj "$subject"

# ==============================
# sign certificate with root CA:
# ==============================

openssl x509 -req -CA "${ca_dir}/rootCA.crt" -CAkey "${ca_dir}/rootCA.key" -passin "file:"$(realpath "${ca_dir}/pass.phrase") -in 'cert.pem' -out 'cert.pem' -days '397' -CAcreateserial -extfile "${common_dir}/domain.ext"

# ===========================
# log content of certificate:
# ===========================

logfile="${DIR}/../.logs/cert.pem.txt"

[ -e "$logfile" ] && rm "$logfile"

openssl x509 -text -in "cert.pem" -out "$logfile"
