/**
 *
 * ©2016-2017 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
 */
/**
 * This module elects a single master among teh application cluster instances
 * and runs the specified job on the master instance
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
var cidr = process.env.CIDR || '10.66.49.224/22';
var ipAddress = getIPAddress(cidr);
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
    ipAddress = getIPAddress(cidr);
    port = process.env.PORT || require('../../oe-cloud/server/config.js').port;
    TAG = 'MASTER-JOB-EXECUTOR: (' + ipAddress.address + ':' + port + ') ';
    startMasterCheck();
}

function startMasterCheck() {
    log.info(TAG, 'Waiting ' + INIT_DELAY / 1000 + ' sec for checking for ' + LOCK_NAME + ' Master');
    setInterval(function () {
        var filter = {
            where: {
                lockName: LOCK_NAME
            }
        };
        MasterLock.findOne(filter, options, function findCb(err, masterInst) {
            if (!err && masterInst) {
                if (Date.now() - masterInst.heartbeatTime > TOLERANCE) {
                    log.debug(TAG, LOCK_NAME + ' Master is stale. Deleting stale ' + LOCK_NAME + ' master...');
                    masterInst.delete(options, function (err, res) {
                        log.info(TAG, 'Stale ' + LOCK_NAME + ' Master is deleted. Trying to become ' + LOCK_NAME + ' master ...');
                        createLock();
                    });
                } else {
                    if (masterInst.instanceID !== myInstanceID) log.debug(TAG, LOCK_NAME + ' Master is Alive');
                    else log.debug(TAG, 'I am ' + LOCK_NAME + ' Master');
                }
            } else {
                log.info(TAG, 'No ' + LOCK_NAME + ' Master lock present. Trying to become ' + LOCK_NAME + ' master ...');
                createLock();
            }
        });

    }, INIT_DELAY);
}


function getIPAddress(cidr) {
    var result;
    var ifnames = Object.keys(ifaces);
    for (var i = 0; i < ifnames.length; i++) {
        iface = ifaces[ifnames[i]];
        for (var j = 0; j < iface.length; j++) {
            if (iface[j].cidr === cidr) {
                result = iface[j];
                break;
            }
        }
        if (result) break;
    };
    return result;
}


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


function createLock() {
    version = uuidv4();
    var data = {
        lockName: LOCK_NAME,
        instanceID: myInstanceID,
        ipPort: ipAddress.address + ':' + port,
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