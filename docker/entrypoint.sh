#!/bin/sh
set -e

echo "============================================"
echo "  Trace-Dock - Starting Application"
echo "============================================"
echo ""

# Display configuration (mask sensitive data in URLs)
MASKED_URL=$(echo "${DATABASE_URL}" | sed 's/:[^:@]*@/:****@/g')
echo "Configuration:"
echo "  - Database Type: ${DB_TYPE}"
echo "  - Database URL: ${MASKED_URL}"
echo "  - Run Migrations: ${RUN_MIGRATIONS}"
echo "  - Server Port: ${PORT}"
echo "  - Debug Mode: ${DB_DEBUG}"
echo ""

# Ensure data directory exists and has correct permissions
if [ ! -d "${DATA_DIR}" ]; then
    echo "Creating data directory: ${DATA_DIR}"
    mkdir -p "${DATA_DIR}"
fi

# Run database setup/migrations if enabled
if [ "${RUN_MIGRATIONS}" = "true" ] || [ "${RUN_MIGRATIONS}" = "1" ]; then
    echo "Running database setup..."
    cd /app/server
    
    # Use npx tsx to run the setup script
    # The script handles creating the database and running migrations
    npx tsx scripts/db-setup.ts --type="${DB_TYPE}" --url="${DATABASE_URL}" 2>&1 || {
        echo ""
        echo "Warning: Database setup encountered an issue."
        echo "This may be normal if the database already exists."
        echo "Continuing startup..."
        echo ""
    }
    
    cd /app
    echo ""
    echo "Database setup complete."
    echo ""
fi

# Ensure proper ownership of data directory
if [ -d "${DATA_DIR}" ]; then
    chown -R tracedock:tracedock "${DATA_DIR}" 2>/dev/null || true
fi

echo "Starting services with supervisor..."
echo ""

# Start supervisor which manages nginx and the node server
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
