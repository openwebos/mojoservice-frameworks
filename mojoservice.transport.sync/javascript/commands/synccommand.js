/*global console, Class, TempDB, Transport, Future, Foundations, exports, require: true, IMPORTS,
file, PalmCall, SyncStatusManager, AjaxCall */

var logError;

/*
 * The SyncCommand provide all the handling to synchronize content between a server and the client.
 * This class should be extended for use with specific servers and specific content types, but is general
 * enough to containt most (if not all) of the heavy lifting necessary in providing two-way content sync.
 */
var SyncCommand = exports.SyncCommand = Class.create(Transport.Command,
{
	commandTimeout: 60 * 60, // 60 minutes

	/*
	 * Returns a function which will transform between local and remote formats.
	 * The name describes which direction should be provided - currently supports
	 * local2remote and remote2local.  If local2remote is not supported, return undefined
	 * and this will become a readonly sync.
	 * The transformation function takes the form 'bool function(to, from)' and returns a
	 * defined value (of some sort) if the transform of from makes a change in 'to'.
	 */
	getTransformer: function(name, kindName)
	{
		throw new Error("No getTransformer function");
	},

	/*
	 * Returns the unique identifier for that object.  This is used to track syncing of the local and remote
	 * copies.
	 */
	getRemoteId: function(obj, kindName)
	{
		throw new Error("No getRemoteId function");
	},

	/*
	 * Returns true if the objects has been deleted from the server (ie. this is a tombstone).
	 */
	isDeleted: function(obj, kindName)
	{
		throw new Error("No isDeleted function");
	},

	/*
	 * Returns a set of remote changes from the server.
	 */
	getRemoteChanges: function(state, kindName)
	{
		throw new Error("No remote object function");
	},

	/*
	 * Given a set of remote ids, returns a set of remote objects matching those ids.
	 */
	getRemoteMatches: function(ids, kindName)
	{
		throw new Error("No remote matches function");
	},

	/*
	 * Put a set of remote objects to the server.  Each object has an operation property
	 * which is either 'save' or 'delete', depending on how the objects should be put
	 * onto the server.
	 */
	putRemoteObjects: function(objects, kindName)
	{
		throw new Error("No remote put function");
	},

	/*
	 * Create an 'empty' remote objects which can then have the local content
	 * transformed into.
	 */
	getNewRemoteObject: function(kindName)
	{
		throw new Error("No new remote object function");
	},

	/*
	 * Return an array of "identifiers" to identify object types for synchronization
	 * and what order to sync them in
	 * This will normally be an array of strings, relating to the getSyncObjects function:
	 * [ "contactset", "contact" ]
	 */
	getSyncOrder: function() {
		throw new Error("No getSyncOrder function");
	},

	/*
	 * Return an array of "kind objects" to identify object types for synchronization
	 * This will normally be an object with property names as returned from getSyncOrder, with structure like this:
	 * {
	 *   contact: {
	 *	 id: com.palm.contact.google:1
	 *	 metadata_id: com.palm.contact.google.transport:1
	 *	 NOTE: metadata_id is deprecated. All data should be stored in the "id" type
	 *   }
	 * }
	 */
	getSyncObjects: function() {
		throw new Error("No getSyncObjects function");
	},

	updateLocalTransportRevision: function(batchTransport, object_kind)
	{
		throw new Error("No updateLocalRevision function");
	},
	
	/*
	 * Return the ID string for the capability (e.g., CALENDAR, CONTACTS, etc.)
	 * supported by the sync engine as specified in the account template (e.g.,
	 * com.palm.calendar.google, com.palm.contacts.google, etc.).  This is used
	 * to provide automatic sync notification support.
	 */
	getCapabilityProviderId: function() {
	},
	
	/* 
	 * Return the number of retries to attempt when a sync error occurs
	 */
	getMaxSyncRetries: function() {
		return 3;
	},

	/* 
	 * Return the number of retries to attempt when a sync error occurs
	 */
	getSyncRetryInterval: function(retriesSoFar) {
		return "5m";
	},

	preSaveModify: function() {
		Utils.debug("synccommand: preSaveModify()");
		return new Future([]);
	},

	postPutRemoteModify: function() {
		Utils.debug("synccomand: postPutRemoteModify()");
		return new Future([]);
	},

	initialize: function()
	{
	},

	run: function(future)
	{
		this._future = future;
		this.syncActivityHelper 			= new SyncActivityHelper(this.controller.service.name, this.client.clientId);
		this.recreateActivitiesOnComplete 	= true; // used in complete()
		
		var serviceAssistant 				= this.controller.service.assistant,
			capabilityId,
			capabilityFuture;
		
		serviceAssistant._syncInProgress 	= serviceAssistant._syncInProgress || {};

		// determine if the account capability is enabled for this transport
		try {
			capabilityId = this.client.getCapabilityProviderId();
		} catch(e) {
			console.error("Error fetching capabilityProviderId from client");
		}

		if (capabilityId) {
			capabilityFuture = PalmCall.call("palm://com.palm.service.accounts/", "getAccountInfo", {"accountId": this.client.clientId}); 
			
			capabilityFuture.then(this, function(accountDataFuture) {
				var isEnabled = false,
					account = accountDataFuture.result.result,
					providers;
				
				if (account) {
					providers = account.capabilityProviders;
					for (var i = 0; i < providers.length; i++) {
						if (providers[i].id === capabilityId) {
							isEnabled = true;
							break;
						}
					}
				}
				
				capabilityFuture.result = isEnabled;
			});
		} else {
			console.error("CapabilityId is empty, allowing sync to continue");
			capabilityFuture = new Future(true);
		}

		capabilityFuture.then(this, function() {
			var isCapabilityEnabled = capabilityFuture.getResult();
			
			if (!isCapabilityEnabled)
			{
				// make sure that any stored state for the account transport object still indicates that it is disabled
				console.error("Capability is NOT enabled, ignoring sync request. Forcing account disable + canceling all sync activities");
				this.recreateActivitiesOnComplete = false; // set to false so we don't re-create the activities when this command completes
				
				future.nest(this.handler.disableAccount().then(this, function (disableAccountFuture) {
						disableAccountFuture.getResult();
						disableAccountFuture.nest(this.syncActivityHelper.cancelAllSyncActivities());
					}).then(function (cleanupActivitiesFuture) {
						cleanupActivitiesFuture.getResult();
						cleanupActivitiesFuture={returnValue:true, result:"capability is not enabled, ignoring sync request"};
						return cleanupActivitiesFuture;
					})
				);

			}
			else if (serviceAssistant._syncInProgress[this.client.clientId])
			{
				console.log("Sync activity already in progress, ignoring sync request");
				future.result={returnValue:true, result:"sync already in progress"};
			}
			else if (this.controller.args.$activity &&  this.controller.args.$activity.trigger &&  this.controller.args.$activity.trigger.returnValue===false) {
				// error during triggered activity - probably a bad watch
				var response = this.controller.args.$activity.trigger;
				console.error("Error with triggered activity:");
				console.error("error in trigger: "+JSON.stringify(response));
				future.result={returnValue:false, result:"error in trigger: "+JSON.stringify(response)};
			}
			else // start the sync machinery
			{
				serviceAssistant._syncInProgress[this.client.clientId]=true;
				var fsm = new Foundations.Control.FSM(this);
				var self = this;
				this._gotReply = function(future)
				{
					self.event("gotReply", future);
				};
			}
		});
	},

	"yield": function() {
		console.warn("Yield requested. Will stop syncing at next checkpoint");
		this._yieldRequested = true;
	},

	getPeriodicSyncActivityName: function() {
		var name = "Periodic Sync:"+this.controller.service.name + ":" + this.client.clientId; //TODO: clean this up here and in EnableAccountCommand - started by adding syncactivityhelper.js
		return name;
	},

	getPeriodicSyncActivity: function() {
		var name = this.getPeriodicSyncActivityName();
		var details = PalmCall.call("palm://com.palm.activitymanager", "getDetails", {"activityName": name}).then(this, function(future) {
			// got it - return details
			future.result = future.result.activity;
		},
		function(future) {
			// error - create activity
			var error = future.exception;
			if (error.errorCode === 2) {
				console.log("Periodic Sync Activity not found, re-creating it");
			} else {
				console.error("Error getting details for Sync Activity, re-creating it: " + error);
			}
			var inner;
			if (this.client.getSyncInterval && typeof this.client.getSyncInterval === 'function') {
				try {
					inner = this.client.getSyncInterval();
				} catch (e) {
					logError("getSyncInterval", e);
					inner = new Future("24h");
				}
			} else {
				console.error("=== No getSyncInterval function in client for "+this.controller.service.name +" ===");
				console.error("=== Default sync interval is 24 hours ===");
				inner = new Future("24h");
			}
			future.nest(inner).then(this, function(future) {
				//ToDo: merge this with implementation in EnableAccoutCommand
				var interval;
				if (future.exception) {
					console.error("Error in client.getSyncInterval, assuming syncInterval 24h");
					interval="24h";
				} 
				else {
					interval = future.result;
				}
				var requiresInternet;
				var requirements;
				if (this.client.requiresInternet && typeof this.client.requiresInternet === 'function') {
					try {
						requiresInternet = this.client.requiresInternet();
					}
					catch (_) {
						console.error("client error in requiresInternet");
						requiresInternet=true;
					}
				} else {
					console.error("=== No requiresInternet function in client for "+this.controller.service.name +" ===");
					console.error("=== Default answer is 'true' - internet is required ===");
					requiresInternet = true;
				}
				requirements = (requiresInternet) ? { internetConfidence: "fair" } : undefined;
				var args = { accountId: this.client.clientId };
				var activity = new Foundations.Control.Activity(name, "Periodic Sync", true)
					.setScheduleInterval(interval)
					.setUserInitiated(false)
					.setExplicit(true)
					.setPersist(true)
					.setReplace(true)
					.setRequirements(requirements)
					.setCallback("palm://" + this.controller.service.name + "/"+this.controller.config.name, args);
				return activity.start();
			});
		});
		return details;
	},

	timeoutReceived: function(msg) {
		try {
			/**
			 * DFISH-19453: Try to clear the sync status and set an error status
			 */
			var future = this.client.syncStatusMgr.clearSyncStatus().then(this, function (join) {
				join.getResult();
				console.log("timeoutReceieved - synccommand(complete): clearing previous sync state");
				return true;
			});
			
			future.nest(this.client.syncStatusMgr.setErrorCondition(new Transport.CommandTimeoutError(msg)).then(this, function (join) {
				join.getResult();
				console.log("synccommand(complete): resetting error sync state");
				return true;
			}));
			/**
			 * DFISH-19453: END
			 */
		} catch(except) { 
			console.log(JSON.stringify(except)); 
		}
	},
	
	complete: function(activity) {
		console.log("Completing activity "+activity.name);
		
		// this.recreateActivitiesOnComplete will be set to false when
		// the sync command is run while the capability is disabled
		// This is a little messy
		if (!this.recreateActivitiesOnComplete) {
			console.log("complete(): skipping creating of sync activities");
			return activity.complete().then(function (future) {
				future.result = true;
			});
		} else {
			var syncActivity;
			var networkError=false;
			var details = this.getPeriodicSyncActivity().then(this, function(future) {
				var restart=false;
				syncActivity = future.result;
				if (activity._activityId === syncActivity.activityId) {
					console.log("Periodic sync. Restarting activity");
					restart=true;
				} else {
					console.log("Not periodic sync. Completing activity");
				}
				if(this._hadLocalRevisionError) {
					restart = true;
					this._hadLocalRevisionError = false;
				}
				if (this._error && this._error.message.indexOf("httpRequest error") != -1) {
					networkError=true;
					this.retryNetworkError(activity);
				}
				return activity.complete(restart);
			}).then(function(future) {
				Utils.debug("Complete succeeded, result = "+JSON.stringify(future.result));
				future.result=true;
			},
			function(future) {
				console.log("Complete FAILED, exception = "+JSON.stringify(future.exception));
				future.result=false;
			}).then(this, function(future) {
				if (future.result) {
					// TODO: Set up one of these for each synced kind...
					if (this._local2remoteTransformer) { // if we can up-sync, set up a watch to kick of sync on edit
						var rev = this.client.transport.modnum;
						var name = "SyncOnEdit:"+this.controller.service.name + ":" + this.client.clientId; //TODO: clean this up here and in EnableAccountCommand
						var requiresInternet;
						var requirements;
						if (this.client.requiresInternet && typeof this.client.requiresInternet === 'function') {
							try {
								requiresInternet = this.client.requiresInternet();
							} catch (e) {
								logError("requiresInternet", e);
								requiresInternet = true;
							}
						} else {
							console.error("=== No requiresInternet function in client for "+this.controller.service.name +" ===");
							console.error("=== Default answer is 'true' - internet is required ===");
							requiresInternet = true;
						}
						requirements = (requiresInternet) ? { internetConfidence: "fair" } : undefined;
						var queryParams = {
							"query":{
								"from":this._kind,
								"where":[
									{"prop":"accountId", "op":"=", "val":this.client.transport.accountId},
									{"prop":"_rev", "op":">", "val": rev}
								],
								incDel: true
							},
							"subscribe": true
						};
						var args = { accountId: this.client.clientId };
						var activity = new Foundations.Control.Activity(name, "Sync On Edit", true)
							.setUserInitiated(false)
							.setExplicit(true)
							.setPersist(true)
							.setReplace(true)
							.setRequirements(requirements)
							.setTrigger("fired", "palm://com.palm.db/watch", queryParams)
							.setCallback("palm://" + this.controller.service.name + "/"+this.controller.config.name, args);
						return activity.start();
					}
				}
				future.result=true;
			});
			return details;
		}
	},
	
	retryNetworkError: function(activity) {
		var retryCount=0;
		console.log("Creating retry activity");
		// This should really get parsed in at command startup
		if (this.controller.args.$activity && this.controller.args.$activity.metadata  && this.controller.args.$activity.metadata.retryCount) {
			retryCount = this.controller.args.$activity.metadata.retryCount;
			console.log("Retry count is "+retryCount);
		}
		if (retryCount < this.getMaxSyncRetries()) {
			console.log("Network error detected, restarting activity after " + this.getSyncRetryInterval(retryCount));
			var name = "SyncRetry:"+this.controller.service.name + ":" + this.client.clientId;
			var requiresInternet;
			var requirements;
			if (this.client.requiresInternet && typeof this.client.requiresInternet === 'function') {
				try {
					requiresInternet = this.client.requiresInternet();
				} catch (e) {
					logError("requiresInternet", e);
					requiresInternet = true;
				}
			} else {
				console.error("=== No requiresInternet function in client for "+this.controller.service.name +" ===");
				console.error("=== Default answer is 'true' - internet is required ===");
				requiresInternet = true;
			}
			requirements = (requiresInternet) ? { internetConfidence: "fair" } : undefined;
			var args = { accountId: this.client.clientId };
			var retryActivity = new Foundations.Control.Activity(name, "SyncRetry", true)
				.setUserInitiated(false)
				.setExplicit(true)
				.setPersist(true)
				.setReplace(true)
				.setRequirements(requirements)
				.setScheduleInterval(this.getSyncRetryInterval(retryCount))
				.setMetadata({"retryCount":retryCount+1})
				.setCallback("palm://" + this.controller.service.name + "/"+this.controller.config.name, args);
			return retryActivity.start();
		} else {
			console.log(">>>Too many retries, giving up for now.");
		}
	},
	
	__start:
	{
		__enter: function()
		{
			var capability;
			if (!this.client.syncStatusMgr) {
				try {
					capability = this.client.getCapabilityProviderId();
				} catch(e3) {
					logError("getCapabilityProviderId", e3);
					// we're not returning an error here because 3rd-part sync services can't properly implement
					// getCappabilityId at this time - if the client doesn't implement it, we should sync anyway
					//this._error=e3;
					//return "error";
				} finally {
					// We do this here so that even if the above call to getCapabilityProviderId() excepts,
					// we'll have an instance of SyncStatusManager to work with in the "error" state
					this.client.syncStatusMgr = new SyncStatusManager(this.client.clientId, capability, this.controller.service.name);
				}
			}
			this.client.syncStatusMgr.clearSyncStatus().then(this, function (future) {
				future.getResult();
				if (this.client.transport && this.client.transport.initialSync) {
					return this.client.syncStatusMgr.setInitialSyncStatus();
				} else {
					return this.client.syncStatusMgr.setIncrementalSyncStatus();
				}
			}).then(this._gotReply);
		},

		gotReply: function(join) {
			join.getResult();
			try {
				this._syncOrder = this.getSyncOrder();
			} catch (e) {
				logError("getSyncOrder", e);
				this._error=e;
				return "error";
			}
			try {
				this._syncObjects =this.getSyncObjects();
			} catch (e2) {
				logError("getSyncObjects", e2);
				this._error=e2;
				return "error";
			}
			this._upsyncedSomething=false;
			this._hadLocalRevisionError = false;
			this._syncCount=0;
			Utils.debug(">>>syncOrder = "+JSON.stringify(this._syncOrder));
			this._kindIndex=0;
			return "getFirstRemoteChanges";
		}
	},

	getFirstRemoteChanges:
	{
		__enter: function()
		{
			this._kindName=this._syncOrder[this._kindIndex];
			console.log(">>> kindName="+this._kindName);
			this._kind=this._syncObjects[this._kindName].id;
			console.log(">>> kind="+JSON.stringify(this._kind));

			try {
				this._remote2localTransformer = this.getTransformer("remote2local", this._kindName);
			} catch (e) {
				logError("getTransformer", e);
				this._error=e;
				return "error";
			}
			Utils.debug(">>> remote2localTransformer="+ this._remote2localTransformer);

			try {
				this._local2remoteTransformer = this.getTransformer("local2remote", this._kindName);
			} catch (e2) {
				logError("getTransformer", e2);
				this._error=e2;
				return "error";
			}
			if (!this._remote2localTransformer) {
				console.log(">>>No remote2local transformer defined for "+this._kindName+"! Going to next kind");
				return "nextType";
			}
			this._localChangeMap = {};
			this._serverDeleteMap = {};
			this._remoteState = "first";
			return "getMoreRemoteChanges";
		}
	},

	getMoreRemoteChanges:
	{
		__enter: function()
		{
			try {
				console.log("getMoreRemoteChanges");
				this.getRemoteChanges(this._remoteState, this._kindName).then(this._gotReply);
			} catch (e) {
				logError("getRemoteChanges", e);
				this._error=e;
				return "error";
			}
		},

		gotReply: function(join)
		{
			try
			{
				this._remoteState = join.result.more ? "more" : "last";
				this._remoteChanges = join.result.entries;
				//console.log(">>>this._remoteChanges:"+JSON.stringify(this._remoteChanges));
				return "getLocalMatches";
			}
			catch (_)
			{
				logError("getRemoteChanges.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	getLocalMatches:
	{
		__enter: function()
		{
			var self = this;
			var batch = {};
			try {
				console.log("getLocalMatches");
				this._remoteChanges.forEach(function(change)
				{
					batch[self.getRemoteId(change, self._kindName)] = change;
				});
			} catch (e) {
				logError("getRemoteId", e);
				this._error=e;
				return "error";
			}
			this._remoteChanges = batch;
			//console.log(">>>this._remoteChanges:"+JSON.stringify(this._remoteChanges));
			this.handler.getObjectsByRid(Object.keys(batch), this._kindName).then(this._gotReply);
		},

		gotReply: function(join)
		{
			var map = this._remoteChanges;
			this._remoteChanges = join.result;
			//console.log(">>>this._remoteChanges:"+JSON.stringify(this._remoteChanges));
			join.result.forEach(function(result)
			{
				result.remote = map[result.remote.remoteId];
			});
			return "mergeRemoteChanges";
		}
	},

	mergeRemoteChanges:
	{
		__enter: function()
		{
			var transformer = this._remote2localTransformer;
			var wb = [];
			var self = this;
			console.log("mergeRemoteChanges");
			//console.log(">>>this._remoteChanges:"+JSON.stringify(this._remoteChanges));
			try {
				this._remoteChanges.forEach(function(match)
				{
					var isDeleted;
						isDeleted = self.isDeleted(match.remote, self._kindName);
					if (isDeleted)
					{
						if (match.local._id)
						{
							match.operation = "delete";
							wb.push(match);
						}
						// else this object was deleted remotely, but there is no matching local object, so we ignore it.
					}
					else
					{
						// merge changes from remote to local objecs
						var t;
							t = transformer(match.local, match.remote);
						if (t)
						{
							// transformer returns true if anything changed
							match.operation = "save";
							wb.push(match);
						}
					}
				});
			} catch (e) {
				logError("mergeRemoteChanges", e);
				this._error=e;
				return "error";
			}
			this._remoteChanges=undefined;
			this._localWriteback = wb;

			return "preSaveModifyStep";
		}
	},

	preSaveModifyStep:
	{
		__enter: function()
		{
			console.log("preSaveModify");
			// modify local objects before pushing to database
			try {
				this.preSaveModify(this._localWriteback, this._kindName).then(this._gotReply);
			} catch (e) {
				logError("preSaveModifyStep", e);
				this._error=e;
				return "error";
			}
		},

		gotReply: function(future)
		{
			try
			{
				future.getResult();
				return "writeLocalChanges";
			}
			catch (_)
			{
				logError("preSaveModifyStep.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	writeLocalChanges:
	{
		__enter: function()
		{
			console.log("writeLocalChanges");
			this.handler.putObjects(this._localWriteback).then(this._gotReply);
		},

		gotReply: function(join)
		{
			this._localWriteback = undefined;
			//console.log(">>>gotReply join="+JSON.stringify(join));
			try
			{
				// Update local change map - used to avoid sending our immediate changes back to the server
				var puts = join.result.put;
				var map = this._localChangeMap;
				puts.forEach(function(result)
				{
					map[result.id] = result.rev;
				});
				// Update serverDeleteMap - used to avoid sending server deletes right back to the server on up-sync
				var deletes = join.result.deleted;
				map = this._serverDeleteMap;
				deletes.forEach(function(result)
				{
					map[result] = true; // add deleted records to map
				});

				// If we're done then update the account, otherwise get the next batch
				if (this._remoteState === "last")
				{
					if (this._local2remoteTransformer)
					{
						return "checkpointDownSync";
					}
					else
					{
						return "nextType";
					}
				}
				else
				{
					return "getMoreRemoteChanges";
				}
			}
			catch (_)
			{
				logError("writeLocalChanges", _);
				this._error = _;
				return "error";
			}
		}
	},

	// Down-sync complete. Save the syncKey, so we don't repeat all that work if anything goes wrong during upsync
	checkpointDownSync:
	{
		__enter: function()
		{
			console.log("saving syncKey");
			this.handler.updateAccountTransportObject(this.client.transport, {syncKey: this.client.transport.syncKey}).then(this._gotReply);
		},
		gotReply: function(future)
		{
			try
			{
				// NOV-119682
				// if yield was requested, end the sync now. Otherwise, continue to up-sync
				if (this._yieldRequested) {
					console.warn("Yield: Bailing out after down-sync");
					return "updateAccount";
				}
				else {
					// this holds already upsynced objects so they won't get pushed to the server again
					this._processedChanges = [];
					return "getLocalChanges";
				}
			}
			catch (_)
			{
				logError("checkpointDownSync", _);
				this._error = _;
				return "error";
			}
		}
	},

	getLocalChanges:
	{
		__enter: function()
		{
			console.log("getLocalChanges");
			this.handler.getChangedObjects(this.client.transport.modnum, this._kindName).then(this._gotReply);
		},

		gotReply: function(join)
		{
			try
			{
				// Filter out any remote2local changes we just made and find highest revision
				var map = this._localChangeMap;
				var delMap = this._serverDeleteMap;
				var rev = this.client.transport.modnum;
				var changes = [];
				join.result.forEach(function(result)
				{
					// if changed locally, and not deleted on server
					// TODO: This doesn't actually work quite correctly. See NOV-117942 for details
					// if the object was not already processed or if it has been changed in the meanwhile 
					// then put it in the changes array
					var upsynced = this._processedChanges[result.local._id]; 
					if (		(!upsynced || upsynced.rev < result.local._rev)
							&& 	(map[result.local._id] !== result.local._rev && !delMap[result.local._id])
							&& 	!result.local.preventSync) 	// preventSync is set on all objects that are deleted via disabling an account
															// do NOT upsync deleted objects that have this set to true
					{
						changes.push(result);
					}
					if (result.local._rev > rev)
					{
						rev = result.local._rev;
					}
				}, this);				
				this.client.transport.modnum = rev;
				this._latestRev = rev;
				this.handler.updateAccountTransportObject(this.client.transport, {modnum: rev});
				this._localChanges = changes;
				return "getFirstRemoteMatches";
			}
			catch (_)
			{
				logError("getLocalChanges", _);
				this._error = _;
				return "error";
			}
		}
	},

	getFirstRemoteMatches:
	{
		__enter: function()
		{
			var rids = [];
			var self = this;
			var localChangesToSyncUp = [];
			console.log("getFirstRemoteMatches");
			try {
				this._localChanges.forEach(function(change, index)
				{
					if (change.local.remoteId)
					{
						//this is a local modify or delete on a contact that exists remotely
						localChangesToSyncUp.push(change);
						rids.push(change.local.remoteId);
					}
					else if (!change.local._del)
					{
						//this is a local add
						localChangesToSyncUp.push(change);
						change.remote = self.getNewRemoteObject(self._kindName);
					}
					// else this is a local delete that happened on a brand-new local contact that was
					// never synced to the server. so we just drop the change
				});
			} catch (e) {
				logError("getNewRemoteObject", e);
				this._error=e;
				return "error";
			}
			//now replace this._localChanges with localChangesToSyncUp so that we drop the
			//objects that were added locally and then deleted before getting synced up
			this._localChanges = localChangesToSyncUp;
			this._rids = rids;
			try {
				this.getRemoteMatches(rids, this._kindName).then(this._gotReply);
			} catch (e2) {
				logError("getRemoteMatches", e2);
				this._error=e2;
				return "error";
			}
		},

		gotReply: function(join)
		{
			try
			{
				var matches = this._localChanges;
				var pos=0;
				for (var i=0; i < join.result.length; i++)
				{
					var rid = this._rids[i];
					while (matches[pos].local.remoteId !== rid)
					{
						pos++;
					}
					matches[pos++].remote = join.result[i];
				}
				return "mergeLocalChanges";
			}
			catch (_)
			{
				logError("getFirstRemoteMatches.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	mergeLocalChanges:
	{
		__enter: function()
		{
			console.log("mergeLocalChanges");
			var transformer = this._local2remoteTransformer;
			var wb = [];
			try {
				this._localChanges.forEach(function(match)
				{
					if (match.local._del)
					{
						match.operation = "delete";
						wb.push(match);
					}
					else
					{
						var t = transformer(match.remote, match.local);
						if (t)
						{
							match.operation = "save";
							wb.push(match);
						}
					}
				});
			} catch (e) {
				logError("local2remotetransformer", e);
				this._error=e;
				return "error";
			}
			this._remoteWriteback = wb;

			return "writeRemoteChanges";
		}
	},

	writeRemoteChanges:
	{
		__enter: function()
		{
			console.log("writeRemoteChanges");
			// TODO: remove this when NOV-117942 is fixed properly
			if (this._remoteWriteback.length > 0) {
				this._upsyncedSomething = true;
			}
			// TODO: make this configurable, for transports that can do all-or-nothing upsync
			var one_change = this._remoteWriteback.shift();
			if (!one_change) {
				return "nextType";
			}
			this._batch = [one_change];
			try {
				this.putRemoteObjects(this._batch, this._kindName).then(this._gotReply);
			} catch (_) {
				logError("putRemoteObjects", _);
				this._error=_;
				return "error";
			}
		},

		gotReply: function(join)
		{
			try
			{
				// copy any changed remoteIds from putRemoteObjects into the local objects
				var results = join.result;
				var len = results.length;
				var transports = [];
				for (var i = 0; i < len; i++)
				{
					var result = results[i];
					var local = this._batch[i].local;
					if (result !== local.remoteId)
					{
						local.remoteId = result;
					}
					transports.push(local);
				}
				this._batch.transport = transports;
				return "writeRemoteTransportChanges";
			}
			catch (_)
			{
				logError("writeRemoteChanges.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},
	
	updateLocalRevision:
	{
		__enter: function() {
			try {
				console.log("updateLocalRevision");
				this.updateLocalTransportRevision(this._batch.transport, this._kindName).then(this._gotReply);
			} catch (e) {
				console.error("error in updateLocalRevision: "+e._stack?e.stack:e.toString());
				this._error=e;
				return "error";
			}
		},
		
		gotReply: function(future)
		{
			try
			{
				future.getResult();
				return "writeRemoteTransportChanges";
			}
			catch (_)
			{
				console.log(_.stack);
				this._error = _;
				return "error";
			}
		}
	},
	
	writeRemoteTransportChanges:
	{
		__enter: function()
		{
			console.log("writeRemoteTransportChanges");
			// save all the local objects
			this.handler.putTransportObjects(this._batch.transport, this._kindName).then(this._gotReply);
		},

		gotReply: function(join)
		{
			try
			{
				// copy any changed revs from the put into the local objects
				var results = join.result;
				var len = results.length;
				for (var i = 0; i < len; i++)
				{
					var result = results[i];
					var local = this._batch[i].local;
					if (result.id !== local._id) {
						throw new Error("ID mismatch from putTransportObjects()");
					} else {
						if (local._rev && (result.rev !== local._rev)) {
							local._rev=result.rev;
						}
					}
				}
				this._batch.transport = undefined;
				join.result = true;
				// if we arrived here from a revision mismatch error then restart the
				// up-sync
				if( this._batch.revisionChangedError ) {
					this._batch.revisionChangedError = false;
				}
				return "getPostPutRemoteChanges";
			}
			catch (_)
			{
				// If this is the second time we are receiving revision mismatch for
				// an object then do not try to update it again
				if( this._batch.revisionChangedError ) {
					console.log(_.stack);
					this._error = _;
					// Did we previously throw an exception ... if no then throw it
					return "error";					
				} else
					if(_.errorCode===-3961){
						return "updateLocalRevision";
					}
				
				logError("writeRemoteTransportChanges", _);
				this._error = _;
				return "error";
			}
		}
	},

	getPostPutRemoteChanges:
	{
		__enter: function()
		{
			// Give the client an opportunity to modify local objects based on
			// results from putting those objects to the server (e.g., etags)
			try {
				console.log("getPostPutRemoteChanges");
				this.postPutRemoteModify(this._batch, this._kindName).then(this._gotReply);
			} catch (_) {
				logError("postPutRemoteModify", _);
				this._error=_;
				return "error";
			}
		},

		gotReply: function(join)
		{
			try
			{
				var results = join.result;
				var len = results.length;
				if (len)
				{
					for (var i = 0; i < len; ++i)
					{
						results[i] = {
							local: results[i],
							operation: "save"
						};
					}
					this._batch = results;
					return "writePostPutRemoteChanges";
				}
				else
				{
					return "nextType";
				}
			}
			catch (_)
			{
				logError("getPostPutRemoteChanges.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	writePostPutRemoteChanges:
	{
		__enter: function()
		{
			console.log("writePostPutRemoteChanges");
			//console.log(">>> writePostPutRemoteChanges: " + JSON.stringify(this._remoteWriteback));
			this.handler.putObjects(this._batch).then(this._gotReply);
		},

		gotReply: function(join)
		{
			var results,
				len,
				result,
				local,
				i,
				j,
				wbLen;
			try
			{
				results = join.getResult().put;
				//set the changed revs for the local objects that are on the write array which have not yet been
				//written but have been modified in the meanwhile so that there won't be conflicting revs
				//at the moment that they will be written into the DB
				len = results.length;
				for (i = 0;i < len;i++)
				{
					result = results[i];
					this._processedChanges[result.id] = {id:result.id, rev:result.rev};
					wbLen = this._remoteWriteback.length;
					for (j = 0; j < wbLen; j++) {
						local = this._remoteWriteback[j].local;
						if (result.id === local._id && local._rev && (result.rev !== local._rev)) {
							local._rev = result.rev;
							break;
						}
					}
				}
				return "getPostPutRemoteModnum";
			}
			catch (_)
			{
				logError("writePostPutRemoteChanges.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	getPostPutRemoteModnum:
	{
		__enter: function()
		{
			console.log("getPostPutRemoteModnum");
			this.handler.getLatestRev(this._kindName).then(this._gotReply);
		},

		gotReply: function(join)
		{
			try
			{
				// Find highest revision
				var latestRev = join.result;
				console.log(">>> getPostPutRemoteModnum: cur: " + this.client.transport.modnum + ", latest: " + JSON.stringify(latestRev));
				if (latestRev > this._latestRev) {
					this._latestRev = latestRev;
				}
				return "nextType";
			}
			catch (_)
			{
				logError("getPostPutRemoteModnum.gotReply", _);
				this._error = _;
				return "error";
			}
		}
	},

	nextType:
	{
		__enter: function()
		{
			console.log("nextType");
			if (this._remoteWriteback && this._remoteWriteback.length > 0) {
				return "writeRemoteChanges";
			}
			// if there were any changes since upsync then see if there might have been
			// new local changes beetween them so that we can upsync them also
			if (this._latestRev > this.client.transport.modnum) {
				return "getLocalChanges";
			}
			console.log(">>> this._kindIndex = "+this._kindIndex+", this._kinds.syncOrder.length-1="+(this._syncOrder.length-1));
			if (this._kindIndex < this._syncOrder.length-1) {
				this._kindIndex++;
				return "getFirstRemoteChanges";
			}
			return "updateAccount";
		}
	},

	updateAccount:
	{
		__enter: function()
		{
			console.log("updateAccount");
			this.handler.updateAccountTransportObject(this.client.transport, {initialSync: false, syncKey: this.client.transport.syncKey}).then(this._gotReply);
		},

		gotReply: function(join)
		{
			try
			{
				return join.result && "success";
			}
			catch (_)
			{
				logError("updateAccount", _);
				this._error = _;
				return "error";
			}
		}
	},

	success:
	{
		__enter: function()
		{
			console.log("success");
			var serviceAssistant = this.controller.service.assistant;
			if(this._hadLocalRevisionError) {
				this._hadLocalRevisionError = false;
				return "getFirstRemoteChanges";
			}
			// If some updates received revision error then resync those objects
			if (this._upsyncedSomething && this._syncCount < 2) {
				/* restart current sync */
				console.log("Upsync ocurred, restarting sync");
				this._syncCount++;
				this._upsyncedSomething = false;
				return "getFirstRemoteChanges";
			}
			serviceAssistant._syncInProgress[this.client.clientId]=false;
			this.client.syncStatusMgr.clearSyncStatus().then(this, function (join) {
				join.getResult();
				console.log("synccommand(success): __enter");
				this._future.result = {};
			});
		}
	},

	error:
	{
		__enter: function()
		{
			var serviceAssistant = this.controller.service.assistant;
			serviceAssistant._syncInProgress[this.client.clientId]=false;

			//TODO: NOV-111365: before we clear the sync status, we need to check to see if it's a recoverable network error,
			//		in which case we should retry the sync (based on a retry count provided by the sync engine)
			
			this.client.syncStatusMgr.clearSyncStatus().then(this, function (join) {
				join.getResult();

				//this is the list of cases where we need to notify the user of the error
				if (this._error instanceof Transport.TransportError) {
					this.client.syncStatusMgr.setErrorCondition(this._error);
				}

				//TODO: in some of these cases (e.g. Transport.AuthenticationError), we should also stop the scheduled syncs
				//		until the user corrects the error
								
				//whether or not we notify the user of the error, we need to propagate it upwards
				this._future.exception = this._error;
			});
		}
	}
});

/*
 * Static function that checks if the photo object already exists in the filecache,
 * if not it will fetch the photo and insert it into the filecache using the function
 * passed in to fetch the resource
 * Returns the local path to the photo
 */
SyncCommand.fetchPhoto = function( photo, headers )
{
	
	var future = new Future(),
		cacheInsertFuture,
		haveCanceledSubscription = false,
		fs,
		urlObject,
		hashPhoto = MD5(JSON.stringify( photo ));
		
	console.log("SyncCommand.fetchPhoto: "+hashPhoto);
	future.now(function () {
		if (typeof require === 'undefined') {
			require = IMPORTS.require;
		}
		fs = require('fs');
		var url = require('url');

		Utils.debug("synccommand.fetchPhoto() : " + JSON.stringify( photo ) );

		// Check if a filepath already exists
		if (photo.localPath) {
			try
			{
				var exists = fs.openSync(photo.localPath, "r");
				if (exists)
				{
					fs.closeSync(exists);
					console.log("fetchPhoto: photo already exists: " + photo.localPath);
					return new Future({
						skippedInsert: true,
						path: photo.localPath
					});
				}
			}
			catch (e)
			{
				console.log("File does not exist: " + photo.localPath);
			}
		}

		urlObject = url.parse(photo.value);
		var name = urlObject.pathname.substring(urlObject.pathname.lastIndexOf("/") + 1) || "unknown";
		// This size is an estimate which will be resized accordingly once the photo has been downloaded
		//TODO: this should really reference Contacts.PersonPhotos.BIG_PHOTO_FILECACHE_SIZE and Contacts.PersonPhotos.LIST_PHOTO_FILECACHE_SIZE
		var size = (photo.type === "type_big") ? 34816 : 8192;

		cacheInsertFuture = PalmCall.call("palm://com.palm.filecache/", "InsertCacheObject", {
			typeName: "contactphoto",
			fileName: name,
			size: size,
			subscribe: true
		});

		return cacheInsertFuture;
	});

	// Copy the image to the filecache
	future.then(function () {
		
		var result = future.result,
			path = future.result.pathName;
		console.log("insert into filecache: "+ path +" :hash: "+hashPhoto);
		if (result.skippedInsert) {
			return result.path;
		}

		Utils.debug("fetchPhoto: filecache object inserted at: " + path);

		// open a file for writing. We're using openSync here so as not to have to
		// deal with asynchronous I/O
		var file = fs.openSync(path, "w");
		// total bytes transferred
		var count = 0;

		// set up the options for this request - we have custom headers and an onData callback
		var options = {};
		options.headers = headers;
		options.onData = function onDataCallback(chunk) {
			//console.log("chunk.length="+chunk.length);
			// write chunk to file '0' is the offset in the buffer, and
			// chunk.length writes the whole thing. By default, it writes nothing...
			fs.writeSync(file, chunk, 0, chunk.length);
			count += chunk.length;
		};

		//now make the request
		var ajaxCallFuture = AjaxCall.call(AjaxCall.RequestMethod.GET, urlObject.href, "", options);

		ajaxCallFuture.then(function () {
			var status = ajaxCallFuture.result.status;

			console.log("File finished downloading - (" + count + "): " + hashPhoto);

			// close the file we had open
			fs.closeSync(file);

			// If it failed to download, expire the file and throw an error
			if (status !== 200) {
				console.log("failed to download, status: " + status + ", hash: " + hashPhoto);
				var expireFuture = PalmCall.call("palm://com.palm.filecache", "ExpireCacheObject", {
						pathName: path
				});

				expireFuture.then(function () {
					expireFuture.getResult();
					throw new Error(ajaxCallFuture.result.responseText);
				});

				return expireFuture;
			}

			var resizeFuture = PalmCall.call("palm://com.palm.filecache/", "ResizeCacheObject", {
				pathName: path,
				newSize: count
			});
			resizeFuture.then(function () {
				resizeFuture.getResult();
				console.log("resize filecache, hash: " + hashPhoto);
				//cancel the subscription we had open with the filecache so that it will save the object
				PalmCall.cancel(cacheInsertFuture);
				haveCanceledSubscription = true;

				// Now that the file exists on the local filesystem, set the path in the photo object
				// so it can make use of it
				photo.localPath = path;

				//also return the path to the caller via the future chain
				return path;
			});
			return resizeFuture;
		});

		return ajaxCallFuture;
	});

	future.then(function () {
		try {
			console.log("fetchPhoto: image copied to file cache: " + JSON.stringify(future.result) +", hash: "+hashPhoto);
			return future.result;
		} catch(e) {
			logError("fetchPhoto", e);
			throw e;
		} finally {
			//just in case we didn't cancel it above, cancel it now
			if (!haveCanceledSubscription) {
				PalmCall.cancel(cacheInsertFuture);
			}
		}
	});

	return future;
};

logError = function logError(place, exception) {
	console.error("error code"+exception.errorCode+" in " + place + ": " + (exception._stack?exception._stack:exception.toString()));
};
