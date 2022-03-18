#!/usr/bin/env node

/* jshint esversion: 8 */
/* global describe */
/* global before */
/* global after */
/* global it */

'use strict';

// We cannot currently test the UI so we will test the API only

// https://app.swaggerhub.com/apis/invoiceninja/invoiceninja/5.1.17

// The api somehow needs to have website visitors to trigger some events for now

require('chromedriver');

const execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    superagent = require('superagent'),
    { Builder } = require('selenium-webdriver'),
    { Options } = require('selenium-webdriver/chrome');

describe('Application life cycle test', function () {
    this.timeout(0);

    const LOCATION = 'test';
    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };

    const email = 'admin@cloudron.local';
    const password = 'changeme';

    const VENDOR_NAME = 'Cloudron Vendor';
    const CLIENT_NAME = 'Cloudron Client';

    let app, token, clientId, vendorId, invoiceId, browser;

    before(function () {
        const options = new Options().windowSize({ width: 1280, height: 1024 });
        if (process.env.HEADLESS) options.addArguments('headless');
        browser = new Builder().forBrowser('chrome').setChromeOptions(options).build();
    });

    after(function () {
        browser.quit();
    });

    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }

    function getAppInfo () {
        const inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(a => a.location === LOCATION || a.location === LOCATION + '2')[0];
        expect(app).to.be.an('object');
    }

    // the setTimout retry on 500 is since for some reason the app is shaky during startup
    function retry(func) {
        return async function () {
            for (let i = 0; i < 10; i++) {
                try {
                    return await func();
                } catch (error) {
                    if (error.message !== 'kickme') throw error;

                    console.log('kicking app. attempt', i);
                    await browser.get('https://' + app.fqdn);
                    await sleep(2000);
                    continue; // try again
                }
            }
        }
    }

    async function login() {
        const response = await superagent.post('https://' + app.fqdn + '/api/v1/login?first_load=true')
            .send({ email: email, password: password })
            .ok(() => true);

        expect(response.status).to.eql(200);

        token = response.body.data[0].token.token;
    }

    async function createVendor() {
        const response = await superagent.post('https://' + app.fqdn + '/api/v1/vendors')
            .send({ name: VENDOR_NAME }).set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);
        vendorId = response.body.data.id;
    }

    async function getVendor() {
        const response = await superagent.get('https://' + app.fqdn + '/api/v1/vendors/' + vendorId)
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);
        expect(response.body.data.name).to.equal(VENDOR_NAME);
    }

    async function createClient() {
        const response = await superagent.post('https://' + app.fqdn + '/api/v1/clients')
            .send({ name: CLIENT_NAME })
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);

        clientId = response.body.data.id;
    }

    async function getClient() {
        const response = await superagent.get('https://' + app.fqdn + '/api/v1/clients/' + clientId)
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);
        expect(response.body.data.name).to.equal(CLIENT_NAME);
    }

    async function createInvoice() {
        const response = await superagent.get('https://' + app.fqdn + '/api/v1/invoices/create')
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);

        var invoice = response.body;
        invoice.client_id = clientId;

        const response2 = await superagent.post('https://' + app.fqdn + '/api/v1/invoices')
            .send(invoice)
            .set('X-API-Token', token )
            .ok(() => true);

        if (response2.status === 500) throw new Error('kickme');
        expect(response2.status).to.eql(200);

        invoiceId = response2.body.data.id;
    }

    async function getInvoice() {
        const response = await superagent.get('https://' + app.fqdn + '/api/v1/invoices/' + invoiceId)
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);
        expect(response.body.data.client_id).to.equal(clientId);
    }

    async function getPreviewPdf() {
        // data taken from a UI request dump
        const designData = {'entity_type':'invoice','entity_id':'','design':{'name':'','design':{'includes':'<style id="style">\n    :root {\n        --primary-color: $primary_color;\n        --secondary-color: $secondary_color;\n    }\n\n    body {\n        -webkit-font-smoothing: antialiased;\n        -moz-osx-font-smoothing: grayscale;\n        font-family: Arial, Helvetica, sans-serif;\n        font-size: "$font_size";\n        zoom: 80%;\n    }\n\n    @page {\n        margin: $global_margin;\n    }\n\n    p {\n        margin: 0;\n        padding: 0;\n    }\n\n    .header-container {\n        display: grid;\n        grid-template-columns: 1fr 1fr 1fr;\n        gap: 20px;\n    }\n\n    .header-container .company-logo {\n        height: 4rem;\n    }\n\n    #company-details {\n        display: flex;\n        flex-direction: column;\n    }\n\n    #company-details > span:first-child {\n        color: var(--primary-color);\n    }\n\n    #company-address {\n        display: flex;\n        flex-direction: column;\n    }\n\n    .entity-label {\n        text-transform: uppercase;\n        margin-top: 3.5rem;\n        padding-left: 1rem;\n        margin-bottom: 1rem;\n        font-weight: bold;\n        color: var(--primary-color);\n    }\n\n    .client-and-entity-wrapper {\n        display: grid;\n        grid-template-columns: 1fr 1fr;\n        padding: 1rem;\n        border-top: 1px solid #d8d8d8;\n        border-bottom: 1px solid #d8d8d8;\n    }\n\n    #entity-details {\n        text-align: left;\n    }\n\n    #entity-details > tr,\n    #entity-details th {\n        font-weight: normal;\n    }\n\n    #client-details {\n        display: flex;\n        flex-direction: column;\n    }\n\n    #client-details > :first-child {\n        font-weight: bold;\n    }\n\n    #product-table,\n    #delivery-note-table,\n    #task-table {\n        margin-top: 3rem;\n        /* margin-bottom: 200px; */\n        min-width: 100%;\n        table-layout: fixed;\n        overflow-wrap: break-word;\n    }\n\n    .task-time-details {\n        display: block;\n        margin-top: 5px;\n        color: grey;\n    }\n\n    #product-table > thead,\n    #delivery-note-table > thead,\n    #task-table > thead {\n        text-align: left;\n    }\n\n    #product-table > thead > tr > th,\n    #delivery-note-table > thead > tr > th,\n    #task-table > thead > tr > th {\n        font-size: 1.1rem;\n        padding-bottom: 1.5rem;\n        padding-left: 1rem;\n    }\n\n    #product-table > thead > tr > th:nth-last-child(1),\n    #delivery-note-table > thead > tr > th:nth-last-child(1),\n    #task-table > thead > tr > th:nth-last-child(1) {\n        text-align: right;\n    }\n\n    #product-table > tbody > tr > td,\n    #delivery-note-table > tbody > tr > td,\n    #task-table > tbody > tr > td {\n        border-top: 1px solid #d8d8d8;\n        border-bottom: 1px solid #d8d8d8;\n        padding: 1rem;\n    }\n\n    #product-table > tbody > tr > td:first-child,\n    #delivery-note-table > tbody > tr > td:first-child,\n    #task-table > tbody > tr > td:first-child {\n        color: var(--primary-color);\n    }\n\n    #product-table > tbody > tr > td:last-child,\n    #delivery-note-table > tbody > tr > td:last-child,\n    #task-table > tbody > tr > td:last-child {\n        text-align: right;\n    }\n\n    #product-table > tbody > tr:nth-child(odd),\n    #delivery-note-table > tbody > tr:nth-child(odd),\n    #task-table > tbody > tr:nth-child(odd) {\n        background-color: #f5f5f5;\n    }\n\n    #table-totals {\n        page-break-inside: avoid;\n    }\n\n    #table-totals {\n        display: grid;\n        grid-template-columns: 2fr 1fr;\n        padding-top: .5rem;\n        gap: 80px;\n    }\n\n    #table-totals .totals-table-right-side>* {\n        display: grid;\n        grid-template-columns: 1fr 1fr;\n    }\n\n    #table-totals>.totals-table-right-side>*> :nth-child(1) {\n        text-align: left;\n    }\n\n    #table-totals>.totals-table-right-side>*> :nth-child(2) {\n        text-align: right;\n    }\n\n    #table-totals\n    > *\n    [data-element=\'product-table-balance-due-label\'],\n    #table-totals\n    > *\n    [data-element=\'product-table-balance-due\'] {\n        font-weight: bold;\n    }\n\n    #table-totals\n    > *\n    [data-element=\'product-table-balance-due\'] {\n        color: var(--primary-color);\n    }\n\n    #table-totals > * > :last-child {\n        text-align: right;\n        padding-right: 1rem;\n    }\n</style>\n','header':'<div id="header"></div>\n','body':'<div id="body">\n    <div class="header-container">\n        <img class="company-logo" src="$company.logo" alt="$company.name logo">\n\n        <div id="company-details"></div>\n        <div id="company-address"></div>\n    </div>\n\n    <p class="entity-label">$entity_label</p>\n    <div class="client-and-entity-wrapper">\n        <table id="entity-details" cellspacing="0"></table>\n\n        <div id="client-details"></div>\n    </div>\n\n    <table id="product-table" cellspacing="0"></table>\n\n    <table id="task-table" cellspacing="0"></table>\n\n    <div id="table-totals" cellspacing="0"></div>\n\n    <table id="delivery-note-table" cellspacing="0"></table>\n</div>\n','product':'','task':'','footer':'<div id="footer"></div>\n'},'is_custom':true,'created_at':0,'updated_at':0,'archived_at':0,'id':'-113','isChanged':false,'is_deleted':false}};

        const response = await superagent.post('https://' + app.fqdn + '/api/v1/preview')
            .send(designData)
            .set('X-API-Token', token )
            .ok(() => true);

        if (response.status === 500) throw new Error('kickme');
        expect(response.status).to.eql(200);
        expect(response.type).to.eql('application/pdf');
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync('cloudron install --location ' + LOCATION, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can login', login);
    it('can create a vendor', retry(createVendor));
    it('vendor exists', retry(getVendor));
    it('can create a client', retry(createClient));
    it('client exists', retry(getClient));
    it('can create an invoice', retry(createInvoice));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('can restart app', function () { execSync('cloudron restart --app ' + app.id, EXEC_ARGS); });

    it('vendor exists', retry(getVendor));
    it('client exists', retry(getClient));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('backup app', function () { execSync('cloudron backup create --app ' + app.id, EXEC_ARGS); });

    it('restore app', function () {
        const backups = JSON.parse(execSync('cloudron backup list --raw --app ' + app.id));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('vendor exists', retry(getVendor));
    it('client exists', retry(getClient));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('move to different location', async function () {
        // ensure we don't hit NXDOMAIN in the mean time
        await browser.get('about:blank');
        execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, EXEC_ARGS);
    });
    it('can get new app information', getAppInfo);

    it('vendor exists', retry(getVendor));
    it('client exists', retry(getClient));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('uninstall app', async function () {
        // ensure we don't hit NXDOMAIN in the mean time
        await browser.get('about:blank');
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
    });

    // update test
    it('can install app', function () { execSync('cloudron install --appstore-id com.invoiceninja.cloudronapp2 --location ' + LOCATION, EXEC_ARGS); });
    it('can get app information', getAppInfo);

    it('can login', login);
    it('can create a vendor', retry(createVendor));
    it('vendor exists', retry(getVendor));
    it('can create a client', retry(createClient));
    it('client exists', retry(getClient));
    it('can create an invoice', retry(createInvoice));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('can update', function () {
        console.log('Make sure to submit the browser confirm dialog to update the flutter app.');
        execSync('cloudron update --app ' + app.id, EXEC_ARGS);
    });

    it('can login', login);
    it('vendor exists', retry(getVendor));
    it('client exists', retry(getClient));
    it('invoice exists', retry(getInvoice));
    it('can render preview pdf', retry(getPreviewPdf));

    it('uninstall app', function () { execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS); });
});
