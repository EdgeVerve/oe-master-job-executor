/*
©2015-2016 EdgeVerve Systems Limited (a fully owned Infosys subsidiary), Bangalore, India. All Rights Reserved.
The EdgeVerve proprietary software program ("Program"), is protected by copyrights laws, international treaties and other pending or existing intellectual property rights in India, the United States and other countries.
The Program may contain/reference third party or open source components, the rights to which continue to remain with the applicable third party licensors or the open source community as the case may be and nothing here transfers the rights to the third party and open source components, except as expressly permitted.
Any unauthorized reproduction, storage, transmission in any form or by any means (including without limitation to electronic, mechanical, printing, photocopying, recording or  otherwise), or any distribution of this Program, or any portion of it, may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under the law.
*/
/**
 * This module elects a single master among the application cluster instances
 * and runs the specified job on the master instance. If the master goes down,
 * this module (in the remaining application instances) will elect a new master
 * and run the job again on the new master.
 *
 * An options object with the following properties needs to be passed to this
 * module:
 * lockName -  String. Mandatory. An arbitrary, unique name for the job that needs master execution
 * masterJob - Object. Mandatory. An object that encapsulates the actual job that needs to be executed.
 *             It should have the following members:
 *             start - Function. Mandatory. This function starts the job.
 *             stop  - Function. Optional. This function stops the job.
 * initDelay - Number. Optional. The amount of delay in ms before the first master election happens on boot
 *             Default is 20000 ms
 * heartbeatInterval - Number. Optional. The interval in ms between successive updates of the
 *                     heartbeatTime by the master in the MasterLock DB. Default is 8000 ms
 * tolerance - Number. Optional. The delay after which a master which failed to update its heartbeatTime
 *             is considered 'stale'. Default is 10000 ms. This needs to be greater that heartbeatInterval
 *             by at least 2 seconds, and maybe more, depending on system load and responsiveness.
 *
 * @file master-job-executor.js
 * @author Ajith Vasudevan
 */


/* eslint-disable no-console, no-loop-func */

