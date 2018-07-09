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
 * An options object with the following properties nees to be passed to this
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
var log = require('oe-logger')('master-job-executor');
var uuidv4 = require('uuid/v4');
var MasterLock = loopback.getModelByType('MasterLock');
var os = require('os');
var ifaces = os.networkInterfaces();
var myInstanceID = uuidv4();
var INIT_DELAY = 20000;
var HEARTBEAT_INTERVAL = 8000;
var TOLERANCE = HEARTBEAT_INTERVAL * 3;
var TAG, LOCK_NAME, port, masterJob;
var ifName = process.env.IFNAME || 'Wi-Fi';
var ipAddress = getIPAddress(ifName);
var options = {
    ignoreAutoScope: true,
    fetchAllScopes: true
};

module.exports = function (options) {
    if (!options) {
        log.error(TAG, 'options are not passed to master-job-executor');
        return;
    }
    if (options && options.lockName) LOCK_NAME = options.lockName;
    else {
        log.error(TAG, 'lockName is not specified in options passed to master-job-executor');
        return;
    }
    if (options && options.masterJob) masterJob = options.masterJob;
    else {
        log.error(TAG, 'masterJob is not specified in options passed to master-job-executor');
        return;
    }
    if (!(options.masterJob && options.masterJob.start && typeof options.masterJob.start === 'function')) {
        log.error(TAG, 'masterJob.start is not a function in options passed to master-job-executor');
        return;
    }
    if (options && options.initDelay) INIT_DELAY = options.initDelay;
    if (options && options.tolerance) TOLERANCE = options.tolerance;
    if (options && options.heartbeatInterval) HEARTBEAT_INTERVAL = options.heartbeatInterval;
    port = process.env.PORT || require('../../oe-cloud/server/config.js').port;
    TAG = 'MASTER-JOB-EXECUTOR: (' + ipAddress + ':' + port + ') ';
    startMasterCheck();
}

/**
 * This function starts the master check/election process after a delay (INIT_DELAY)
 */
function startMasterCheck() {
    log.info(TAG, 'Waiting ' + INIT_DELAY / 1000 + ' sec for checking for ' + LOCK_NAME + ' Master');
    setInterval(function () {
        var filter = {
            where: {
                lockName: LOCK_NAME
            }
        };
        MasterLock.findOne(filter, options, function findCb(err, masterInst) {          // Get the current lock instance from DB, if present.
            if (!err && masterInst) {                                                   // If a lock is present in DB ...
                if (Date.now() - masterInst.heartbeatTime > TOLERANCE) {                    // and if its heartbeatTime is older than TOLERANCE
                    log.debug(TAG, LOCK_NAME + ' Master is stale. Deleting stale ' + LOCK_NAME + ' master...');
                    masterInst.delete(options, function (err, res) {                        // delete the lock instance from DB
                        log.info(TAG, 'Stale ' + LOCK_NAME + ' Master is deleted. Trying to become ' + LOCK_NAME + ' master ...');
                        createLock();                                                       // and try to create a new lock
                    });
                } else {                                                                    // If heartbeatTime is newer, don't do anything since this means a master is alive.
                    if (masterInst.instanceID !== myInstanceID) log.debug(TAG, LOCK_NAME + ' Master is Alive');
                    else log.debug(TAG, 'I am ' + LOCK_NAME + ' Master');
                }
            } else {                                                                    //If a lock is not present in DB ...
                log.info(TAG, 'No ' + LOCK_NAME + ' Master lock present. Trying to become ' + LOCK_NAME + ' master ...');
                createLock();                                                           // ...try to create a new lock
            }
        });

    }, INIT_DELAY);
}

/**
 * This function takes a cidr string and returns the 
 * IP Address associated with it.
 * 
 * @param {String} ifName 
 */
function getIPAddress(ifName) {
    var result;
    var ifnames = Object.keys(ifaces);
    for (var i = 0; i < ifnames.length; i++) {
        if(ifnames[i] === ifName)
        {
            var iface = ifaces[ifName];
            for (var j = 0; j < iface.length; j++) {
                if (iface[j].family === 'IPv4') {
                    result = iface[j];
                    break;
                }
            }
        }
        if (result) break;
    };
    if(!result) log.warn(TAG, 'Could not find an IP Address with the specified ifName (process.env.IFNAME=' + ifName + ')');
    return result ? result.address : '';
}


/**
 * This function takes an instance of the MasterLock and updates its heartbeatTime field
 * at regular intervals of time (HEARTBEAT_INTERVAL) with the current timestamp.
 * 
 * @param {MasterLock instance object} lock 
 */
function startHeartbeat(lock) {
    log.debug(TAG, 'Starting ' + LOCK_NAME + ' Heartbeat...');
    var hb = setInterval(function () {
        lock.updateAttributes({
            heartbeatTime: Date.now()
        }, options, function (err, results) {
            if (!err && results) {
                log.debug(TAG, 'Updated ' + LOCK_NAME + ' Heartbeat ' + results.heartbeatTime);
            } else {
                log.warn(TAG, 'Could not update ' + LOCK_NAME + ' Heartbeat. Stopping ' + LOCK_NAME + ' Job and ' + LOCK_NAME + ' Heartbeat');
                clearInterval(hb);
                if (masterJob.stop && typeof masterJob.stop === 'function') masterJob.stop();
                else log.warn(TAG, 'No stop function defined in masterJob');
            }
        });
    }, HEARTBEAT_INTERVAL);
}

/**
 * This function tries to create a lock record with the specified LOCK_NAME
 * in the MasterLock table. If it succeeds in doing so, it starts the specified
 * job and also the heartbeat updates at regular intervals.
 * 
 */
function createLock() {
    version = uuidv4();
    var data = {
        lockName: LOCK_NAME,
        instanceID: myInstanceID,
        ipPort: ipAddress + ':' + port,
        version: version,
        heartbeatTime: Date.now()
    };
    MasterLock.create(data, options, function createCb(err, res) {
        if (!err && res && res.id) {
            log.info(TAG, 'I am ' + LOCK_NAME + ' Master (' + res.id + ')');
            masterJob.start();
            startHeartbeat(res);
        } else log.debug(TAG, 'Could not create ' + LOCK_NAME + ' lock record');
    });
}