/**
 * test.js -- A really simple test. More to come.
 *
 * (C) Stripe 2015
 */

"use strict";

var hux = require("./src/lib/index");
var path = require("path");

/* eslint-env node */

var globs = [path.join(process.cwd(), "test", "Huxleyfile.json")];

hux.compareScreenshots({
  chromeURL: "http://localhost:8000/test/chrome.html",
  globs: globs
}).catch(function(err) {
  console.log(err);
  process.exit(1); // eslint-disable-line
});
