/**
 *
 * ©2016-2017 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
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
 */


/* eslint-disable no-console, no-loop-func */
var loopback = require('loopback');
var log = require('oe-logger')('masterJobExecutor');
var uuidv4 = require('uuid/v4');
var MasterLock = loopback.getModelByType('MasterLock');
var MasterControl = loopback.getModelByType('MasterControl');
var os = require('os');
var ifaces = os.networkInterfaces();
var myInstanceID = uuidv4();
var config, LOCK_NAME, masterJob;
var confPath = '../../oe-cloud/server/config.js';
var hostname = os.hostname();
var canBecomeMaster = false;
var port = process.env.PORT || require(confPath).port;
var TAG = 'master-job-executor.js: ';
try {
    config = require(confPath).masterJobExecutor;
} catch(e) { log.warn(TAG, e.message); }

var INIT_DELAY = process.env.MASTER_JOB_EXEC_INIT_DELAY || config && config.initDelay || 1000;
var CHECK_MASTER_INTERVAL = process.env.CHECK_MASTER_INTERVAL || config && config.checkMasterInterval || 30000;
var HEARTBEAT_INTERVAL = process.env.MASTER_JOB_HEARTBEAT_INTERVAL || config && config.heartbeatInterval || 8000;
var MAX_MASTER_HEARTBEAT_RETRY_COUNT = process.env.MASTER_JOB_MAX_HEARTBEAT_RETRY_COUNT || config && config.maxHeartbeatRetryCount || 3;
var TOLERANCE = HEARTBEAT_INTERVAL * 3;

var opts = {
    ignoreAutoScope: true,
    fetchAllScopes: true
};
var masterId, masterCheckInterval, heartbeatInterval;

module.exports = {
    startMaster: startMaster
}


function startMaster(options) {
    var TAG = 'startMaster(options): ';
    var msg;
    if (!options && !globalOptions) {
        msg = 'options are not passed to master-job-executor';
        log.error(TAG, msg);
        throw new Error(msg);
        return;
    } else {
        if(options) globalOptions = options;
        else options = globalOptions;
    }
    if (options && options.lockName) LOCK_NAME = options.lockName;
    else {
        msg = 'lockName is not specified in options passed to master-job-executor';
        log.error(TAG, msg);
        throw new Error(msg);
        return;
    }
    if (options && options.masterJob) masterJob = options.masterJob;
    else {
        msg = 'masterJob is not specified in options passed to master-job-executor';
        log.error(TAG, msg);
        throw new Error(msg);
        return;
    }
    if (!(options.masterJob && options.masterJob.start && typeof options.masterJob.start === 'function')) {
        msg = 'masterJob.start is not a function in options passed to master-job-executor';
        log.error(TAG, msg);
        throw new Error(msg);
        return;
    }
    if (options && options.checkMasterInterval)  CHECK_MASTER_INTERVAL = options.checkMasterInterval;
    if (options && options.initDelay) INIT_DELAY = options.initDelay;
    if (options && options.tolerance) TOLERANCE = options.tolerance;
    if (options && options.heartbeatInterval) HEARTBEAT_INTERVAL = options.heartbeatInterval;
    if (options && options.maxHeartbeatRetryCount) MAX_MASTER_HEARTBEAT_RETRY_COUNT = options.maxHeartbeatRetryCount;

    log.info(TAG, 'Waiting ' + INIT_DELAY / 1000 + ' sec for checking for ' + LOCK_NAME + ' Master');
    setTimeout(function() {
        checkMaster();
        masterCheckInterval = setInterval(checkMaster, CHECK_MASTER_INTERVAL);
    }, INIT_DELAY);
}


