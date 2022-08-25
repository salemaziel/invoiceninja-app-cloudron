#!/bin/bash
set -eu

readonly ARTISAN="php /app/code/artisan"
readonly COMPOSER="sudo -u www-data composer --working-dir=/app/code"

echo "==> Startup"

# ensure directories
mkdir -p /app/data/public-storage /run/invoiceninja/sessions /run/invoiceninja/bootstrap-cache /run/invoiceninja/cache /run/invoiceninja/logs

echo "==> Create php.ini"
cp /app/pkg/php.ini /run/php.ini
if [[ -f /sys/fs/cgroup/cgroup.controllers ]]; then # cgroup v2
    memory_full=$(cat /sys/fs/cgroup/memory.max)
    [[ "${memory_full}" == "max" ]] && memory_full=$(( 2 * 1024 * 1024 * 1024 )) # "max" means unlimited
    memory_limit=$((memory_full/1024/1024)) # we will give php 50% of the whole memory, so just the allocated RAM
else
    memory_full=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes) # this is the RAM. we have equal amount of swap
    memory_limit=$((memory_full/1024/1024)) # we will give php 50% of the whole memory, so just the allocated RAM
fi

crudini --set /run/php.ini PHP memory_limit ${memory_limit}M

# Settings which should be updated only once
if [[ ! -f "/app/data/env" ]]; then
    echo "==> Creating initial /app/data/env file"
    sed -e "s|.*\(API_SECRET\).*|\1=$(pwgen -1cns 32)|g" \
        -e "s|.*\(PRECONFIGURED_INSTALL\).*|\1=true|g" \
        /app/pkg/env.template > /app/data/env # sed -i seems to destroy symlink
fi

# Settings to be updated on every run.
echo "==> Update env file for database and email configs"
sed -e "s|.*\(APP_URL\).*|\1=${CLOUDRON_APP_ORIGIN}|g" \
    -e "s|.*\(DB_TYPE1\).*|\1=mysql|g" \
    -e "s|.*\(DB_HOST1\).*|\1=${CLOUDRON_MYSQL_HOST}|g" \
    -e "s|.*\(DB_DATABASE1\).*|\1=${CLOUDRON_MYSQL_DATABASE}|g" \
    -e "s|.*\(DB_USERNAME1\).*|\1=${CLOUDRON_MYSQL_USERNAME}|g" \
    -e "s|.*\(DB_PASSWORD1\).*|\1=${CLOUDRON_MYSQL_PASSWORD}|g" \
    -e "s|.*\(DB_PORT1\).*|\1=${CLOUDRON_MYSQL_PORT}|g" \
    -e "s|.*\(MAIL_DRIVER\).*|\1=smtp|g" \
    -e "s|.*\(MAIL_PORT\).*|\1=${CLOUDRON_MAIL_SMTP_PORT}|g" \
    -e "s|.*\(MAIL_ENCRYPTION\).*|\1=|g" \
    -e "s|.*\(MAIL_HOST\).*|\1=${CLOUDRON_MAIL_SMTP_SERVER}|g" \
    -e "s|.*\(MAIL_USERNAME\).*|\1=${CLOUDRON_MAIL_SMTP_USERNAME}|g" \
    -e "s|.*\(MAIL_FROM_ADDRESS\).*|\1=${CLOUDRON_MAIL_FROM}|g" \
    -e "s|.*\(MAIL_FROM_NAME\).*|\1=\"${CLOUDRON_MAIL_FROM_DISPLAY_NAME:-InvoiceNinja}\"|g" \
    -e "s|.*\(MAIL_PASSWORD\).*|\1=${CLOUDRON_MAIL_SMTP_PASSWORD}|g" \
    -e "s|.*\(REQUIRE_HTTPS\).*|\1=true|g" \
    -i /app/data/env

if [[ ! -f "/app/data/.dbsetup" ]]; then
    echo "==> Copying files on first run"
    cp -r /app/code/storage-vanilla /app/data/storage
    mkdir -p /app/data/public /app/code/storage/logs

    echo "==> Generate APP_KEY"
    $ARTISAN key:generate --force --no-interaction

    # chown -R www-data:www-data /app/data
    $ARTISAN optimize --no-interaction --verbose
    $ARTISAN migrate --force --no-interaction --verbose
    $ARTISAN db:seed --force --no-interaction --verbose

    $ARTISAN ninja:create-account --email admin@cloudron.local --password changeme --no-interaction --verbose

    touch "/app/data/.dbsetup"
else
    echo "==> Run db migration"
    # Put the application into maintenance mode
    $ARTISAN down --no-interaction --verbose

    # Run the database migrations
    $ARTISAN migrate --force --no-interaction --verbose

    # Optimize the framework for better performance
    $ARTISAN optimize --no-interaction --verbose

    # Bring the application out of maintenance mode
    $ARTISAN up --no-interaction --verbose
fi

# sessions directory
rm -rf /app/data/storage/framework/sessions && ln -s /run/invoiceninja/sessions /app/data/storage/framework/sessions
rm -rf /app/data/storage/framework/cache && ln -s /run/invoiceninja/cache /app/data/storage/framework/cache
rm -rf /app/data/storage/logs && ln -s /run/invoiceninja/logs /app/data/storage/logs

# clear cached stuff under /app/data/storage/framework (https://github.com/laravel/framework/issues/17377)
$ARTISAN view:clear
$ARTISAN cache:clear

# ensure permissions are set correctly
chown -R www-data:www-data /app/data /run/invoiceninja

echo "==> Starting InvoiceNinja"
exec /usr/bin/supervisord --configuration /etc/supervisor/supervisord.conf --nodaemon -i InvoiceNinja

