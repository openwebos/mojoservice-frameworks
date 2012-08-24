/*jslint devel: true, onevar: false, undef: true, eqeqeq: true, bitwise: true, 
regexp: true, newcap: true, immed: true, nomen: false, maxerr: 500 */

/*global Class, Foundations, Future, IMPORTS, PalmCall, SyncCommand, TempDB, Test, Transport */

var webos = IMPORTS.require('webos'),
	palmbus = IMPORTS.require('palmbus');
webos.include("test/loadall.js");

function mockPalmCall_call() {
	var future = new Future();
	future.exception = new Error(2);
	return future;
}

function MockSyncHandler() {
	
}

MockSyncHandler.prototype = {
	getObjectsByRid: function () {
		return new Future([{
				local: {
					_id: "++7890QWER",
					remoteId: "foo"
				},
				remote: {
					remoteId: "foo"
				}
			}]);
	},

	putObjects: function () {
		return new Future({
			put: [],
			deleted: []
		});
	},

	updateAccountTransportObject: function () {
		return new Future(true);
	},

	getChangedObjects: function () {
		console.log("getChangedObjects() called");
		return new Future([{
			local: {
				_id: "++34567XCVBz",
				_rev: 12
			}
		}]);
	},

	putTransportObjects: function () {
		return new Future([{
			id: "++34567XCVBz",
			_rev: 13
		}]);
	}
};

var MockSyncAssistant = Class.create(SyncCommand, {
	initialize: function () {
		this.client = {
			clientId: "++12345ASDFG",
			transport: {}
		};
		this.controller = MockSyncAssistant.controller; 
	},
	getCapabilityProviderId: function () {
		console.log("Getting capabilityProviderId: " + MockSyncAssistant.capabilityProviderId);
		return MockSyncAssistant.capabilityProviderId;
	},

	getSyncOrder: function () {
		return [
			"gizmo"// ,
			// 			"widget"
		];
	},

	getSyncObjects: function () {
		return {
			gizmo: {
				name: "gizmo",
				id: "com.foo.bar.gizmo:1",
				metadata_id: "com.foo.bar.transport.gizmo:1"
			}// ,
			// 
			// 			widget: {
			// 				name: "widget",
			// 				id: "com.foo.bar.widget:1",
			// 				metadata_id: "com.foo.bar.transport.widget:1"
			// 			}
		};
	},

	getTransformer: function (direction) {
		if (direction === "local2remote") {
			return this.getLocal2RemoteTransformer();
		} else if (direction === "remote2local") {
			return this.getRemote2LocalTransformer();
		}
	},

	getLocal2RemoteTransformer: function (kind) {
		return this.local2remote;
	},

	getRemote2LocalTransformer: function (kind) {
		return this.remote2local;
	},

	local2remote: function (remote, local) {
		return local;
	},

	remote2local: function (remote, local) {
		return local;
	},

	getRemoteChanges: function () {
		return new Future({
			more: false,
			entries: [{
				rid: "foo"
			}]
		});
	},

	getRemoteId: function (item) {
		return item.rid;
	},

	isDeleted: function () {
		return false;
	},

	getNewRemoteObject: function () {
		return {};
	},

	getRemoteMatches: function () {
		return new Future([{
				rid: "foo"
			}]);
	},

	putRemoteObjects: function (objects) {
		return new Future(["foo"]);
	},

	postPutRemoteModify: function (objects) {
		
	}
});

MockSyncAssistant.capabilityProviderId = "com.foo.bar";
MockSyncAssistant.controller = {
	args: {},
	service: {
		assistant: {},
		name: MockSyncAssistant.capabilityProviderId
	},
	config: {
		name: "fooService"
	}
};


function SyncErrorHandlingTests() {
	if (!SyncErrorHandlingTests._handle) {
		SyncErrorHandlingTests._handle = new palmbus.Handle("", false);
		Foundations.Comms.PalmCall.register(SyncErrorHandlingTests._handle);
	}
}

function MockActivity() {
	this._activityId = MockActivity.activityId;
}
MockActivity.prototype = {
	setScheduleInterval: function (interval) {
		this.interval = interval;
		return this;
	},
	setUserInitiated: function () { return this; },
	setExplicit: function () { return this; },
	setPersist: function () { return this; },
	setReplace: function () { return this; },
	setRequirements: function (requirements) {
		this.requirements = requirements;
		return this;
	},
	setTrigger: function () { return this; },
	setCallback: function () { return this; },
	start: function () {
		return new Future({
			interval: this.interval,
			internetConfidence: this.requirements.internetConfidence
		});
	}
};

MockActivity.activityId = "jub-jub";


