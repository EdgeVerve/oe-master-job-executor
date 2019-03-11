/*
©2015-2016 EdgeVerve Systems Limited (a fully owned Infosys subsidiary), Bangalore, India. All Rights Reserved.
The EdgeVerve proprietary software program ("Program"), is protected by copyrights laws, international treaties and other pending or existing intellectual property rights in India, the United States and other countries.
The Program may contain/reference third party or open source components, the rights to which continue to remain with the applicable third party licensors or the open source community as the case may be and nothing here transfers the rights to the third party and open source components, except as expressly permitted.
Any unauthorized reproduction, storage, transmission in any form or by any means (including without limitation to electronic, mechanical, printing, photocopying, recording or  otherwise), or any distribution of this Program, or any portion of it, may result in severe civil and criminal penalties, and will be prosecuted to the maximum extent possible under the law.
*/
/**
 * 
 * This is a mocha test script for the oe-master-job-executor app-list module for oe-Cloud
 * based applications.
 * 
 * @file oe-master-job-executor-test.js
 * @author Ajith Vasudevan
 */

var app = require('oe-cloud');
var loopback = require('loopback');
var log = require('oe-logger')('masterJobExecutorTest');
var chalk = require('chalk');
var chai = require('chai');
var async = require('async');
chai.use(require('chai-things'));
var expect = chai.expect;
var defaults = require('superagent-defaults');
var supertest = require('supertest');
var api = defaults(supertest(app));


// Boot the application instance
app.boot(__dirname, function (err) {
    if (err) {
        console.log(chalk.red(err));
        log.error(err);
        process.exit(1);
    }
    app.start();
    app.emit('test-start');
});


