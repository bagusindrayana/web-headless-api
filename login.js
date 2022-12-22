const Captcha = require("2captcha")
const puppeteer = require('puppeteer-extra');
require('puppeteer-extra-plugin-stealth/evasions/chrome.app');
require('puppeteer-extra-plugin-stealth/evasions/chrome.csi');
require('puppeteer-extra-plugin-stealth/evasions/chrome.loadTimes');
require('puppeteer-extra-plugin-stealth/evasions/chrome.runtime');
require('puppeteer-extra-plugin-stealth/evasions/iframe.contentWindow');
require('puppeteer-extra-plugin-stealth/evasions/media.codecs');
require('puppeteer-extra-plugin-stealth/evasions/navigator.hardwareConcurrency');
require('puppeteer-extra-plugin-stealth/evasions/navigator.languages');
require('puppeteer-extra-plugin-stealth/evasions/navigator.permissions');
require('puppeteer-extra-plugin-stealth/evasions/navigator.plugins');
require('puppeteer-extra-plugin-stealth/evasions/navigator.vendor');
require('puppeteer-extra-plugin-stealth/evasions/navigator.webdriver');
require('puppeteer-extra-plugin-stealth/evasions/sourceurl');
require('puppeteer-extra-plugin-stealth/evasions/user-agent-override');
require('puppeteer-extra-plugin-stealth/evasions/webgl.vendor');
require('puppeteer-extra-plugin-stealth/evasions/window.outerdimensions');
require('puppeteer-extra-plugin-stealth/evasions/defaultArgs');
require('puppeteer-extra-plugin-user-data-dir');
require('puppeteer-extra-plugin-user-preferences');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const express = require('express');
function delay(time) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }
const app = express();
app.get('/screenshot', async (req, res) => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto("https://beta.character.ai/login",{ timeout: 30000, waitUntil: 'domcontentloaded' });
    const navigationPromise = page.waitForNavigation()
    await delay(1000);
    console.log("check if login button is visible...");
    await page.waitForSelector('a[href="/login"]',{ visible: true, timeout: 30000 });
    console.log("click login button...");
    await page.click('a[href="/login"]');
    await delay(1000);
    await page.waitForSelector('.modal .btn.btn-primary',{ visible: true, timeout: 30000 });
    await page.click('.modal .btn.btn-primary');
    await delay(1000);
    await page.waitForSelector('.modal .btn.border',{ visible: true, timeout: 30000 });
    await page.click('.modal .btn.border');
    await navigationPromise;
    await delay(1000);
    //await page.waitForSelector('.ulp-recaptcha-container',{ visible: true, timeout: 30000 });
    // //get data-recaptcha-sitekey
    const sitekey = await page.evaluate(() => {
        return document.querySelector('.ulp-recaptcha-container').getAttribute('data-recaptcha-sitekey');
    });
    
    const solver = new Captcha.Solver("392d570f4770f561020eb23ccfb415d2")
    var captcha_answer;
    /* Example ReCaptcha Website */
    await solver.recaptcha(sitekey, page.url()).then((res) => {
        console.log(res)
        captcha_answer = res['data'];
    })
    .catch((err) => {
        console.error(err.message)
    });

    await page.type('input[name="username"]', "bagusindrayanaindo@gmail.com");
    await page.type('input[name="password"]', "test1234");
    await page.type('input[name="captcha"]', captcha_answer);
    
    //submit login button
    await page.click('button[type="submit"]');
    await navigationPromise;
    const screenshotBuffer = await page.screenshot({fullPage: true});

    // Respond with the image
    res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': screenshotBuffer.length
    });
    res.end(screenshotBuffer);

    await browser.close();
})

app.listen(3000);
