/**
 * src/lib/index.js -- Node.js interface to electric-huxley
 * 
 * This code is based on node-huxley by chenglou.
 * https://github.com/chenglou/node-huxley
 *
 * (C) chenglou <chenglou92@gmail.com> 2013-2015
 * (C) Stripe 2015
 */

'use strict';
var chalk = require('chalk');
console.time(chalk.green('import'));

var Promise = require('bluebird');
var _ = require('lodash');
var childProcess = require('child_process');
var electron = require('electron-prebuilt');
var fs = require('fs');
var fsP = Promise.promisifyAll(fs);
var globP = Promise.promisify(require('glob'));
var md5File = require('md5-file');
var mkdirp = require('mkdirp');
var path = require('path');
var rimraf = require('rimraf');
require('events').EventEmitter.prototype._maxListeners = 100;

var HUXLEYFILE_NAME = 'Huxleyfile.json';
var HUXLEY_FOLDER_NAME = 'Huxleyfolder';
var TASK_FOLDER_SUFFIX = '.hux';
var RECORD_FILE_SUFFIX = '.record.json';

var browserManager = require('./browser');

function loadJSON(p) {
  return fsP
    .readFileAsync(p, {encoding: 'utf8'})
    .then(JSON.parse);
}

function getFlatUniquePaths(globs) {
  console.time(chalk.green('getFlatUniquePaths'));
  return Promise.
    map(globs, function(glob) {
      return globP(glob);
    }).then(function(huxleyfilesPaths) {
      var paths = _.uniq(_.flatten(huxleyfilesPaths));
      console.timeEnd(chalk.green('getFlatUniquePaths'));
      console.log(paths);
      return paths;
    });
}

// trim down the Huxleyfile json tasks to only those asked to run by `taskName`
function filterRunnables(JSONs, paths, taskName) {
  // since the JSONS array might shrink, pass huxleyfile paths too and shrink
  // accordingly
  if (taskName == null) {
    return [JSONs, paths];
  }

  var filtered = JSONs.map(function(JSONContent) {
    return JSONContent.filter(function(task) {
      return task.name === taskName;
    });
  });

  var newJSONs = [];
  var newPaths = [];
  for (var i = 0; i < filtered.length; i++) {
    if (filtered[i].length !== 0) {
      newJSONs.push(filtered[i]);
      newPaths.push(paths[i]);
    }
  }

  return [newJSONs, newPaths];
}

function loadRunnables(globs, taskName) {
  return getFlatUniquePaths(globs)
    .then(function(ps) {
      if (ps.length === 0) {
        return Promise.reject(new Error('No Huxleyfile found.'));
      }

      return Promise
        .map(ps, loadJSON)
        .then(function(JSONs) {
          var dirs = ps.map(path.dirname);
          return filterRunnables(JSONs, dirs, taskName);
        });
      });
}

function runTasks(fn, opts, tasks, paths) {
  var deepEmpty = tasks.every(function(task) {
    return task.length === 0;
  });

  if (deepEmpty) {
    var msg = opts.taskName == null ?
      'Designated Huxleyfile(s) empty.' :
      'No task named "' + opts.taskName + '" found.';
    return Promise.reject(new Error(msg));
  }

  var taskDescription = _.map(tasks, function(content, i) {
    return {
      content: content,
      path: paths[i]
    };
  });

  return new Promise(function(resolve, reject) {
    fn(taskDescription, opts, resolve, reject);
  });
}

function runRunnableTasks(fn, opts) {
  if (opts.globs && opts.globs.length !== 0) {
    opts.globs = opts.globs.map(function(glob) {
      // if the user didn't append 'Huxleyfile.json' at the end of the glob, do
      // it for them
      return _.endsWith(glob, HUXLEYFILE_NAME) ?
        glob :
        path.join(glob, HUXLEYFILE_NAME);
    });
  } else {
    opts.globs = [path.join(process.cwd(), '**', HUXLEYFILE_NAME)];
  }

  return loadRunnables(opts.globs, opts.taskName)
    .spread(function(runnableTasks, runnablePaths) {
      return runTasks(fn, opts, runnableTasks, runnablePaths);
    });
}

function assertOptionsAreCompatible(opts) {
  if (!opts.chromeURL) {
    throw new Error('electron-huxley expected to be passed a chromeURL in options, but none was given');
  }
  if (opts.browserName && opts.browserName !== 'chrome') {
    throw new Error('electric-huxley only supports Chrome. Clear browserName, or set it to Chrome');
  }
  if (opts.serverUrl) {
    throw new Error('electric-huxley does not support serverUrl. Everything happens locally!');
  }
  if (opts.injectedDriver) {
    throw new Error('electric-huxley does not support injectedDriver. Everything happens locally!');
  }
}

function loadJSONSync(p) {
  // TODO(jnetterf): Make async
  return JSON.parse(fs.readFileSync(p, {encoding: 'utf8'}));
}

