# oe-master-job-executor

## Need
In a clustered environment, applications sometimes need to execute a function just once on boot. And later, if the application
instance running the one-time function goes down for any reason, another running instance needs to take over and run the function once.

For example, a clustered application may be running 4 application instances, but a *job scheduler function* within this app
may need to run once on boot, and only on a single app instance. The app instance which is elected to run the *job-scheduler function* 
is the *job-scheduler-master* instance.
If the *job-scheduler-master* instance goes down, then another instance of the application should become the *job-scheduler-master* and
run the *job scheduler function* once.


## Implementation
This module provides the infrastructure for catering to the above need. It is implemented as an app-list module for oe-Cloud based applications. 
It provides the ability to automatically elect one app-instance among the cluster and run a function once in the elected app-instance, 
which we call the <FUNCTION_>MASTER, for e.g., JOB_SCHEDULER_MASTER. If the master for a function goes down, a new master is elected 
and the function is run again.

To achieve the aforementioned functionality, a query-based locking in the database is used, along with updates of a lock *heartbeat* timestamp
at regular intervals by the master app-instance. All app-instances keep checking for missed heartbeats and are ready to take over 
as master by deleting the lock from the database and creating their own lock.


## Setup
To get the *oe-master-job-executor* feature in the application, the **oe-master-job-executor** node module needs to be added 
as a *package.json* dependency in the application. 

Also, the module needs be added to the `server/app-list.json` file in the app. 

For e.g., 

**package.json**  (only part of the file is shown here, with relevant section in **bold**):

<pre>
...
   ...
   "dependencies": {
       ...
       ...
       ...
       "oe-workflow": "git+http://10.73.97.24/oecloud.io/oe-workflow.git#master",
       <B>"oe-master-job-executor": "git+http://10.73.97.24/oecloud.io/oe-master-job-executor.git#master",</B>
       "passport": "0.2.2",
       ...
       ...
</pre>

**server/app-list.json**   (Relevant section in **bold**):

<pre>
[
    {
        "path": "oe-cloud",
        "enabled": true
    },
    <b>{
        "path": "oe-master-job-executor",
        "enabled": true
    },</b>
	{
		"path" : "oe-workflow",
		"enabled" : true
	},
	{
        "path": "./",
        "enabled": true
    }
]
</pre>

## Usage
The *oe-master-job-executor* module can be used to start any number of "masters", for performing various one-time-on-boot functions/operations.
Each such usage creates one master. Creation of a master involves providing a name for the function and the actual function itself, as shown below:

```javascript

function start() {
    // Start the master function
}

function stop() {
    // Stop/cleanup the master function
}

var masterJobExecutor = require('oe-master-job-executor');
var options = { lockName: 'JOB-SCHEDULER', masterJob: { start: start, stop: stop } };
masterJobExecutor.startMaster(options);


```
The above code can run, say, from a boot script in all app-instances of an application cluster, however, the function **start()** will be called only once
on one of the app-instances (the master). If the master instance dies, **start()** will be called again once on another instance that is elected as master.

The **stop()** function is called whenever the master is stopped either due to manual disablement via HTTP API call (see **Control** section below), or self-stoppage due to heartbeat not 
getting updated for any reason.


## Configuration
The *oe-master-job-executor* module can be configured via -

1. server/config.json
2. environment variables
3. startMaster options

with the following priority:  3 > 2 > 1

Priority is applicable on a per-parameter basis.

The following are the configuration parameters:

<pre>
----------------------------------------------------------------------------------------------------------------------------------------
config.json setting                       startmaster option      Env Variable            type          default    Description          
----------------------------------------------------------------------------------------------------------------------------------------
masterJobExecutor.initDelay               initDelay               INIT_DELAY              number (ms)   1000       This setting determines the delay
                                                                                                                   in milliseconds since boot, after 
                                                                                                                   which the master is started
                                                                                                     
masterJobExecutor.checkMasterInterval     checkMasterInterval     CHECK_MASTER_INTERVAL   number (ms)   30000      This is the interval at which each 
                                                                                                                   app-instance checks for the master heartbeat
                                                                                                                   in order to try and become master itself
                                                                                                                     
masterJobExecutor.heartbeatInterval       heartbeatInterval       MASTER_JOB_HEARTBEAT_INTERVAL  
                                                                                          number (ms)   8000       This is the interval at which heartbeat 
                                                                                                                   timestamp is updated by the master  

masterJobExecutor.maxHeartbeatRetryCount  maxHeartbeatRetryCount  MASTER_JOB_MAX_HEARTBEAT_RETRY_COUNT
                                                                                          number        3          This is the number of times the master
                                                                                                                   heartbeat will be retried upon falure
                                                                                                                   to send heartbeat.

-----------------------------------------------------------------------------------------------------------------------------------------
</pre>


An example of *oe-master-job-executor* configuration via **server/config.json** is shown below:

```javascript

{
    . . .
    . . .
    "masterJobExecutor": {
        "initDelay": 5000,
        "checkMasterInterval": 20000
        "heartbeatInterval": 15000,
        "maxHeartbeatRetryCount": 10
    },
    . . .
    . . .
}
```

## Control
The master can be stopped and started manually via HTTP API. Disabling the master causes the current master to call the 
**stop()** function of the **masterJob** and it will also prevent other app-instances from becoming a master.

The API to call for stopping/disabling the master is as follows:
```
POST /api/mastercontrols/disable
```
e.g., payload:
```json
{
    "lockName": "JOB-SCHEDULER",  
    "reason": "testing"
}

```

The API for restarting/enabling the master is as follows:
```
POST /api/mastercontrols/enable
```
e.g., payload:
```json
{
    "lockName": "JOB-SCHEDULER"
}

```
Upon restarting/re-enabling a master, one of the running app-instances will get elected as master and its **start()** function is called once.

