/**
 * src/main/main.js -- The part of electric-huxley that runs in electron's renderer thread.
 *
 * (C) Stripe 2015
 */

/* eslint-env node, browser */

(function() {
  "use strict";

  // ipc is a module that lets us communicate with the parent ("main"/electron) thread.
  // Here, require is provided by electron.
  var ipc = require("ipc");

  /**
   * Runs cb() after at least one frame has been rendered.
   * @param callback Function called after at least one frame has been rendered
   */
  function onceContentRendered(callback) {
    // requestAnimationFrame's callback happens right before a paint. So, it takes two calls
    // before we can be confident that one paint has happened.
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (document.readyState !== "complete") {
          // We can't efficiently wait for resources here, so lets make the user put all used
          // resources in the chrome file.
          throw new Error("The page is not ready. Put any recorded resources in the chrome file.");
        }
        callback();
      });
    });
  }

  /**
   * Makes a request to the parent ("main") thread with the ideal window size.
   *
   * @param sizeEvent string the name of the event to send to the parent thread
   */
  function expandViewportToFitContents(sizeEvent) {
    // We want to increase the height if needed, but not the width.
    var documentElement = document.documentElement;
    // We're hoping one of these actually represents the window height, but who knows?
    var height = Math.max(window.innerHeight, documentElement.clientHeight, document.body.clientHeight, window.innerHeight);
    ipc.send(sizeEvent, {
      width: window.innerWidth,
      height: height
    });
  }

  /**
   * A function for use by the parent ("main") thread that renders at least one frame and then
   * calls a callback function in the parent thread.
   *
   * @param callbackEventName string the name of the event to send to the parent thread after one frame
   */
  ipc.on("ensure-rendered", function ensureRendered(callbackEventName) {
    onceContentRendered(function() {
      ipc.send(callbackEventName);
    });
  });

  // We store the URL currently being explored here.
  var currentURL;

  /**
   * A function for use by the parent ("main") thread that loads the next test.
   *
   * @param options.sizeEvent string a callback event name that will resize the page.
   * @param options.testURL string the URL to load the body of. The head is not loaded (it's kept from the chrome page)
   */
  ipc.on("next-screenshot", function runNextTest(options) {
    var url = options.testURL;
    if (currentURL === url) {
      // No need to request a new page, just adjust the size.
      expandViewportToFitContents(options.sizeEvent);
    } else {
      fetch(url).
        then(function(response) {
          return response.text();
        }).then(function(body) {
          document.body = new DOMParser()
            .parseFromString(body, "text/html")
            .getElementsByTagName("body")[0];

          onceContentRendered(function() {
            expandViewportToFitContents(options.sizeEvent);
          });
        });
    }
  });

  ipc.send('did-finish-load');
}());
