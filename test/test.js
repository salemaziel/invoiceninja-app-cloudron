#!/usr/bin/env node

/* jshint esversion: 8 */
/* global describe */
/* global before */
/* global after */
/* global it */

'use strict';

// We cannot currently test the UI so we will test the API only

// https://app.swaggerhub.com/apis/invoiceninja/invoiceninja/5.1.17

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    superagent = require('superagent'),
    fs = require('fs');

describe('Application life cycle test', function () {
    this.timeout(0);

    const LOCATION = 'test';
    const TEST_TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 20000;
    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };

    const firstname = 'testfirstname';
    const lastname = 'testlastname';
    const email = 'admin@cloudron.local';
    const password = 'changeme';

    const VENDOR_NAME = 'Cloudron Vendor';

    var app, token, vendorId;

    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }

    function getAppInfo () {
        const inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(a => a.location === LOCATION || a.location === LOCATION + '2')[0];
        expect(app).to.be.an('object');
    }

    function login (callback) {
        superagent.post('https://' + app.fqdn + '/api/v1/login?first_load=true').send({ email: email, password: password }).end(function (error, result){
            expect(error).to.be(null);
            expect(result.status).to.eql(200);

            token = result.body.data[0].token.token;

            callback();
        });
    }

    function createVendor(callback) {
        superagent.post('https://' + app.fqdn + '/api/v1/vendors').send({ name: VENDOR_NAME }).set('X-API-Token', token ).end(function (error, result) {
            expect(error).to.be(null);
            expect(result.status).to.eql(200);

            vendorId = result.body.data.id;

            callback();
        });
    }

    function getVendor(callback) {
        superagent.get('https://' + app.fqdn + '/api/v1/vendors/' + vendorId).set('X-API-Token', token ).end(function (error, result) {
            expect(error).to.be(null);
            expect(result.status).to.eql(200);
            expect(result.body.data.name).to.equal(VENDOR_NAME);

            callback();
        });
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync('cloudron install --location ' + LOCATION, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can login', login);
    it('can create a project', createVendor);
    it('project exists', getVendor);

    it('can restart app', function () { execSync('cloudron restart --app ' + app.id, EXEC_ARGS); });

    it('project exists', getVendor);

    it('backup app', function () { execSync('cloudron backup create --app ' + app.id, EXEC_ARGS); });

    it('restore app', function () {
        const backups = JSON.parse(execSync('cloudron backup list --raw --app ' + app.id));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('project exists', getVendor);

    it('move to different location', function () { execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, EXEC_ARGS); });
    it('can get new app information', getAppInfo);

    it('project exists', getVendor);

    it('uninstall app', function () { execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS); });

    // // update test
    // it('can install app', function () { execSync('cloudron install --appstore-id com.invoiceninja.cloudronapp --location ' + LOCATION, EXEC_ARGS); });

    // it('can get app information', getAppInfo);
    // it('can register', register);
    // it('can login', login);
    // xit('can accept ToS', acceptTos); // sometimes it asks for it, sometimes doesn't
    // it('can accept cookies', acceptCookies);
    // it('can create invoice', createInvoice);
    // it('invoice exists', checkInvoiceExists);
    // it('can logout', logout);

    // it('can update', function () { execSync('cloudron update --app ' + app.id, EXEC_ARGS); });

    // it('clear update message', clearUpdateMessage);
    // it('can login', login);
    // it('can accept cookies', acceptCookies);
    // it('invoice exists', checkInvoiceExists);
    // it('can logout', logout);

    // it('uninstall app', async function () {
    //     await browser.get('about:blank');
    //     execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
    // });
});