function MasterJobExecutor(options) {
  var loopback = require('loopback');
  var TAG = 'master-job-executor.js: ';
  var log = require('oe-logger')('masterJobExecutor');
  var uuidv4 = require('uuid/v4');
  var MasterLock = loopback.getModelByType('MasterLock');
  var MasterControl = loopback.getModelByType('MasterControl');
  var os = require('os');
  var myInstanceID = uuidv4();
  var config;
  var LOCK_NAME;
  var masterJob;
  var hostname = os.hostname();
  var canBecomeMaster = false;
  var oeCloud = require('oe-cloud');
  var port = process.env.PORT || oeCloud.get('port');
  try {
    config =  oeCloud.get('masterJobExecutor');
  } catch (e) { log.warn(TAG, e.message); }

  var INIT_DELAY = process.env.MASTER_JOB_EXEC_INIT_DELAY || config && config.initDelay || 1000;
  var CHECK_MASTER_INTERVAL = process.env.CHECK_MASTER_INTERVAL || config && config.checkMasterInterval || 30000;
  var HEARTBEAT_INTERVAL = process.env.MASTER_JOB_HEARTBEAT_INTERVAL || config && config.heartbeatInterval || 8000;
  var MAX_MASTER_HEARTBEAT_RETRY_COUNT = process.env.MASTER_JOB_MAX_HEARTBEAT_RETRY_COUNT || config && config.maxHeartbeatRetryCount || 3;
  var TOLERANCE = process.env.MASTER_JOB_TOLERANCE || config && config.masterJobTolerance || HEARTBEAT_INTERVAL * 3;

  var opts = {
    ignoreAutoScope: true,
    fetchAllScopes: true
  };
  var masterId;
  var heartbeatInterval;
  var globalOptions;

  config = {
    getInitDelay: function () {return INIT_DELAY;},
    getCheckMasterInterval: function () {return CHECK_MASTER_INTERVAL;},
    getHeartbeatInterval: function () {return HEARTBEAT_INTERVAL;},
    getMaxHeartbeatRetryCount: function () {return MAX_MASTER_HEARTBEAT_RETRY_COUNT;},
    getTolerance: function () {return TOLERANCE;}
  };

  this.config = config;

  startMaster(options);


  function startMaster(options) {
    var TAG = 'startMaster(options): ';
    var msg;
    if (!options && !globalOptions) {
      msg = 'options are not passed to master-job-executor';
      log.error(TAG, msg);
      throw new Error(msg);
    }
    if (options) globalOptions = options;
    else options = globalOptions;

    if (options && options.lockName) LOCK_NAME = options.lockName;
    else {
      msg = 'lockName is not specified in options passed to master-job-executor';
      log.error(TAG, msg);
      throw new Error(msg);
    }
    if (options && options.masterJob) masterJob = options.masterJob;
    else {
      msg = 'masterJob is not specified in options passed to master-job-executor';
      log.error(TAG, msg);
      throw new Error(msg);
    }
    if (!(options.masterJob && options.masterJob.start && typeof options.masterJob.start === 'function')) {
      msg = 'masterJob.start is not a function in options passed to master-job-executor';
      log.error(TAG, msg);
      throw new Error(msg);
    }
    /* istanbul ignore else */
    if (options && options.checkMasterInterval)  CHECK_MASTER_INTERVAL = options.checkMasterInterval;
    /* istanbul ignore else */
    if (options && options.initDelay) INIT_DELAY = options.initDelay;
    /* istanbul ignore else */
    if (options && options.tolerance) TOLERANCE = options.tolerance;
    /* istanbul ignore else */
    if (options && options.heartbeatInterval) HEARTBEAT_INTERVAL = options.heartbeatInterval;
    /* istanbul ignore else */
    if (options && options.maxHeartbeatRetryCount) MAX_MASTER_HEARTBEAT_RETRY_COUNT = options.maxHeartbeatRetryCount;

    log.info(TAG, 'Waiting ' + INIT_DELAY / 1000 + ' sec for checking for ' + LOCK_NAME + ' Master');
    setTimeout(function () {
      checkMaster();
      setInterval(checkMaster, CHECK_MASTER_INTERVAL);
    }, INIT_DELAY);
  }


  function checkMaster() {
    var TAG = 'checkMaster(): ';
    MasterControl.findOne({where: {lockName: LOCK_NAME}}, opts, function findCb(err, masterControl) {
      /* istanbul ignore if */
      if (err) {
        log.error(TAG, 'Could not query for MasterControl ' + JSON.stringify(err));
        throw new Error('Could not query for MasterControl ' + JSON.stringify(err));
      }
      if (masterControl) {
        canBecomeMaster = false;
        log.debug(TAG, LOCK_NAME + ' flagged for disablement. Setting canBecomeMaster to false. Cannot become Master');
      } else {
        canBecomeMaster = true;
        log.debug(TAG, LOCK_NAME + ' flagged for enablement. Setting canBecomeMaster to true');
      }
      var filter = { where: { lockName: LOCK_NAME }};

      // Get the current lock instance from DB, if present.
      MasterLock.findOne(filter, opts, function findCb(err, masterInst) {
        /* istanbul ignore if */
        if (err) {
          log.error(TAG, 'Could not query for ' + LOCK_NAME + ' Master'  + JSON.stringify(err));
          throw new Error('Could not query for ' + LOCK_NAME + ' Master'  + JSON.stringify(err));

          // If a lock is present in DB ...
        } else if (!err && masterInst) {
          // and if its heartbeatTime is older than TOLERANCE
          if (Date.now() - masterInst.heartbeatTime > TOLERANCE) {
            log.debug(TAG, LOCK_NAME + ' Master is stale. Deleting stale ' + LOCK_NAME + ' master...');

            // delete the lock instance from DB
            masterInst.delete(opts, function (err, res) {
              /* istanbul ignore if */
              if (err) {
                log.error(TAG, 'Stale ' + LOCK_NAME + ' Master could not be deleted.'  + JSON.stringify(err));
                throw new Error('Stale ' + LOCK_NAME + ' Master could not be deleted.'  + JSON.stringify(err));
              }
              clearInterval(heartbeatInterval);
              masterJob.stop();
              log.debug(TAG, 'Stale ' + LOCK_NAME + ' Master is deleted. Trying to become ' + LOCK_NAME + ' master ...');

              // and try to create a new lock
              createLock();
            });

            // If heartbeatTime is newer, don't do anything since this means a master is alive.
          } else if (masterInst.instanceID !== myInstanceID) log.debug(TAG, LOCK_NAME + ' Master (not me) is Alive');
          else log.debug(TAG, 'I am ' + LOCK_NAME + ' Master (' + masterId + ')');

          // If a lock is not present in DB ...
        } else {
          log.debug(TAG, 'No ' + LOCK_NAME + ' Master lock present. Trying to become ' + LOCK_NAME + ' master ...');

          // ...try to create a new lock
          createLock();
        }
      });
    });
  }


  /**
     * This function tries to create a lock record with the specified LOCK_NAME
     * in the MasterLock table. If it succeeds in doing so, it starts the specified
     * job and also the heartbeat updates at regular intervals.
     *
     */
  function createLock() {
    var TAG = 'createLock(): ';
    if (!canBecomeMaster) {
      log.debug(TAG, 'Cannot create lock for ' + LOCK_NAME + ' Master. Disabled by API');
      return;
    }

    var version = uuidv4();
    var data = {
      lockName: LOCK_NAME,
      instanceID: myInstanceID,
      ipPort: hostname + ':' + port,
      version: version,
      heartbeatTime: Date.now()
    };
    MasterLock.create(data, opts, function createCb(err, res) {
      if (!err && res && res.id) {
        masterId = res.id;
        log.info(TAG, 'I am ' + LOCK_NAME + ' Master (' + masterId + ')');
        masterJob.start();
        startHeartbeat(res);
      } else log.debug(TAG, 'Could not create ' + LOCK_NAME + ' lock record. ' + (err ? JSON.stringify(err) : ''));
    });
  }


  // This function takes an instance of the MasterLock and updates its heartbeatTime field
  // at regular intervals of time (HEARTBEAT_INTERVAL) with the current timestamp.
  function startHeartbeat(lock) {
    var TAG = 'startHeartbeat(lock): ';
    var retries = 0;
    log.debug(TAG, 'Starting ' + LOCK_NAME + ' Heartbeat...');
    heartbeatInterval = setInterval(function () {
      if (!canBecomeMaster) {
        log.debug(TAG, 'Cannot do heartbeat for ' + LOCK_NAME + ' Master. May be disabled by API');
        return;
      }

      lock.updateAttributes({ heartbeatTime: Date.now()}, opts, function (err, results) {
        /* istanbul ignore if */
        if (err) log.error(TAG, 'Could not send heartbeat for ' + LOCK_NAME + ' Master' + JSON.stringify(err));
        if (!err && results) {
          retries = 0;
          log.debug(TAG, 'Updated ' + LOCK_NAME + ' (' + masterId + ')' + ' Heartbeat ' + results.heartbeatTime);
        } else if (++retries > MAX_MASTER_HEARTBEAT_RETRY_COUNT) {
          log.warn(TAG, 'Could not update ' + LOCK_NAME + ' (' + masterId + ') Master Heartbeat after ' + MAX_MASTER_HEARTBEAT_RETRY_COUNT + ' retries. Stopping this Master.');
          clearInterval(heartbeatInterval);
        } else {
          log.error(TAG, 'Could not update ' + LOCK_NAME + ' (' + masterId + ') Master Heartbeat. Will retry (#' + retries + ') in ' + HEARTBEAT_INTERVAL / 1000 + ' sec');
        }
      });
    }, HEARTBEAT_INTERVAL);
  }
}

module.exports = MasterJobExecutor;
