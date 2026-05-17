#!/bin/bash
# Script to generate signing keystore for kidgame
# Run locally and commit the keystore file to the repository

set -e

KEYSTORE="kidgame.jks"
ALIAS="kidgame"
STORE_PASSWORD="kidgame123"
KEY_PASSWORD="kidgame123"
VALIDITY=10000

if [ -f "$KEYSTORE" ]; then
    echo "Keystore already exists: $KEYSTORE"
    echo "If you want to regenerate, delete it first."
    exit 0
fi

echo "Generating keystore: $KEYSTORE"
keytool -genkeypair \
    -keyalg RSA \
    -keysize 2048 \
    -validity $VALIDITY \
    -keystore "$KEYSTORE" \
    -storepass "$STORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -alias "$ALIAS" \
    -dname "CN=kidgame, OU=kidgame, O=kidgame, L=beijing, ST=beijing, C=CN"

echo ""
echo "Keystore created: $KEYSTORE"
echo "Store password: $STORE_PASSWORD"
echo "Key password: $KEY_PASSWORD"
echo "Alias: $ALIAS"
echo ""
echo "IMPORTANT: Commit this keystore to the repository!"
echo "Add to .gitignore if you want to keep it private."