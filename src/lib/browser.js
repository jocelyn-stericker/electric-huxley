/**
 * src/lib/browser.js -- Controls an electron browser. This file runs in node.
 *
 * This code is based on electron-screenshot-service by FWeinb.
 * https://github.com/FWeinb/electron-screenshot-service
 *
 * (C) Fabrice Weinberg <Fabrice@weinberg.me> 2014 - 2015
 * (C) Stripe 2015
 */

/* eslint-env node */

"use strict";

var Promise = require("bluebird");
// axon is a socket library that lets us talk to an electron-prebuilt process we'll spin up
var axon = require("axon");
// the 'require' part of the electron-prebuild npm module is just the path to the included executable
var electronPath = require("electron-prebuilt");
var path = require("path");
var spawn = require("child_process").spawn;

// This is a path to the main folder of the electron application
var electronAppFolder = path.join(__dirname, "../", "main");

/* ---- THE BROWSER CLASS -------------------------------------------------------------*/

var Browser = function (sock) {
  this.sock = sock;
};

/**
 * @param options.record Array<actions> an array of huxley actions
 * @param options.screenshotPrefix string screenshots are written to ${screenshotPrefix}${idx}.png
 * @param options.testURL string the URL to load. Only the body is loaded. For changes to the header, create a new Browser
 * @param options.screenSize [x,y] an array with X and Y dimensions for the viewport. The rendered size will be the greater
 *                           of the screen size and the document size, so you'll never get scrollbars (unless the website gets taller beacuse
 *                           of a resize).
 */
Browser.prototype.runTask = function(options) {
  var deferred = Promise.pending();

  this.sock.send("run-task", options, function(error) {
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

  this.sock.send("sync", null, function(error) {
    if (error) {
      deferred.reject(error);
      return;
    }

    deferred.resolve();
  });

  return deferred.promise;
};

/* ---- THE BROWSER LIFECYCLE METHODS -------------------------------------------------*/

// A promise which resolves when the browser has launched.
var isStarted;

// An axon socket for communicating with the browser.
var sock;

// The child process.
var child;

/**
 * Creates a test environment
 *
 * @param chromeURL string a URL with a blank body. The body from other tests will be injected into this page.
 */
var createBrowser = function (chromeURL) {
  sock = axon.socket("req");

  isStarted = new Promise(function (resolve, reject) {
    sock.on("connect", function () {
      sock.send("set-chrome-url", chromeURL, function (error) {
        if (error) {
          reject(error);
        }

        resolve(new Browser(sock));
      });
    });

    sock.on("error", function (error) {
      reject({type: "socket", error: error});
    });

    // Start the server on a free port
    sock.bind(0, "localhost", function () {
      process.env.PORT = sock.server.address().port;
      child = spawn(electronPath, [
        electronAppFolder
      ],
      {
        cwd: electronAppFolder
      });
      child.stdout.on("data", function(data) {
        console.log(data.toString().
          split("\n").
          map(function(line) {
            return "[electron] " + line;
          }).join("\n"));
      });
      child.stderr.on("data", function(data) {
        console.warn(data.toString().
          split("\n").
          map(function(line) {
            return "[electron] " + line;
          }).join("\n"));
      });

      child.on("exit", function (error) {
        reject({type: "electron", path: electronPath, error: error});
      });
    });
  });

  return isStarted;
};

module.exports = {
  /**
   * Creates a browser that opens to chromeURL.
   *
   * @param chromeURL string the path of the page with all test resources
   */
  createBrowser: function (chromeURL) {
    if (isStarted) {
      throw new Error("Close the current browser before creating a new one.");
    }
    return createBrowser(chromeURL);
  },

  /**
   * Closes the browser.
   */
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