SyncErrorHandlingTests.prototype = {
	before: function (callback) {
	// 	this.PalmCall_call_orig = PalmCall.call;
	// 	PalmCall.call = mockPalmCall_call;
		this.command = new MockSyncAssistant();
		this.command.handler = new MockSyncHandler();
		callback();
	},
	// after: function (callback) {
	// 	PalmCall.call = this.PalmCall_call_orig;
	// 	this.PalmCall_call_orig = null;
	// 	callback();
	// },
	
	configureSyncCommand: function (config) {
		for (var c in config) {
			if (config[c] === "base") {
				this.command[c] = SyncCommand.prototype[c];
			} else {
				this.command[c] = config[c];
			}
		}
	},

	doTest: function (reportResults, testFunc) {
		var runFuture = new Future();
		this.command.run(runFuture);
		
		runFuture.then(this, function (join) {
			try {
				console.log("Calling testFunc()...");
				return testFunc.apply(this, [join]).then(this, function (join) {
					console.log("... testFunc() done");
					if (join.exception || !join.result) {
						console.log("testFunc encountered error: " + (join.exception || join.result));
						reportResults(Test.failed);
						return join.result;
					} else {
						console.log("testFunc result: " + JSON.stringify(join.result));
						reportResults(Test.passed);
						return true;
					}
				});
			} catch (e) {
				reportResults(Test.failed);
				throw e;
			}
		});
	},

	checkErrorStatus: function (expected) {
		var where = [];
		where.push({
			prop: "accountId",
			op: "=",
			val: MockSyncAssistant.clientId
		}, {
			prop: "capabilityProvider",
			op: "=",
			val: MockSyncAssistant.capabilityProviderId
		});

		return TempDB.find({
			from: "com.palm.account.syncstate:1"
		}).then(function (join) {
			if (join.exception) {
				join.getResult();
			}
			console.log("Sync status: " + JSON.stringify(join.result.results[0]));
			join.result = (join.result.returnValue && join.result.results[0] && join.result.results[0].syncState === "ERROR" && join.result.results[0].errorText === expected);
		});
	},

	baseTest: function (reportResults, test) {
		this.configureSyncCommand(test.config || {});
		this.doTest(reportResults, function (join) {
			Test.require(join.exception);
			if (test.checkErrorStatus) {
				Test.requireEqual(join.exception.errorText, test.expected);
				return this.checkErrorStatus(test.expected);
			} else {
				Test.requireEqual(join.exception.message, test.expected);
				return new Future(true);
			}
		});
	},

	setupMockORama: function () {
		// It's a mock-o-rama
		var mockInfo = {
			oldPalmCall_call: PalmCall.call,
			oldActivity: Foundations.Control.Activity
		};
		PalmCall.call = mockPalmCall_call;
		Foundations.Control.Activity = MockActivity;
		return mockInfo;
	},

	cleanupMockORama: function (mockInfo) {
		// Clean up
		PalmCall.call = mockInfo.oldPalmCall_call;
		Foundations.Control.Activity = mockInfo.oldActivity;
	},

	test_getPeriodicSyncActivity: function (reportResults) {
		var mockInfo = this.setupMockORama();
		this.command.client.getSyncInterval = function () { throw new Error("getSyncInterval() error"); };
		this.command.client.requiresInternet = function () { throw new Error("requiresInternet() error"); };
	
		var future = this.command.getPeriodicSyncActivity();
		future.then(this, function (join) {
			console.log("result: " + JSON.stringify(join.result));
			if (!join.exception && join.result && join.result.interval === "24h" && join.result.internetConfidence === "fair") {
				reportResults(Test.passed);
			} else {
				reportResults(Test.failed);
			}
	
			// Clean up
			this.cleanupMockORama(mockInfo);
	
			return true;
		});
	},
	
	test_getPeriodicSyncActivity2: function (reportResults) {
		var mockInfo = this.setupMockORama();
	
		this.command.client.getSyncInterval = function () {
			return new Future().now(function () {
				throw new Error("getSyncInterval() error");
			});
		};
		this.command.client.requiresInternet = function () { throw new Error("requiresInternet() error"); };
	
		var future = this.command.getPeriodicSyncActivity();
		future.then(this, function (join) {
			console.log("result: " + JSON.stringify(join.result));
			if (!join.exception && join.result && join.result.interval === "24h" && join.result.internetConfidence === "fair") {
				reportResults(Test.passed);
			} else {
				reportResults(Test.failed);
			}
	
			// Clean up
			this.cleanupMockORama(mockInfo);
	
			return true;
		});
	},

	test_complete: function (reportResults) {
		var mockInfo = this.setupMockORama();

		this.command.client.requiresInternet = function () { throw new Error("requiresInternet() error"); };
		this.command._local2remoteTransformer = function () {};
		this.command.getPeriodicSyncActivity = function () {
			return new Future().now(function (join) {
				join.result = {
					activityId: MockActivity.activityId
				};
			});
		};

		var future = this.command.complete({
			name: this.command.getPeriodicSyncActivityName(),
			complete: function () {
				return new Future(true);
			}
		});
		future.then(this, function (join) {
			if (!join.exception && join.result && join.result.internetConfidence === "fair") {
				reportResults(Test.passed);
			} else {
				reportResults(Test.failed);
			}

			// Clean up
			this.cleanupMockORama(mockInfo);

			return true;
		});
	}
};

