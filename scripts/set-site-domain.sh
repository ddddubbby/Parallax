#!/bin/sh
# Compatible entry point; recursive, cross-platform origin stamping + rebuild.
set -eu
if [ "$#" -ne 1 ]; then
  echo "usage: $0 https://your-domain" >&2
  exit 1
fi
exec node "$(dirname "$0")/site-domain.mjs" "$1"
