#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push --skip-generate
echo "Database ready."

exec "$@"
