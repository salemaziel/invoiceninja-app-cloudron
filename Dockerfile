FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code /app/pkg
WORKDIR /app/code

RUN apt update && \
    # Unicode support for PDF
    apt install -y fonts-noto-cjk-extra fonts-wqy-microhei fonts-wqy-zenhei xfonts-wqy && \
    rm -rf /var/cache/apt /var/lib/apt/lists

RUN curl -sS -o - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - && \
    echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list && \
    apt-get update && \
    apt-get install -y google-chrome-stable && \
    rm -rf /var/cache/apt /var/lib/apt/lists

# Install saxon extension
RUN wget https://downloads.saxonica.com/SaxonC/HE/12/SaxonCHE-linux-x86_64-12-9-0.zip -O saxon.zip && \
    unzip saxon.zip -d saxon && \
    cp -r saxon/SaxonCHE-linux-x86_64-12-9-0/SaxonCHE/bin/* /usr/bin/ && \
    cp -r saxon/SaxonCHE-linux-x86_64-12-9-0/SaxonCHE/lib/* /usr/lib/ && \
    cp -r saxon/SaxonCHE-linux-x86_64-12-9-0/SaxonCHE/include/* /usr/include/ && \
    rm -rf saxon.zip && \
    cd saxon/SaxonCHE-linux-x86_64-12-9-0/php/src/ && \
    phpize && \
    ./configure --with-saxon && \
    make && \
    make install && \
    cd /app/code && \
    printf "%s\n" "; configuration for php Saxon HE/PE/EE module" "extension=saxon.so" > /etc/php/8.3/mods-available/saxon.ini && \
    phpenmod saxon && \
    rm -rf saxon

# renovate: datasource=github-releases depName=invoiceninja/invoiceninja versioning=semver extractVersion=^v(?<version>.+)$
ARG INVOICENINJA_VERSION=5.12.55

RUN curl -L https://github.com/invoiceninja/invoiceninja/releases/download/v${INVOICENINJA_VERSION}/invoiceninja.tar | tar -xz -f - -C /app/code && \
    chown -R www-data:www-data /app/code

RUN ls -l /app/code

RUN sudo -u www-data php /app/code/artisan optimize -vvv \
    && rm -rf /app/code/bootstrap/cache && ln -s /run/invoiceninja/bootstrap-cache /app/code/bootstrap/cache \
    && mv /app/code/storage /app/code/storage-vanilla && ln -s /app/data/storage /app/code/storage \
    && rm -rf /app/code/public/storage && ln -s /app/data/public-storage /app/code/public/storage \
    && rm -f /app/code/.env && ln -s /app/data/env /app/code/.env \
    && rm -rf /app/code/docs

# this will add --no-sandbox to chromium
RUN sed  "s/config('ninja\.is_docker')/true/g" -i app/Utils/Traits/Pdf/PdfMaker.php

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
    a2enmod rewrite expires headers cache

# artisan queue:work needs pcntl_async_signals(), pcntl_signal(), pcntl_alarm()
RUN crudini --set /etc/php/8.3/apache2/php.ini PHP disable_functions pcntl_fork,pcntl_waitpid,pcntl_wait,pcntl_wifexited,pcntl_wifstopped,pcntl_wifsignaled,pcntl_wifcontinued,pcntl_wexitstatus,pcntl_wtermsig,pcntl_wstopsig,pcntl_signal_get_handler,pcntl_signal_dispatch,pcntl_get_last_error,pcntl_strerror,pcntl_sigprocmask,pcntl_sigwaitinfo,pcntl_sigtimedwait,pcntl_exec,pcntl_getpriority,pcntl_setpriority,pcntl_unshare, && \
    crudini --set /etc/php/8.3/apache2/php.ini PHP upload_max_filesize 500M && \
    crudini --set /etc/php/8.3/apache2/php.ini PHP post_max_size 500M && \
    crudini --set /etc/php/8.3/apache2/php.ini PHP max_input_vars 1800 && \
    crudini --set /etc/php/8.3/apache2/php.ini Session session.save_path /run/invoiceninja/sessions && \
    crudini --set /etc/php/8.3/apache2/php.ini Session session.gc_probability 1 && \
    crudini --set /etc/php/8.3/apache2/php.ini Session session.gc_divisor 100

RUN cp /etc/php/8.3/apache2/php.ini /app/pkg/php.ini && \
    rm -rf /etc/php/8.3/apache2/php.ini && rm -rf /etc/php/8.3/cli/php.ini && \
    ln -s /run/php.ini /etc/php/8.3/apache2/php.ini &&  ln -s /run/php.ini /etc/php/8.3/cli/php.ini

# configure supervisor
ADD supervisor/ /etc/supervisor/conf.d/
RUN sed -e 's,^logfile=.*$,logfile=/run/supervisord.log,' -i /etc/supervisor/supervisord.conf

COPY start.sh env.template /app/pkg/

CMD [ "/app/pkg/start.sh" ]