function checkMaster() {
    var TAG = 'checkMaster(): ';
    var msg;
    MasterControl.findOne({where: {lockName: LOCK_NAME}}, opts, function findCb(err, masterControl) {
        if(err) {
            msg = 'Could not query for MasterControl ' + JSON.stringify(err);
            log.error(TAG, msg);
            throw new Error(msg);
            return;
        } else {
            if(masterControl) {
                canBecomeMaster = false;
                log.debug(TAG, LOCK_NAME + ' flagged for disablement. Setting canBecomeMaster to false. Cannot become Master');
            } else {
                canBecomeMaster = true;
                log.debug(TAG, LOCK_NAME + ' flagged for enablement. Setting canBecomeMaster to true');

                var filter = { where: { lockName: LOCK_NAME }};
                MasterLock.findOne(filter, opts, function findCb(err, masterInst) {              // Get the current lock instance from DB, if present.
                    if(err) {
                        msg = 'Could not query for ' + LOCK_NAME + ' Master'  + JSON.stringify(err);
                        log.error(TAG, msg);
                        throw new Error(msg);
                    }
                    else if (!err && masterInst) {                                                    // If a lock is present in DB ...
                        if (Date.now() - masterInst.heartbeatTime > TOLERANCE) {                 // and if its heartbeatTime is older than TOLERANCE
                            log.debug(TAG, LOCK_NAME + ' Master is stale. Deleting stale ' + LOCK_NAME + ' master...');
                            masterInst.delete(opts, function (err, res) {                        // delete the lock instance from DB
                                if(err) {
                                    msg = 'Stale ' + LOCK_NAME + ' Master could not be deleted.'  + JSON.stringify(err);
                                    log.error(TAG, msg);
                                    throw new Error(msg);
                                }
                                clearInterval(heartbeatInterval);
                                masterJob.stop();
                                log.debug(TAG, 'Stale ' + LOCK_NAME + ' Master is deleted. Trying to become ' + LOCK_NAME + ' master ...');
                                createLock();                                                       // and try to create a new lock
                            });
                        } else {                                                                    // If heartbeatTime is newer, don't do anything since this means a master is alive.
                            if (masterInst.instanceID !== myInstanceID) log.debug(TAG, LOCK_NAME + ' Master (not me) is Alive');
                            else log.debug(TAG, 'I am ' + LOCK_NAME + ' Master ('+ masterId +')');
                        }
                    } else {                                                                    //If a lock is not present in DB ...
                        log.debug(TAG, 'No ' + LOCK_NAME + ' Master lock present. Trying to become ' + LOCK_NAME + ' master ...');
                        createLock();                                                           // ...try to create a new lock
                    }
                });
            }
        }
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
    if(!canBecomeMaster) {
        log.debug(TAG, 'Cannot create lock for '+ LOCK_NAME +' Master. Disabled by API');
        return;
    }

    version = uuidv4();
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
        } else log.debug(TAG, 'Could not create ' + LOCK_NAME + ' lock record. ' + (err? JSON.stringify(err) : ''));
    });
}



/**
 * This function takes an instance of the MasterLock and updates its heartbeatTime field
 * at regular intervals of time (HEARTBEAT_INTERVAL) with the current timestamp.
 * 
 * @param {MasterLock instance object} lock 
 */
function startHeartbeat(lock) {
    var TAG = 'startHeartbeat(lock): ';
    var retries = 0;
    log.debug(TAG, 'Starting ' + LOCK_NAME + ' Heartbeat...');
    heartbeatInterval = setInterval(function () {
        if(!canBecomeMaster) {
            log.debug(TAG, 'Cannot do heartbeat for '+ LOCK_NAME +' Master. May be disabled by API');
            return;
        }

        lock.updateAttributes({ heartbeatTime: Date.now()}, opts, function (err, results) {
            if(err) log.error(TAG, 'Could not send heartbeat for ' + LOCK_NAME + ' Master' + JSON.stringify(err));
            if (!err && results) {
                retries = 0;
                log.debug(TAG, 'Updated ' + LOCK_NAME + ' ('+ masterId +')' + ' Heartbeat ' + results.heartbeatTime);
            } else {
                if(++retries > MAX_MASTER_HEARTBEAT_RETRY_COUNT) {
                    log.warn(TAG, 'Could not update ' + LOCK_NAME + ' ('+ masterId +') Master Heartbeat after '+ MAX_MASTER_HEARTBEAT_RETRY_COUNT +' retries. Stopping this Master.');
                    clearInterval(heartbeatInterval);
                } else {
                    log.error(TAG, 'Could not update ' + LOCK_NAME + ' ('+ masterId +') Master Heartbeat. Will retry (#'+ retries +') in ' + HEARTBEAT_INTERVAL/1000 + ' sec');
                }

            }
        });
    }, HEARTBEAT_INTERVAL);
}

