# electric-huxley
This project takes screenshots of your webpages so you can check for changes and regressions.

It's likely not ready for production use yet, but pull requests are very welcome.

It aims to complement [node-huxley](https://github.com/chenglou/node-huxley). It aims to have the same API, but
makes different trade-offs:
 - it's really fast (a pull request with benchmarks is welcome)
 - it only supports a single target (electron, which renders like Chrome)
 - it only supports static pages (i.e., without JavaScript). If your goal is to test CSS components, or server
 rendered React components, this may suit your needs.
 - it expects all pages to have the same `<head>`

electric-huxley hasn't implemented all of node-huxley's APIs yet though. Right now electric-huxley only supports:
 - `writeScreenshots` with records that are composed of exactly one action: a screenshot
 - `compareScreenshots` with the same restriction

Pull requests are welcome.
 
Since this project has a similar API to `node-huxley`, you can use this project while developing, and then swap
this project out for `node-huxley` to check for pesky cross-platform issues.

## Getting started

You will likely want to run `electric-huxley` in a virtual machine so that you can get consistent renders across
physical machines. I use vagrant and VirtualBox, but you can use whatever you prefer.

You'll need node, gtk, gconf, nss, grunt, and imagemagick. On Linux, you also need an X server. xvfb should suit your
needs, but you may instead use a physical X server if you would like.
```
sudo apt-get install -y nodejs npm gtk2.0 libgconf2.0 libnss3 imagemagick xvfb
npm install -g grunt-cli
```

Next, add electric-huxley to your `package.json`:
```
npm install --save-dev jnetterf/electric-huxley
```

Consult node-huxley's documentation for usage, keeping in mind the above mentioned limitations.
