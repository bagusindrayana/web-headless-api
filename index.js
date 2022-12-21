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
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const app = new Koa();
app.use(bodyParser());
const jsesc = require('jsesc');

const headersToRemove = [
    "host", "user-agent", "accept", "accept-encoding", "content-length",
    "forwarded", "x-forwarded-proto", "x-forwarded-for", "x-cloud-trace-context"
];
const responseHeadersToRemove = ["Accept-Ranges", "Content-Length", "Keep-Alive", "Connection", "content-encoding", "set-cookie"];

(async () => {
    let options = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox','--enable-features=ExperimentalJavaScript']
    };
    // if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD)
    //     options.executablePath = '/usr/bin/chromium-browser';
    // if (process.env.PUPPETEER_HEADFUL)
    //     options.headless = false;
    // if (process.env.PUPPETEER_USERDATADIR)
    //     options.userDataDir = process.env.PUPPETEER_USERDATADIR;
    // if (process.env.PUPPETEER_PROXY)
    //     options.args.push(`--proxy-server=${process.env.PUPPETEER_PROXY}`);
    // const browser = await puppeteer.launch(options);
    
    const browser = await puppeteer.connect({ browserWSEndpoint: 'wss://chrome.browserless.io?token=d7f96a2a-c778-4d6d-a483-fe1f77d59710' });

    app.use(async ctx => {
        if (ctx.query.url) {
            const url = ctx.url.replace("/?url=", "");
            let responseBody;
            let responseData;
            let responseHeaders;
            const page = await browser.newPage();
            await page.setJavaScriptEnabled(true)
            if (ctx.method == "POST") {
                await page.removeAllListeners('request');
                await page.setRequestInterception(true);
                page.on('request', interceptedRequest => {
                    var data = {
                        'method': 'POST',
                        'postData': ctx.request.rawBody
                    };
                    interceptedRequest.continue(data);
                });
            }
            const client = await page.target().createCDPSession();
            await client.send('Network.setRequestInterception', {
                patterns: [{
                    urlPattern: '*',
                    resourceType: 'Document',
                    interceptionStage: 'HeadersReceived'
                }],
            });

            await client.on('Network.requestIntercepted', async e => {
                let obj = { interceptionId: e.interceptionId };
                if (e.isDownload) {
                    await client.send('Network.getResponseBodyForInterception', {
                        interceptionId: e.interceptionId
                    }).then((result) => {
                        if (result.base64Encoded) {
                            responseData = Buffer.from(result.body, 'base64');
                        }
                    });
                    obj['errorReason'] = 'BlockedByClient';
                    responseHeaders = e.responseHeaders;
                }
                await client.send('Network.continueInterceptedRequest', obj);
                if (e.isDownload)
                    await page.close();
            });
            let headers = ctx.headers;
            
            headersToRemove.forEach(header => {
                delete headers[header];
            });
            await page.setExtraHTTPHeaders(headers);
            try {
                let response;
                let tryCount = 0;
                response = await page.goto(url, { timeout: 30000, waitUntil: 'domcontentloaded' });
                responseBody = await response.text();
                responseData = await response.buffer();
                while (responseBody.includes("challenge-running") && tryCount <= 10) {
                    newResponse = await page.waitForNavigation({ timeout: 30000, waitUntil: 'domcontentloaded' });
                    if (newResponse) response = newResponse;
                    responseBody = await response.text();
                    responseData = await response.buffer();
                    tryCount++;
                }
                responseHeaders = await response.headers();
                const cookies = await page.cookies();
                if (cookies)
                    cookies.forEach(cookie => {
                        const { name, value, secure, expires, domain, ...options } = cookie;
                        ctx.cookies.set(cookie.name, cookie.value, options);
                    });
            } catch (error) {
                if (!error.toString().includes("ERR_BLOCKED_BY_CLIENT")) {
                    ctx.status = 500;
                    ctx.body = error;
                }
            }

            await page.close();
            responseHeadersToRemove.forEach(header => delete responseHeaders[header]);
            Object.keys(responseHeaders).forEach(header => ctx.set(header, jsesc(responseHeaders[header])));
            ctx.body = responseData;
        }
        else {
            ctx.body = "Please specify the URL in the 'url' query string.";
        }
    });
    console.log("Listen on port 3000");
    app.listen(process.env.PORT || 3000);
})();
