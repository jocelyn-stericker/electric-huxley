/**
 * src/main/main.js -- The part of electric-huxley that runs in electron's renderer thread.
 * 
 * (C) Stripe 2015
 */

(function() {
  var ipc = require('ipc');
  
  function onceContentRendered(cb) {
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (document.readyState !== 'complete') {
          console.log(document.readyState);
        }
        cb();
      });
    });
  };

  function expandViewportToFitContents() {
    // We want to increase the height if needed, but not the width.
    var w = window;
    var d = document;
    var e = d.documentElement;
    var g = d.body;
    var width = w.innerWidth;
    var height = Math.max(w.innerHeight, e.clientHeight, g.clientHeight, window.sheight);
    ipc.send(sizeEvent, {width: width, height: height});
  };

  function ensureRendered(callbackEventName) {
    onceContentRendered(function() {
      ipc.send(callbackEventName);
    });
  }

  var currentURL;
  function runNextTest(options) {
    var url = options.testURL;
    if (currentURL === url) {
      // No need to request a new page, just adjust the size.
      expandViewportToFitContents();
    } else {
      fetch(url).
        then(function(response) {
          return response.text();
        }).then(function(body) {
          document.body = new DOMParser()
            .parseFromString(body, 'text/html')
            .getElementsByTagName('body')[0];
  
          onceContentRendered(function() {
            expandViewportToFitContents();
          });
        });
    }
  }

  ipc.on('next-screenshot', runNextTest);
  ipc.on('ensure-rendered', ensureRendered);
}());
