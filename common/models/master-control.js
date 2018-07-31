/**
 *
 * �2016-2017 EdgeVerve Systems Limited (a fully owned Infosys subsidiary),
 * Bangalore, India. All Rights Reserved.
 *
 */

var loopback = require('loopback');
var logger = require('oe-logger');
var log = logger('master-control');
var masterJobExecutor = require('../..');
var TAG = 'MASTER-CONTROL: ';


module.exports = function MasterControlFn(MasterControl) {

    MasterControl.disable = function disable(lockName, reason, options, cb) {
        log.debug(TAG, 'disabling ' + lockName + ':  reason: ' + reason);
        var MasterControl = loopback.getModelByType('MasterControl');
        MasterControl.findOne({where: {lockName: lockName}}, options, function findCb(err, masterControl) {
            if(err) {
                log.error(TAG, 'Could not query for MasterControl ' + JSON.stringify(err));
                return cb(err, null);
            } else {
                if(!masterControl) {
                    MasterControl.create({lockName: lockName, lastUpdatedTime: Date.now()}, options, function(err, res) {
                        if(err || !res) {
                            log.error(TAG, 'Could not disable '+ lockName +' ' + JSON.stringify(err));
                            return cb(err, null);
                        } else {
                            log.warn(TAG, 'disabled ' + lockName);
                            return cb(null, 'Flagged '+ lockName +' as disabled');
                        }
                    });
                } else {
                    log.debug(TAG, lockName + ' is already flagged as disabled');
                    return cb(null, lockName + ' is already flagged as disabled');
                }
            }
        });
    };

    MasterControl.remoteMethod('disable', {
        description: 'disables the specified Master',
        accessType: 'EXECUTE',
        accepts: [{arg: 'lockName', type: 'string', required: true}, {arg: 'reason', type: 'string', required: true}],
        http: {path: '/disable', verb: 'post'},
        returns: [{
            arg: 'body',
            type: 'object',
            root: true
        }]
    });



    MasterControl.enable = function enable(lockName, options, cb) {
        log.debug(TAG, '(re)enabling ' + lockName + ' Master');
        MasterControl.remove({lockName: lockName}, options, function findCb(err, res) {
            if(err) {
                log.error(TAG, 'Could not enable ' + lockName + ' Master. ' + JSON.stringify(err));
                return cb(err, null);
            } else {
                log.warn(TAG, lockName + ' is flagged for (re)enablement');
                return cb(null, lockName + ' is flagged for (re)enablement');
            }
        });
    };

    MasterControl.remoteMethod('enable', {
        description: 'enables the specified Master',
        accessType: 'EXECUTE',
        accepts: [{arg: 'lockName', type: 'string', required: true}],
        http: {path: '/enable', verb: 'post'},
        returns: [{
            arg: 'body',
            type: 'object',
            root: true
        }]
    });



};


