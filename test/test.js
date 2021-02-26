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
    const email = 'user@example.com';
    const password = 'password';

    var browser, app;

    before(function () {
        browser = new Builder().forBrowser('chrome').setChromeOptions(new Options().windowSize({ width: 1280, height: 1024 })).build();
    });

    after(function () {
        browser.quit();
    });

    function waitForElement (elem) {
        return browser.wait(until.elementLocated(elem), TEST_TIMEOUT)
          .then(() => browser.wait(until.elementIsVisible(browser.findElement(elem)), TEST_TIMEOUT));
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

    function register () {
        return browser.manage().deleteAllCookies()
          .then(() => browser.get('https://' + app.fqdn))
          .then(() => browser.wait(until.elementLocated(By.id('first_name')), 60000)) // first load can be *slow*
          .then(() => browser.findElement(By.id('first_name')).sendKeys(firstname))
          .then(() => browser.findElement(By.id('last_name')).sendKeys(lastname))
          .then(() => browser.findElement(By.id('email')).sendKeys(email))
          .then(() => browser.findElement(By.id('password')).sendKeys(password))
          .then(() => browser.findElement(By.id('terms_checkbox')).click())
          .then(() => browser.findElement(By.id('privacy_checkbox')).click())
          .then(() => browser.findElement(By.css('.btn-lg')).click())
          .then(() => waitForElement(By.id('loginButton')));
    }

    function clearUpdateMessage () {
        return browser.get('https://' + app.fqdn);
    }

    function login () {
        return browser.manage().deleteAllCookies()
          .then(() => browser.sleep(3000))
          .then(() => browser.get('https://' + app.fqdn))
          .then(() => waitForElement(By.id('loginButton')))
          .then(() => browser.findElement(By.id('email')).sendKeys(email))
          .then(() => browser.findElement(By.id('password')).sendKeys(password))
          .then(() => browser.sleep(3000))
          .then(() => browser.findElement(By.id('loginButton')).click())
          .then(() => waitForElement(By.id('myAccountButton')));
    }

    function acceptCookies () {
        return browser.get('https://' + app.fqdn)
          .then(() => browser.sleep(3000)) // takes a while for the popup to appear
          .then(() => waitForElement(By.xpath('//a[text()="Got it!"]')))
          .then(() => browser.findElement(By.xpath('//a[text()="Got it!"]')).click()) // accept cookies
          .then(() => browser.sleep(3000));
    }

    function acceptTos () {
        return browser.get('https://' + app.fqdn)
          .then(() => waitForElement(By.id('accepted_terms')))
          .then(() => browser.sleep(3000))
          .then(() => browser.findElement(By.id('accepted_terms')).click())
          .then(() => browser.findElement(By.id('accepted_privacy')).click())
          .then(() => browser.findElement(By.xpath('//button[text()="Accept"]')).click())
          .then(() => browser.sleep(3000));
    }

    function logout () {
        browser.get('https://' + app.fqdn);

        return waitForElement(By.id('myAccountButton'))
          .then(() => browser.findElement(By.id('myAccountButton')).click())
          .then(() => waitForElement(By.xpath('//a[text()="Log Out"]')))
          .then(() => browser.findElement(By.xpath('//a[text()="Log Out"]')).click());
    }

    function createInvoice () {
        browser.get('https://' + app.fqdn + '/invoices');

        return waitForElement(By.xpath('//a[contains(text(), "New Invoice")]')) // "New Invoice" button
          .then(() => console.log('Invoice Page loaded'))
          .then(() => browser.findElement(By.xpath('//a[contains(text(), "New Invoice")]')).click())
          .then(() => waitForElement(By.id('createClientLink'))) // new invoice form
          .then(() => console.log('New Invoice Page loaded'))
          .then(() => browser.findElement(By.id('createClientLink')).click()) // open new client modal
          .then(() => console.log('Opening new client modal'))
          .then(() => waitForElement(By.id('client[name]')))
          .then(() => console.log('Opened new client modal'))
          .then(() => browser.findElement(By.id('client[name]')).sendKeys('testclient'))
          .then(() => browser.findElement(By.id('clientDoneButton')).click()) // adding client
          .then(() => console.log('New client added'))
          .then(() => browser.findElement(By.css('input.invoice-item:nth-child(2)')).sendKeys('testitem')) // item name : testitem
          .then(() => console.log('item name entered'))
          .then(() => browser.findElement(By.css('tr.sortable-row:nth-child(1) > td:nth-child(4) > input:nth-child(1)')).sendKeys('42')) // $42
          .then(() => console.log('item price entered'))
          .then(() => browser.findElement(By.css('tr.sortable-row:nth-child(1) > td:nth-child(5) > input:nth-child(1)')).sendKeys('1')) // 1 unit
          .then(() => console.log('item number entered'))
          .then(() => browser.executeScript('arguments[0].scrollIntoView(false)', browser.findElement(By.id('draftButton'))))
          .then(() => console.log('MAKE THE DRAFT BUTTON VISIBLE BY SCROLLING MANUALLY IF REQUIRED'))
          .then(() => browser.sleep(12000)) // if the test fails here, scroll the button above into view
          .then(() => browser.findElement(By.id('draftButton')).click())
    }

    function checkInvoiceExists () {
        browser.get('https://' + app.fqdn)

        return waitForElement(By.css('.nav-invoices > a:nth-child(2)')) // "Invoice" link in sidebar
          .then(() => console.log('Page loaded'))
          .then(() => browser.findElement(By.css('.nav-invoices > a:nth-child(2)')).click())
          .then(() => waitForElement(By.css('#top_right_buttons > a:nth-child(2)'))) // "New Invoice" button
          .then(() => console.log('Invoice Page loaded'))
          .then(() => waitForElement(By.css('.odd > td:nth-child(3) > a:nth-child(1)')))
          .then(() => console.log('found invoice line'))
          .then(() => assertElementText(By.css('.odd > td:nth-child(3) > a:nth-child(1)'), 'testclient'))
          .then(() => console.log('client name is as expected'))
          .then(() => assertElementText(By.css('.odd > td:nth-child(5)'), '$42.00'))
          .then(() => console.log('price is as expected'))
    }

    xit('build app', function () { execSync('cloudron build', EXEC_ARGS); });
    it('install app', function () { execSync('cloudron install --location ' + LOCATION, EXEC_ARGS); });

    it('can get app information', getAppInfo);

    it('can register', register);
    it('can login', login);
    it('can accept cookies', acceptCookies);
    it('can create invoice', createInvoice);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('can restart app', function () { execSync('cloudron restart --app ' + app.id, EXEC_ARGS); });

    it('can login', login);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('backup app', function () { execSync('cloudron backup create --app ' + app.id, EXEC_ARGS); });

    it('restore app', async function () {
        await browser.get('about:blank');
        const backups = JSON.parse(execSync('cloudron backup list --raw --app ' + app.id));
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
        execSync('cloudron install --location ' + LOCATION, EXEC_ARGS);
        getAppInfo();
        execSync(`cloudron restore --backup ${backups[0].id} --app ${app.id}`, EXEC_ARGS);
    });

    it('can login', login);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('move to different location', async function () {
        await browser.get('about:blank');
        execSync('cloudron configure --location ' + LOCATION + '2 --app ' + app.id, EXEC_ARGS);
    });
    it('can get new app information', getAppInfo);

    it('can login', login);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('uninstall app', async function () {
        await browser.get('about:blank');
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
    });

    // update test
    it('can install app', function () { execSync('cloudron install --appstore-id com.invoiceninja.cloudronapp --location ' + LOCATION, EXEC_ARGS); });

    it('can get app information', getAppInfo);
    it('can register', register);
    it('can login', login);
    xit('can accept ToS', acceptTos); // sometimes it asks for it, sometimes doesn't
    it('can accept cookies', acceptCookies);
    it('can create invoice', createInvoice);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('can update', function () { execSync('cloudron update --app ' + app.id, EXEC_ARGS); });

    it('clear update message', clearUpdateMessage);
    it('can login', login);
    it('can accept cookies', acceptCookies);
    it('invoice exists', checkInvoiceExists);
    it('can logout', logout);

    it('uninstall app', async function () {
        await browser.get('about:blank');
        execSync('cloudron uninstall --app ' + app.id, EXEC_ARGS);
    });
});
