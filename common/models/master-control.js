/*
©2015-2016 EdgeVerve Systems Limited (a fully owned Infosys subsidiary), Bangalore, India. All Rights Reserved.
The EdgeVerve proprietary software program ("Program"), is protected by copyrights laws, international treaties and other pending or existing intellectual property rights in India, the United States and other countries.
The Program may contain/reference third party or open source components, the rights to which continue to remain with the applicable third party licensors or the open source community as the case may be and nothing here transfers the rights to the third party and open source components, except as expressly permitted.
Any unauthorized reproduction, storage, transmission in any form or by any means (including without limitation to electronic, mechanical, printing, photocopying, recording or  otherwise), or any distribution of this Program, or any portion of it, may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under the law.
*/
/**
 *
 * For documentation on the usage of this module, please see README.md
 *
 * @file master-control.js
 * @author Ajith Vasudevan
 */

var loopback = require('loopback');
var logger = require('oe-logger');
var log = logger('masterControl');

module.exports = function MasterControlFn(MasterControl) {
  MasterControl.disable = function disable(lockName, reason, options, cb) {
    /* istanbul ignore else */
    if (typeof options === 'function') {
      cb = options;
      options = { ignoreAutoScope: true, fetchAllScopes: true };
    }
    var TAG = 'disable(lockName, reason, options, cb): ';
    log.debug(TAG, 'disabling ' + lockName + ':  reason: ' + reason);
    var MasterControl = loopback.getModelByType('MasterControl');
    MasterControl.findOne({where: {lockName: lockName}}, options, function findCb(err, masterControl) {
      /* istanbul ignore if */
      if (err) {
        log.error(TAG, 'Could not query for MasterControl ' + JSON.stringify(err));
        return cb(err, null);
      }
      if (!masterControl) {
        MasterControl.create({lockName: lockName, reason: reason, lastUpdatedTime: Date.now()}, options, function (err, res) {
          /* istanbul ignore if */
          if (err || !res) {
            log.error(TAG, 'Could not disable ' + lockName + ' ' + JSON.stringify(err));
            return cb(err, null);
          }
          log.warn(TAG, 'disabled ' + lockName);
          return cb(null, 'Flagged ' + lockName + ' as disabled');
        });
      } else {
        log.debug(TAG, lockName + ' is already flagged as disabled');
        return cb(null, lockName + ' is already flagged as disabled');
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
    /* istanbul ignore else */
    if (typeof options === 'function') {
      cb = options;
      options = { ignoreAutoScope: true, fetchAllScopes: true };
    }
    var TAG = 'enable(lockName, options, cb): ';
    log.debug(TAG, '(re)enabling ' + lockName + ' Master');
    MasterControl.remove({lockName: lockName}, options, function findCb(err, res) {
      /* istanbul ignore if */
      if (err) {
        log.error(TAG, 'Could not enable ' + lockName + ' Master. ' + JSON.stringify(err));
        return cb(err, null);
      }
      log.warn(TAG, lockName + ' is flagged for (re)enablement');
      return cb(null, lockName + ' is flagged for (re)enablement');
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