SyncErrorHandlingTests.tests = [
/*	{
		name: "getCapabilityProviderId",
		config: {
			getCapabilityProviderId: function () {
				throw new Error("getCapabilityProviderId() error");
			}
		},
		expected: "getCapabilityProviderId() error"
	},
	{
		name: "getSyncOrder",
		config: {
			getSyncOrder: "base"
		},
		expected: "No getSyncOrder function"
	},
	{
		name: "getSyncObjects",
		config: {
			getSyncObjects: "base"
		},
		expected: "No getSyncObjects function"
	},
	{
		name: "getTransformer",
		config: {
			getTransformer: "base"
		},
		expected: "No getTransformer function"
	},
	{
		name: "getRemote2LocalTransformer",
		expected: "Exception getting remote2local transformer",
		config: {
			getRemote2LocalTransformer: function () {
				throw new Transport.TransportError("Exception getting remote2local transformer");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "getLocal2RemoteTransformer",
		expected: "Exception getting local2remote transformer",
		config: {
			getLocal2RemoteTransformer: function () {
				throw new Transport.TransportError("Exception getting local2remote transformer");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "getRemoteChanges",
		expected: "No remote object function",
		config: {
			getRemoteChanges: "base"
		}
	},
	{
		name: "getRemoteId",
		expected: "No getRemoteId function",
		config: {
			getRemoteId: "base"
		}
	},
	{
		name: "isDeleted",
		expected: "No isDeleted function",
		config: {
			isDeleted: "base"
		}
	},
	{
		name: "remote2local",
		expected: "Exception in remote2local transformer",
		config: {
			remote2local: function () {
				throw new Transport.TransportError("Exception in remote2local transformer");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "preSaveModify",
		expected: "Exception in preSaveModify",
		config: {
			preSaveModify: function () {
				throw new Transport.TransportError("Exception in preSaveModify");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "base_getNewRemoteObject",
		expected: "No new remote object function",
		config: {
			getNewRemoteObject: "base"
		}
	},
	{
		name: "getNewRemoteObject",
		expected: "Exception in getNewRemoteObject",
		config: {
			getNewRemoteObject: function () {
				console.log("Bad getNewRemoteObject called");
				throw new Transport.TransportError("Exception in getNewRemoteObject");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "base_getRemoteMatches",
		expected: "No remote matches function",
		config: {
			getRemoteMatches: "base"
		}
	},
	{
		name: "getRemoteMatches",
		expected: "Exception in getRemoteMatches",
		config: {
			getRemoteMatches: function () {
				throw new Transport.TransportError("Exception in getRemoteMatches");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "local2remote",
		expected: "Exception in local2remote transformer",
		config: {
			local2remote: function () {
				throw new Transport.TransportError("Exception in local2remote transformer");
			}
		},
		checkErrorStatus: true
	},
	{
		name: "base_putRemoteObjects",
		expected: "No remote put function",
		config: {
			putRemoteObjects: "base"
		}
	},
*/	{
		name: "putRemoteObjects",
		expected: "Exception in putRemoteObjects",
		config: {
			putRemoteObjects: function () {
				throw new Transport.TransportError("Exception in putRemoteObjects");
			}
		},
		checkErrorStatus: true,
		returnsFuture: true
	},
/*	{
		name: "postPutRemoteModify",
		expected: "Exception in postPutRemoteModify",
		config: {
			postPutRemoteModify: function () {
				throw new Transport.TransportError("Exception in postPutRemoteModify");
			}
		},
		checkErrorStatus: true
	}
*/];

SyncErrorHandlingTests.tests.forEach(function (test) {
	SyncErrorHandlingTests.prototype["test_" + test.name] = function (reportResults) {
		this.baseTest(reportResults, test);
	};
	if (test.returnsFuture) {
		SyncErrorHandlingTests.prototype["test_future_" + test.name] = function (reportResults) {
			var expected = "Exception in " + test.name + " future";
			var config = {};
			config[test.name] = function () {
				return new Future().now(function () {
					throw new Transport.TransportError(expected);
				});
			};
			this.baseTest(reportResults, {
				name: test.name,
				expected: expected,
				config: config,
				checkErrorStatus: true
			});
		};
	}
});