// Test case code begins here:
describe(chalk.blue('oe-master-job-executor-test Started'), function (done) {
    var TAG = "describe()";
    log.debug("Starting oe-master-job-executor-test");

    this.timeout(600000); // setting the timeout to 10 minutes so as to be able to keep running
    // the application for as long as required to do all  tests

    var basePath, opts, LOCK_NAME, LOCK_NAME2, MasterLock, MasterControl, masterJobExecutor, MasterJobExecutorTestData;

    // The param function of before() is called before everything else in the test-case.
    // The param function's callback (done) is called to signal that the test-case can
    // proceed to the next step. 
    // In the param function, we subscribe to the app's 'test-start' event. We do some 
    // initial setup and call done() from within this event's callback so as to make sure
    // the initial setup is performed after all the boot scripts have run, and we proceed to the
    // next step in the test only after the initial setup is done.
    before('wait for boot scripts to complete', function (done) {
        var TAG = 'before()';
        log.debug("Starting " + TAG);

        // The 'test-start' event is fired after boot of app. In its callback,
        // we perform some initial setup for our tests, like clearing the MasterLock
        // and MasterControl tables, creating a temporary Model for test data and
        // clearing any existing test data.
        app.on('test-start', function () {
            var TAG = "'test-start' event callback";
            log.debug("Starting " + TAG);

            // Initial Setup begins here:
                // initialize variables
            opts = { ignoreAutoScope: true, fetchAllScopes: true };
            LOCK_NAME = 'TEST-MASTER';
            LOCK_NAME2 = 'TEST-MASTER2';
            MasterLock = loopback.getModelByType('MasterLock');
            MasterControl = loopback.getModelByType('MasterControl');
            basePath = app.get('restApiRoot');

                // Deleting all records from MasterLock
            MasterLock.remove({}, opts, function findCb(err, res) {
                if (err) {
                    log.error(TAG, 'Could not remove MasterLock records ' + JSON.stringify(err));
                    return done(err);     // Terminating test on error
                } else {
                    log.debug(TAG, 'deleted ' + res.count + ' MasterLock records');

                    // Deleting all records from MasterControl
                    MasterControl.remove({}, opts, function findCb(err, res) {
                        if (err) {
                            log.error(TAG, 'Could not remove MasterControl records ' + JSON.stringify(err));
                            return done(err);  // Terminating test on error
                        } else {
                            log.debug(TAG, 'deleted ' + res.count + ' MasterControl records');

                            // creating a temporary Model for test data
                            MasterJobExecutorTestData = loopback.createModel('MasterJobExecutorTestData', { data: 'string' });
                            ds = app.dataSources['db'];
                            ds.attach(MasterJobExecutorTestData);
                            app.model(MasterJobExecutorTestData);

                            // clear existing test data
                            clearTestData(done);   
                        }
                    });
                }
            });
        });
    });


    // This Mocha function is called after all 'it()' tests are run
    // We do some cleanup here
    after('after all', function (done) {
        var TAG = 'after()';
        console.log(chalk.yellow("Starting " + TAG));
        log.debug(TAG, 'After all tests');
        clearTestData(function() {
            done();
            setTimeout(function() {process.exit(0);}, 3000);
        });
    });


    // This function deletes all records in the MasterJobExecutorTestData table
    function clearTestData(cb) {
        var TAG = 'clearTestData()';
        if (!MasterJobExecutorTestData) return cb();
        MasterJobExecutorTestData.remove({}, opts, function findCb(err, res) {
            if (err) {
                log.error(TAG, 'Could not remove MasterJobExecutorTestData records ' + JSON.stringify(err));
            } else {
                log.debug(TAG, 'deleted ' + res.count + ' MasterJobExecutorTestData records');
            }
            return cb();
        });
    }


    /**
     * This test checks for error when the MasterJobExecutor is started without options
     */
    it('should give error when the MasterJobExecutor is started without options', function (done) {
        var TAG = "[it should give error when the MasterJobExecutor is started without options]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));
        var MasterJobExecutor = require('..')();
        var exc = false;                        // flag to check if exception occured
        try {
            var masterJobExecutor = new MasterJobExecutor();      // No options passed
            exc = true;
        } catch(err) {
            expect(err).not.to.be.null;
            expect(err.message).to.equal('options are not passed to master-job-executor');
        }
        expect(exc).to.equal(false);
        done();
    });


    /**
     * This test checks for error when the MasterJobExecutor is started with missing lockName
     */
    it('should give error when the MasterJobExecutor is started with missing lockName', function (done) {
        var TAG = "[it should give error when the MasterJobExecutor is started with missing lockName]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));
        var MasterJobExecutor = require('..')();
        var options = {masterJob: {start: function() {}, stop: function() {}}};  // No lockName in options
        var exc = false;                        // flag to check if exception occured
        try {
            var masterJobExecutor = new MasterJobExecutor(options);      // No lockName in options passed
            exc = true;
        } catch(err) {
            expect(err).not.to.be.null;
            expect(err.message).to.equal('lockName is not specified in options passed to master-job-executor');
        }
        expect(exc).to.equal(false);
        done();
    });


    /**
     * This test checks for error when the MasterJobExecutor is started with missing masterJob
     */
    it('should give error when the MasterJobExecutor is started with missing masterJob', function (done) {
        var TAG = "[it should give error when the MasterJobExecutor is started with missing masterJob]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));
        var MasterJobExecutor = require('..')();
        var options = {lockName: "TEST-LOCK"};  // No masterJob in options
        var exc = false;                        // flag to check if exception occured
        try {
            var masterJobExecutor = new MasterJobExecutor(options);      // No masterJob in options passed
            exc = true;
        } catch(err) {
            expect(err).not.to.be.null;
            expect(err.message).to.equal('masterJob is not specified in options passed to master-job-executor');
        }
        expect(exc).to.equal(false);
        done();
    });
    

/**
     * This test checks for error when the MasterJobExecutor is started with non-function start parameter
     */
    it('should give error when the MasterJobExecutor is started with non-function start parameter', function (done) {
        var TAG = "[it should give error when the MasterJobExecutor is started with non-function start parameter]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));
        var MasterJobExecutor = require('..')();
        var options = {lockName: "TEST-LOCK", masterJob: {start: { some: 'object'}, stop: function() {}}};  // start is not a function
        var exc = false;                        // flag to check if exception occured
        try {
            var masterJobExecutor = new MasterJobExecutor(options);      // start is not a function in options passed
            exc = true;
        } catch(err) {
            expect(err).not.to.be.null;
            expect(err.message).to.equal('masterJob.start is not a function in options passed to master-job-executor');
        }
        expect(exc).to.equal(false);
        done();
    });



    /**
     * This test checks for the existence of a single record in MasterLock
     * after the minimum time required for the app-instance to become Master, 
     * after boot. It does this by first starting the MasterJobExecutor, 
     * waiting for (initDelay + checkMasterInterval), and then checking for
     * the number of records for this lockName in MasterLock table.
     */
    it('should create one MasterLock record', function (done) {
        var TAG = "[it should create one MasterLock record]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        // Starting the MasterJobExecutor
        masterJobExecutor = startMasterJobExecutor(LOCK_NAME);

        // Calculate the time after which the MasterLock table should be checked
        var testTime = masterJobExecutor.config.getInitDelay() + masterJobExecutor.config.getCheckMasterInterval();
        var msg = 'Waiting for ' + testTime / 1000 + ' sec before checking for MasterLock record...';
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
        setTimeout(function () {
            MasterLock.find({}, opts, function findCb(err, res) {
                expect(err).not.to.be.defined;
                log.debug(TAG, 'found ' + res.length + ' MasterLock records');
                expect(res.length).to.equal(1);
                done();
            });
        }, testTime);
    });


    /**
     * This is a test to verify that the MasterJob.start() function is started 
     * only once after application startup. This check is done based on the
     * existence of a single record in  MasterJobExecutorTestData after an arbitrary
     * period, taken to be thrice of checkMasterInterval
     */
    it('should execute MasterJob.start() once', function (done) {
        var TAG = "[it should execute MasterJob.start() once]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        var testTime = 3 * masterJobExecutor.config.getCheckMasterInterval(); // Wait period before checking if Master is stopped
        var msg = 'Will test for MasterJob.start() after ' + testTime / 1000 + ' sec';
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
        setTimeout(function () {
            MasterJobExecutorTestData.find({}, opts, function (err, res) {
                expect(err).not.to.be.defined;
                expect(res.length).to.equal(1);
                expect(res[0]).not.to.be.undefined;
                expect(res[0].data).to.equal(LOCK_NAME + '_START');
                done();
            });
        }, testTime);

    });


    /**
     * This is a test to see whether the /MasterControls/disable API is able to stop
     * the Master instance and also call the stop() function of the masterJob.
     */
    it('should stop master when /api/MasterControls/disable is called', function (done) {
        var TAG = "[it should stop master when /api/MasterControls/disable is called]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        clearTestData(function (err) { // We will be populating this with data from masterJob.stop() and checking for data
            expect(err).not.to.be.defined;
            var postUrl = basePath + '/MasterControls/disable'; // API to disable Master
            api.set('Content-Type', 'application/json')
                .post(postUrl)
                .send({
                    lockName: LOCK_NAME,
                    reason: 'testing'
                }) // payload for disable API
                .end(function (err, response) {
                    expect(err).not.to.be.defined; // Expect no error upon calling API
                    expect(response.statusCode).to.equal(200); // Expect 200 OK response
                    var testTime = 3 * masterJobExecutor.config.getCheckMasterInterval(); // Wait period before checking if Master is stopped
                    var msg = 'Will test for Master stoppage after ' + testTime / 1000 + ' sec';
                    console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
                    setTimeout(function () {
                        MasterControl.find({
                            lockName: LOCK_NAME
                        }, opts, function (err, res) { // Check if the disable API has inserted a record in MasterControl
                            expect(err).not.to.be.defined;
                            log.debug(TAG, 'found ' + res.length + ' stop record(s) in MasterControl for ' + LOCK_NAME);
                            expect(res.length).to.equal(1);
                            MasterJobExecutorTestData.find({}, opts, function (err, res) {
                                expect(err).not.to.be.defined;
                                log.debug(TAG, 'found ' + res.length + ' testdata record(s) corresponding to masterJob.stop()');
                                expect(res.length).to.equal(1);
                                expect(res[0]).not.to.be.undefined;
                                expect(res[0].data).to.equal(LOCK_NAME + '_STOP');
                                done();
                            });
                        });
                    }, testTime);
                });
        });
    });



    /**
     * This is a test to see whether the /MasterControls/disable API is repeatable
     */
    it('should keep master stopped when /api/MasterControls/disable is called a second time', function (done) {
        var TAG = "[it 'should keep master stopped when /api/MasterControls/disable is called a second time']";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));
        var postUrl = basePath + '/MasterControls/disable'; // API to disable Master
        api.set('Content-Type', 'application/json')
            .post(postUrl)
            .send({
                lockName: LOCK_NAME,
                reason: 'testing again'
            }) // payload for disable API
            .end(function (err, response) {
                expect(err).not.to.be.defined; // Expect no error upon calling API
                expect(response.statusCode).to.equal(200); // Expect 200 OK response
                expect(response.body).to.equal(LOCK_NAME + ' is already flagged as disabled'); // Expect correct message in body
                var testTime = masterJobExecutor.config.getCheckMasterInterval(); // Wait period before checking if Master is stopped
                var msg = 'Will test for Master stoppage after ' + testTime / 1000 + ' sec';
                console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
                setTimeout(function () {
                    MasterControl.find({
                        lockName: LOCK_NAME
                    }, opts, function (err, res) { // Check if the disable API has inserted a record in MasterControl
                        expect(err).not.to.be.defined;
                        log.debug(TAG, 'found ' + res.length + ' stop record(s) in MasterControl for ' + LOCK_NAME);
                        expect(res.length).to.equal(1);
                        MasterJobExecutorTestData.find({}, opts, function (err, res) {
                            expect(err).not.to.be.defined;
                            log.debug(TAG, 'found ' + res.length + ' testdata record(s) corresponding to masterJob.stop()');
                            expect(res.length).to.equal(1);
                            expect(res[0]).not.to.be.undefined;
                            expect(res[0].data).to.equal(LOCK_NAME + '_STOP');
                            done();
                        });
                    });
                }, testTime);
            });
    });



    /**
     * This is a test to see whether te /MasterControls/enable API is able to start
     * the Master instance and also call the start() function of the masterJob.
     */
    it('should start master when /api/MasterControls/enable is called', function (done) {
        var TAG = "[it should start master when /api/MasterControls/enable is called]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        clearTestData(function (err) { // We will be populating this with data from masterJob.start() and checking for data
            expect(err).not.to.be.defined;
            var postUrl = basePath + '/MasterControls/enable'; // API to enable Master
            api.set('Content-Type', 'application/json')
                .post(postUrl)
                .send({
                    lockName: LOCK_NAME
                }) // payload for enable API
                .end(function (err, response) {
                    expect(err).not.to.be.defined; // Expect no error upon calling API
                    expect(response.statusCode).to.equal(200); // Expect 200 OK response
                    var testTime = (3 * masterJobExecutor.config.getCheckMasterInterval()); // Wait period before checking if Master is started
                    var msg = 'Will test for Master start after ' + testTime / 1000 + ' sec';
                    console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
                    setTimeout(function () {
                        MasterControl.find({
                            lockName: LOCK_NAME
                        }, opts, function (err, res) { // Check if the enable API has inserted a record in MasterControl
                            expect(err).not.to.be.defined;
                            log.debug(TAG, 'found ' + res.length + ' stop record(s) in MasterControl for ' + LOCK_NAME);
                            expect(res.length).to.equal(0);
                            MasterJobExecutorTestData.find({}, opts, function (err, res) {
                                expect(err).not.to.be.defined;
                                log.debug(TAG, 'found ' + res.length + ' testdata record(s) corresponding to masterJob.stop()');
                                expect(res.length).to.equal(1);
                                expect(res[0]).not.to.be.undefined;
                                expect(res[0].data).to.equal(LOCK_NAME + '_START');
                                done();
                            });
                        });
                    }, testTime);
                });
        });
    });



    /**
     * This test starts the MasterJobExecutor a second time and verifies that
     * it does not start the second time.
     */
    it('should fail to start MasterJobExecutor a second time', function (done) {
        var TAG = "[it should fail to start MasterJobExecutor a second time]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        clearTestData(function (err) { 
            expect(err).not.to.be.defined;
            // Starting the MasterJobExecutor second time
            var masterJobExecutorSecond = startMasterJobExecutor(LOCK_NAME);

            // Calculate the time after which the MasterLock table should be checked
            var testTime = 3 * masterJobExecutorSecond.config.getCheckMasterInterval(); // Wait period before checking if MasterJob.start() was called again
            var msg = 'Will test for MasterJob.start() after ' + testTime / 1000 + ' sec';
            console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
            setTimeout(function () {
                MasterJobExecutorTestData.find({}, opts, function (err, res) {
                    expect(err).not.to.be.defined;
                    expect(res.length).to.equal(0);
                    done();
                });
            }, testTime);
        });
    });



    /**
     * This test starts the MasterJobExecutor a second time with a different lockName 
     * and verifies that it starts a new MasterJobExecutor.
     */
    it('should start MasterJobExecutor with a new lockName', function (done) {
        var TAG = "[it should start MasterJobExecutor with a new lockName]";
        console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", "Starting " + TAG));

        clearTestData(function (err) { 
            expect(err).not.to.be.defined;
            // Starting the MasterJobExecutor second time
            var masterJobExecutor2 = startMasterJobExecutor(LOCK_NAME2);

            // Calculate the time after which the MasterLock table should be checked
            var testTime = 3 * masterJobExecutor2.config.getCheckMasterInterval(); // Wait period before checking if MasterJob.start() was called again
            var msg = 'Will test for MasterJob2.start() after ' + testTime / 1000 + ' sec';
            console.log(chalk.yellow("["+ new Date().toISOString() + "]      : ", msg));
            setTimeout(function () {
                MasterJobExecutorTestData.find({}, opts, function (err, res) {
                    expect(err).not.to.be.defined;
                    expect(res.length).to.equal(1);
                    expect(res[0]).not.to.be.undefined;
                    expect(res[0].data).to.equal(LOCK_NAME2 + '_START');
                    done();
                });
            }, testTime);
        });
    });



    // This function starts the masterJobExecutor after defining its
    // options which include the lockName and masterJob Object. The masterJob
    // object contains the start() and stop() functions of the job.
    function startMasterJobExecutor(lockName) {
        var TAG = "startMasterJobExecutor()";
        log.debug("Starting " + TAG);

        // start() function of masterJob
        function start() {
            var TAG = "start()";
            log.debug('Executing start() of ' + lockName + ' master');

            // To check for execution of this start() function, we insert a record
            // into the MasterJobExecutorTestData temporary table
            MasterJobExecutorTestData.create({
                data: lockName + "_START"
            }, opts, function (err, res) {
                if (err || !res) {
                    log.error(TAG, "FATAL: Could not create test data from start() " + JSON.stringify(err));
                    log.error(TAG, "FATAL: Terminating test.");
                    process.exit(1);
                }
            });
        }

        // stop() function of masterJob
        function stop() {
            var TAG = "stop()";
            log.debug('Executing stop() of ' + lockName + ' master');

            // To check for execution of this stop() function, we insert a record
            // into the MasterJobExecutorTestData temporary table
            MasterJobExecutorTestData.create({
                data: lockName + "_STOP"
            }, opts, function (err, res) {
                if (err || !res) {
                    log.error(TAG, "FATAL: Could not create test data from stop() " + JSON.stringify(err));
                    log.error(TAG, "FATAL: Terminating test.");
                    process.exit(1);
                }
            });
        }

        log.debug(TAG, 'Starting MasterJobExecutor for lockName=' + lockName);
        var MasterJobExecutor = require('..')();
        var options = {
            lockName: lockName,
            masterJob: {
                start: start,
                stop: stop
            },
            checkMasterInterval: 2000,
            initDelay: 100,
            tolerance: 3000,
            heartbeatInterval: 1000,
            maxHeartbeatRetryCount: 2
        };
        var masterJobExecutor = new MasterJobExecutor(options);
        log.debug(TAG, "InitDelay: " +  masterJobExecutor.config.getInitDelay());
        log.debug(TAG, "CheckMasterInterval: " +  masterJobExecutor.config.getCheckMasterInterval());
        log.debug(TAG, "HeartbeatInterval: " +  masterJobExecutor.config.getHeartbeatInterval());
        log.debug(TAG, "MaxHeartbeatRetryCount: " +  masterJobExecutor.config.getMaxHeartbeatRetryCount());
        log.debug(TAG, "Tolerance: " +  masterJobExecutor.config.getTolerance());
        return masterJobExecutor;
    }

});