var activeBrowser = null;
var tasks = {
  /**
   * @param action enum 'write' or 'compare'
   * @param taskDescriptions object[] with Huxleyfile.json content (array) and path
   * @param opts object with chromeURL, keepAlive? and globs. See README
   * @param resolve function(message?) called when completed
   * @param reject function(error?) called if the task could not be completed.
   */
  screenshotTask: function(action, taskDescriptions, opts, resolve, reject) {
    if (activeBrowser) {
      console.time(chalk.green('load specs'));
      runTests();
      return;
    }
    console.time(chalk.green('launch electron'));
    browserManager.createBrowser(opts.chromeURL).then(function(browser) {
      console.timeEnd(chalk.green('launch electron'));
      console.time(chalk.green('load specs'));
      activeBrowser = browser;
      runTests();
    });
    
    function runTests() {
      var specs = [];
      _.forEach(taskDescriptions, function(taskDescription) {
        _.forEach(taskDescription.content, function(testDescription) {
          var recordPath = path.join(
            taskDescription.path,
            HUXLEY_FOLDER_NAME,
            testDescription.name + RECORD_FILE_SUFFIX
          );
          var screenshotPrefix = path.join(
            taskDescription.path,
            HUXLEY_FOLDER_NAME,
            testDescription.name + TASK_FOLDER_SUFFIX,
            'chrome-'
          );
          var canonicalScreenshotPrefix = screenshotPrefix;
          if (action === 'compare') {
            screenshotPrefix += 'tmp-';
          }
          specs.push({
            record: loadJSONSync(recordPath),
            screenshotPrefix: screenshotPrefix,
            canonicalScreenshotPrefix: canonicalScreenshotPrefix,
            testURL: testDescription.url,
            screenSize: testDescription.screenSize,
          });
        });
      });

      console.timeEnd(chalk.green('load specs'));
      console.time(chalk.green('all screenshots'));
      return Promise.reduce(specs, function(memo, spec) {
        console.log(chalk.blue('Rendering ' + spec.testURL + ' at ' + spec.screenSize[0] + 'x' + spec.screenSize[1] + '+ to Huxleyfolder...'));
        mkdirp.sync(spec.screenshotPrefix.slice(0, spec.screenshotPrefix.lastIndexOf('/')));

        var promise = activeBrowser.runTask(spec);
        return promise;
      }, 0).then(function() {
        console.time(chalk.green('sync'));
        return activeBrowser.sync();
      }).then(function() {
        console.timeEnd(chalk.green('sync'));
        console.timeEnd(chalk.green('all screenshots'));
        var failedOne = false;
        if (action === 'compare') {
          console.time(chalk.green('compare'));
          return Promise.settle(Promise.map(specs, function(spec) {
            var deferred = Promise.pending();
            var screenshotPrefix = spec.screenshotPrefix;
            var canonicalScreenshotPrefix = spec.canonicalScreenshotPrefix;

            md5File(canonicalScreenshotPrefix + '1.png', function(err, sum) {
              if (err) {
                console.log(err);
                throw err;
              }
              md5File(canonicalScreenshotPrefix + 'tmp-1.png', function(err2, sum2) {
                if (err2) {
                  console.log(err2);
                  throw err2;
                }
                if (sum === sum2) {
                  deferred.resolve();
                } else {
                  childProcess.exec('compare ' + canonicalScreenshotPrefix + '1.png ' + screenshotPrefix + '1.png -metric rmse ' +
                                    canonicalScreenshotPrefix + 'diff-1.png', function(err, stdout, stderr) {
                    if (stderr !== '0 (0)') {
                      console.warn(chalk.red(canonicalScreenshotPrefix + '1.png does not match ' + screenshotPrefix + '. The new image has ' +
                        'been kept and the difference has been saved to ' + canonicalScreenshotPrefix + 'diff-1.png'));
                      failedOne = true;
                      deferred.resolve(); // continue executing. We'll crash later so we have a list of broken things.
                    } else {
                      console.log(canonicalScreenshotPrefix + '1.png matches ' + screenshotPrefix + '-1.png, but their SHAs do not match. ' +
                        'Consider rerendering these pages to make comparing screenshots faster.');
                      deferred.resolve();
                    }
                  });
                }
              });
            });

            return deferred.promise.
              then(function() {
                // rimraf(canonicalScreenshotPrefix + 'diff*.png', function() {});
                // rimraf(canonicalScreenshotPrefix + 'tmp*.png', function() {});
              }).finally(function() {
                if (!opts.keepAlive) {
                  browserManager.close();
                  activeBrowser = null;
                }
            });
          }, 5 )).then(function() {
            if (action === 'compare') {
              console.timeEnd(chalk.green('compare'));
            }
            if (failedOne) {
              throw new Error('Failed one or more tasks.');
            }
            resolve();
          }).catch(reject);
        } else {
          if (!opts.keepAlive) {
            browserManager.close();
            activeBrowser = null;
          }
          resolve();
        }
        if (action === 'compare') {
          console.timeEnd(chalk.green('compare'));
        }
      }).catch(function(err) {
        console.warn('Failed to render all screenshots.');
        console.warn(err);
        // We don't know what the current state of the browser is. Close it to be safe.
        activeBrowser = null;
        browserManager.close();
        reject(err);
      });
    }
  },
};

function runTask(task, opts) {
  opts = opts || {};
  assertOptionsAreCompatible(opts);
  return runRunnableTasks(task, opts);
};

module.exports = {
  writeScreenshots: runTask.bind(null, tasks.screenshotTask.bind(null, 'write')),
  compareScreenshots: runTask.bind(null, tasks.screenshotTask.bind(null, 'compare')),
  recordTasks: function(opts) {
    throw new Error('electric-huxley has not implemented recordTasks');
  },
  defaultWorkflow: function(opts) {
    throw new Error('electric-huxley has not implemented defaultWorkflow');
  },
  closeBrowser: function() {
    if (activeBrowser) {
      browserManager.close();
      activeBrowser = null;
    }
  }
};

console.timeEnd(chalk.green('import'));
