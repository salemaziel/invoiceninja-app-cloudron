#!/usr/bin/env node

/* jshint esversion: 8 */
/* global describe */
/* global before */
/* global after */
/* global it */

'use strict';

require('chromedriver');

var execSync = require('child_process').execSync,
    expect = require('expect.js'),
    path = require('path'),
    fs = require('fs'),
    { Builder, By, Key, until } = require('selenium-webdriver'),
    { Options } = require('selenium-webdriver/chrome');

describe('Application life cycle test', function () {
    this.timeout(0);

    const LOCATION = 'test';
    const TEST_TIMEOUT = parseInt(process.env.TIMEOUT, 10) || 20000;
    const EXEC_ARGS = { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' };

    const firstname = 'testfirstname';
    const lastname = 'testlastname';
    const email = 'admin@cloudron.local';
    const password = 'changeme';

    var browser, app;

    before(function () {
        browser = new Builder().forBrowser('chrome').setChromeOptions(new Options().windowSize({ width: 1280, height: 1024 })).build();
    });

    after(function () {
        browser.quit();
    });

    function sleep(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }

    async function waitForElement(elem) {
        await browser.wait(until.elementLocated(elem), TEST_TIMEOUT);
        await browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT);
    }

    function assertElementText (elem, supposedText) {
        return browser.findElement(elem).getText()
          .then(text => {
            if (text === supposedText) return true;
            else throw new Error(`Assertion error. Expected text '${supposedText}'. Got '${text}.'`);
          });
    }

    function getAppInfo () {
        const inspect = JSON.parse(execSync('cloudron inspect'));
        app = inspect.apps.filter(a => a.location === LOCATION || a.location === LOCATION + '2')[0];
        expect(app).to.be.an('object');
    }

    function clearUpdateMessage () {
        return browser.get('https://' + app.fqdn);
    }

    async function login () {
        await browser.manage().deleteAllCookies();

        await browser.get('https://' + app.fqdn);
        await sleep(3000);
        await browser.findElement(By.xpath('//body')).click();
        await sleep(3000);
        await waitForElement(By.xpath('//span[text()="Recover Password"]'));

        // TODO elements are not interactable
        // await waitForElement(By.id('email'));
        // await browser.findElement(By.id('email')).sendKeys(email);
        // await browser.findElement(By.id('current-password')).sendKeys(password);
        // await browser.sleep(3000);
        // await browser.findElement(By.xpath('//form')).submit();
        // await waitForElement(By.xpath('//span[text()="Dashboard"]'));
    }

    async function canGetPage () {
        await browser.get('https://' + app.fqdn);
        // await waitForElement(By.xpath('//span[text()="New Company"]'));

        await sleep(3000);
        await browser.findElement(By.xpath('//body')).click();
        await sleep(3000);
        await waitForElement(By.xpath('//span[text()="Recover Password"]'));
    }

    async function logout () {
        await browser.get('https://' + app.fqdn);

        await waitForElement(By.xpath('//span[text()="New Company"]'));
        await browser.findElement(By.xpath('//span[text()="New Company"]')).click();
        await waitForElement(By.xpath('//span[text()="Log Out"]'));
        await browser.findElement(By.xpath('//span[text()="Log Out"]')).click();

        // TODO we see a popup where the ok button is rendered in a canvas with no way to get the DOM node
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    // it('install app', function () { execSync('cloudron install --location ' + LOCATION, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can login', login);
    it('can get page', canGetPage);
    // it('can logout', logout);

    it('can restart app', function () { execSync('cloudron restart --app ' + app.id, EXEC_ARGS); });

    // it('can login', login);
    it('can get page', canGetPage);
    // it('can logout', logout);

    it('backup app', function () { execSync('cloudron backup create --app ' + app.id, EXEC_ARGS); });

    it('restore app', async function () {
        await browser.get('about:blank');
        const backups = JSON.parse(execSync('cloudron backup list --raw --app ' + app.id));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    // it('can login', login);
    it('can get page', canGetPage);
    // it('can logout', logout);

    it('move to different location', async function () {
        await browser.get('about:blank');
        execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, EXEC_ARGS);
    });
    it('can get new app information', getAppInfo);

    // it('can login', login);
    it('can get page', canGetPage);
    // it('can logout', logout);

    it('uninstall app', async function () {
        await browser.get('about:blank');
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
    });

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
