/**
 * src/main/main.js -- The part of electric-huxley that runs in electron's main thread
 *
 * This code is based on electron-screenshot-app by FWeinb.
 * https://github.com/FWeinb/electron-screenshot-app
 *
 * (C) Fabrice Weinberg <Fabrice@weinberg.me> 2014 - 2015
 * (C) Stripe 2015
 */

/* eslint-env node */

"use strict";

var BrowserWindow = require("browser-window");
var path = require("path");
var ipc = require("ipc");
var app = require("app");
var fs = require("fs");

var sock = require("axon").socket("rep");
var currentOptions;

sock.connect(parseInt(process.env.PORT, 10));

app.on("ready", function () {
  var popupWindow;

  var loadNext;

  var activeTasks = 0;
  var onSynced = null;
  var sizeEvent = null;

  sock.on("message", function (task, options, reply) {
    switch (task) {
      case "set-chrome-url":
        var chromeLoaded = false;
        popupWindow = new BrowserWindow({
          x: 0,
          y: 0,
          width: 1024,
          height: 768,
          show: false,
          frame: false,
          preload: path.join(__dirname, "../", "renderer", "preloaded.js"),
          transparent: false,
          "enable-larger-than-screen": true,
          "skip-taskbar": true,
          "use-content-size": true
        });

        // Inject custom CSS if necessary
        var loadEvent = "Loaded-" + popupWindow.id;
        sizeEvent = "Size-" + popupWindow.id;

        popupWindow.webContents.executeJavaScript(
          "window.swidth = \"" + 1024 + "\";" +
          "window.sheight = \"" + 768 + "\";"
        );

        popupWindow.webContents.on("did-fail-load", function (err, errorCode, errorDescription) {
          // There's a lot of chunder when run with xvfb-run because xvfb doesn't support hardware rendering,
          // so lets make this really stand out.
          console.error("--------------------------------------------------------------------------------\n" +
                        "FAILED TO LOAD THE REQUESTED WEBPAGE. IS YOUR SERVER AT " + options + " RUNNING?\n" +
                        "--------------------------------------------------------------------------------");
          console.log("Error code: ", errorCode);
          console.log("Error description: ", errorDescription);
          throw new Error("Failed to load webpage " + err);
        });

        popupWindow.webContents.on("crashed", function () {
          // See note under did-fail-load
          console.error("--------------------------------------------------------------------------------\n" +
                        "Electron crashed.\n" +
                        "--------------------------------------------------------------------------------");
          throw new Error("Electron crashed");
        });

        ipc.on("did-finish-load", function() {
          popupWindow.webContents.send("ensure-rendered", loadEvent);
        });

        ipc.on("close", function() {
          app.quit();
        });

        ipc.on(loadEvent, function () {
          var outputPath = currentOptions && currentOptions.screenshotPrefix + "1.png";
          var cb = function (data, err) {
            if (data.isEmpty()) {
              console.error("Got empty screenshot.");
            }
            if (err) {
              throw err;
            }
            ++activeTasks;
            setTimeout(function() {
              fs.writeFile(outputPath, data.toPng(), function() {
                --activeTasks;
                if (!activeTasks && onSynced) {
                  onSynced();
                  onSynced = 0;
                }
              });
            }, 200);
            loadNext();
          };

          if (!chromeLoaded) {
            chromeLoaded = true;
            console.log("Chrome page rendered succesfully. Loading first test.");
            reply();
          } else {
            popupWindow.capturePage(cb);
          }
        });

        ipc.on(sizeEvent, function (e, data) {
          var size = popupWindow.getSize();
          if (size[0] !== data.width || size[1] !== data.height) {
            console.log("This test does not fit in the viewport. Expanding to " + data.width + "x" + data.height);
            popupWindow.once("resize", function() {
              // This is unfortunate. I don"t know how to get an event once the window has finished resizing.
              setTimeout(function() {
                popupWindow.webContents.send("ensure-rendered", loadEvent);
              }, 20);
            });
            popupWindow.setSize(data.width, data.height);
          } else {
            popupWindow.webContents.send("ensure-rendered", loadEvent);
          }
        });

        popupWindow.loadUrl(options);
        break;

      case "run-task":
        popupWindow.webContents.executeJavaScript(
          "window.swidth = \"" + options.screenSize[0] + "\";" +
          "window.sheight = \"" + options.screenSize[1] + "\";"
        );
        currentOptions = options;
        loadNext = function() {
          reply();
        };
        popupWindow.setSize(options.screenSize[0], options.screenSize[1]);
        options.sizeEvent = sizeEvent;
        popupWindow.webContents.send("next-screenshot", options);
        break;
      case "sync":
        if (!activeTasks) {
          reply();
        } else {
          onSynced = reply;
        }
        break;
    }
  });

  sock.on("close", function () {
    app.terminate();
    app.quit();
  });
});

