/**
 * src/lib/browser.js -- Controls an electron browser
 * 
 * This code is based on electron-screenshot-service by FWeinb.
 * https://github.com/FWeinb/electron-screenshot-service
 *
 * (C) Fabrice Weinberg <Fabrice@weinberg.me> 2014 - 2015
 * (C) Stripe 2015
 */

'use strict';

var path = require('path');

var axon = require('axon');
var spawn = require('win-spawn');
var Promise = require('bluebird');

var electronpath = require('electron-prebuilt');
var app = path.join(__dirname, '../', 'main');

var Browser = function (sock) {
  this.sock = sock;
};

/**
 * @param options.record Array<actions> an array of huxley actions
 * @param options.screenshotPrefix string screenshots are written to ${screenshotPrefix}${idx}.png
 * @param options.testURL string the URL to load. Only the body is loaded. For changes to the header, create a new Browser
 * @param options.screenSize [x,y] an array with X and Y dimensions for the viewport. The rendered size will be the greater
 *                           of the screen size and the document size, so you'll never get scrollbars.
 */
Browser.prototype.runTask = function(options) {
  var deferred = Promise.pending();

  this.sock.send('run-task', options, function(error) {
    if (error) {
      deferred.reject(error);
      return;
    }

    deferred.resolve();
  });

  return deferred.promise;
};

/**
 * Returns a promise that is resolved when the browser process has finished writting the files.
 */
Browser.prototype.sync = function() {
  var deferred = Promise.pending();

  this.sock.send('sync', null, function(error) {
    if (error) {
      deferred.reject(error);
      return;
    }

    deferred.resolve();
  });

  return deferred.promise;
}

var isStarted;
var sock;
var child;

/**
 * Creates a test environment
 *
 * @param chromeURL string a URL with a blank body. The body from other tests will be injected into this page.
 */
var createBrowser = function (chromeURL) {
  sock = axon.socket('req');

  isStarted = new Promise(function (resolve, reject) {
    sock.on('connect', function () {
      sock.send('set-chrome-url', chromeURL, function (error) {
        if (error) {
          reject(error);
        }

        resolve(new Browser(sock));
      });
    });

    sock.on('error', function (error) {
      reject({type: 'socket', error: error});
    });

    // Start the server on a free port
    sock.bind(undefined, 'localhost', function () {
      process.env.PORT = sock.server.address().port;
      child = spawn(electronpath, [
        '../main/'
      ],
      {
        cwd: app,
      });
      child.stdout.on('data', function(data) {
        console.log(data.toString().split('\n').map(function(line) { return '[electron] ' + line; }).filter(function(line) { return line}).join('\n'));
      });
      child.stderr.on('data', function(data) {
        console.warn(data.toString().split('\n').map(function(line) { return '[electron] ' + line; }).filter(function(line) { return line}).join('\n'));
      });

      child.on('exit', function (error) {
        reject({type: 'electron', path: electronpath, error: error});
      });
    });
  });

  return isStarted;
};

module.exports = {
  createBrowser: function (chromeURL) {
    if (isStarted) {
      throw new Error('Close the current browser before creating a new one.');
    }
    return createBrowser(chromeURL);
  },

  close: function () {
    isStarted = undefined;
    if (sock) {
      try {
        sock.close();
        child.kill();
      } catch(e) {
        (function noop() {})();
      }
    }
  }
};
