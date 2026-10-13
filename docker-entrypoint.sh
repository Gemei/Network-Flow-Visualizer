#!/bin/sh
set -e

echo "Applying database schema..."
node /opt/prisma-cli/node_modules/prisma/build/index.js db push --skip-generate
echo "Database ready."

exec "$@"
