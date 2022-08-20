FROM cloudron/base:3.2.0@sha256:ba1d566164a67c266782545ea9809dc611c4152e27686fd14060332dd88263ea

RUN mkdir -p /app/code /app/pkg
WORKDIR /app/code

RUN add-apt-repository --yes ppa:ondrej/php && \
    apt update && \
    apt-get remove -y php-* php7.4-* libapache2-mod-php7.4 && \
    apt-get autoremove -y && \
# dependencies for chromium headless used by https://github.com/beganovich/snappdf
    apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libxcomposite1 libgbm1 libgtk-3-0 && \
    apt-get install -y php8.1 php8.1-{apcu,bcmath,bz2,cgi,cli,common,curl,dba,dev,enchant,fpm,gd,gmp,gnupg,imagick,imap,interbase,intl,ldap,mailparse,mbstring,mysql,odbc,opcache,pgsql,phpdbg,pspell,readline,redis,snmp,soap,sqlite3,sybase,tidy,uuid,xml,xmlrpc,xsl,zip,zmq} libapache2-mod-php8.1 && \
    rm -r /var/cache/apt /var/lib/apt/lists

ARG VERSION=5.5.14

# make sure to change ownership on symlinks using `chown -h www-data:www-data ...`, otherwise php refuses to include files within them:
# https://serverfault.com/questions/393240/how-do-i-resolve-a-php-error-failed-opening-required-in-a-symlink-context
RUN wget https://github.com/invoiceninja/invoiceninja/releases/download/v${VERSION}/invoiceninja.zip -O ninja.zip \
    && unzip ninja.zip \
    && rm -f /tmp/ninja.zip \
    && chown -R www-data:www-data /app/code

# RUN sudo -u www-data composer dump-autoload --working-dir=/app/code --optimize --no-interaction \
RUN sudo -u www-data php /app/code/artisan optimize --force --no-interaction --verbose \
    && rm -rf /app/code/bootstrap/cache && ln -s /run/invoiceninja/bootstrap-cache /app/code/bootstrap/cache \
    && mv /app/code/storage /app/code/storage-vanilla && ln -s /app/data/storage /app/code/storage \
    && rm -rf /app/code/public/storage && ln -s /app/data/public-storage /app/code/public/storage \
    && rm -f /app/code/.env && ln -s /app/data/env /app/code/.env \
    && rm -rf /app/code/docs

# configure apache
RUN rm /etc/apache2/sites-enabled/*
RUN sed -e 's,^ErrorLog.*,ErrorLog "|/bin/cat",' -i /etc/apache2/apache2.conf
COPY apache/mpm_prefork.conf /etc/apache2/mods-available/mpm_prefork.conf

RUN a2disconf other-vhosts-access-log
ADD apache/invoiceninja.conf /etc/apache2/sites-enabled/invoiceninja.conf
RUN echo "Listen 8000" > /etc/apache2/ports.conf

# configure mod_php. apache2ctl -M can be used to list enabled modules
# the sessions path is unused since invoiceninja uses lavarel sessions
RUN a2dismod perl && \
    a2enmod rewrite && \
    a2enmod expires && \
    a2enmod headers && \
    a2enmod cache

# artisan queue:work needs pcntl_async_signals(), pcntl_signal(), pcntl_alarm()
RUN crudini --set /etc/php/8.1/apache2/php.ini PHP disable_functions pcntl_fork,pcntl_waitpid,pcntl_wait,pcntl_wifexited,pcntl_wifstopped,pcntl_wifsignaled,pcntl_wifcontinued,pcntl_wexitstatus,pcntl_wtermsig,pcntl_wstopsig,pcntl_signal_get_handler,pcntl_signal_dispatch,pcntl_get_last_error,pcntl_strerror,pcntl_sigprocmask,pcntl_sigwaitinfo,pcntl_sigtimedwait,pcntl_exec,pcntl_getpriority,pcntl_setpriority,pcntl_unshare, && \
    crudini --set /etc/php/8.1/apache2/php.ini PHP upload_max_filesize 500M && \
    crudini --set /etc/php/8.1/apache2/php.ini PHP post_max_size 500M && \
    crudini --set /etc/php/8.1/apache2/php.ini PHP max_input_vars 1800 && \
    crudini --set /etc/php/8.1/apache2/php.ini Session session.save_path /run/invoiceninja/sessions && \
    crudini --set /etc/php/8.1/apache2/php.ini Session session.gc_probability 1 && \
    crudini --set /etc/php/8.1/apache2/php.ini Session session.gc_divisor 100

RUN cp /etc/php/8.1/apache2/php.ini /app/pkg/php.ini && \
    rm -rf /etc/php/8.1/apache2/php.ini && rm -rf /etc/php/8.1/cli/php.ini && \
    ln -s /run/php.ini /etc/php/8.1/apache2/php.ini &&  ln -s /run/php.ini /etc/php/8.1/cli/php.ini

# configure supervisor
ADD supervisor/ /etc/supervisor/conf.d/
RUN sed -e 's,^logfile=.*$,logfile=/run/supervisord.log,' -i /etc/supervisor/supervisord.conf

# temporary fix for pdf generation via snappdf - https://github.com/invoiceninja/invoiceninja/issues/7151#issuecomment-1019587793
RUN cd /app/code/vendor/beganovich/snappdf/versions && wget https://invoiceninja.org/chrome.zip -O chrome.zip && unzip -o chrome.zip && rm chrome.zip
ENV SNAPPDF_CHROMIUM_PATH "/app/code/vendor/beganovich/snappdf/versions/959838-Linux_x64/chrome-linux/chrome"

COPY start.sh env.template /app/pkg/

CMD [ "/app/pkg/start.sh" ]
