#!/bin/sh
# Dev-server launcher for tools that spawn without a login shell (e.g. the
# preview harness). Node lives in a user-local install that is not on the
# default PATH (see BUILD_NOTES S-002); Next spawns children that resolve
# `node` via env, so PATH must carry the directory.
export PATH="$HOME/.local/share/node-v22/bin:$PATH"
exec pnpm dev
