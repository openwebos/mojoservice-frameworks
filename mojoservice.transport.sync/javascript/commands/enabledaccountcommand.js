/*global Class, Transport, Future, Foundations, exports, PalmCall, console */
exports.EnabledAccountCommand = Class.create(Transport.Command,
{
	commandTimeout: 3600,
	run: function(result)
	{
		var future = new Future(true),
			args = this.controller.args;
		
		console.log("EnabledAccountCommand: onEnabled = " + args.enabled);
		
		if(args.enabled) { // account is being enabled
			var requiresInternet;
			var requirements;
			if (this.client.requiresInternet && typeof this.client.requiresInternet === 'function') {
				try {
					requiresInternet = this.client.requiresInternet();
				}
				catch (e) {
					console.error("client error in requiresInternet");
					requiresInternet=true;
				}
			} else {
				console.error("=== No requiresInternet function in client for "+this.controller.service.name +" ===");
				console.error("=== Default answer is 'true' - internet is required ===");
				requiresInternet = true;
			}
			requirements = (requiresInternet) ? { internetConfidence: "fair" } : undefined;
			var command = "sync"; //TODO: Shouldn't the command name be retrieved from the config?
			args = { accountId: this.client.clientId };
			
			result.nest(future.then(this,
			[
				function()
				{
					return this.handler.getAccountTransportObject(this.client.clientId);
				},
				function()
				{
					// If there is a transport object reset, modnum to 0 
					// in order to force an initial sync after restore;
					// it will be set to the correct value in enableAccount
					var transportObject = future.result;
					if (transportObject && transportObject._sync) {
						console.log("OnEnabledAssistant: transport object is set to sync; clearing");
						transportObject = {
							_kind: transportObject._kind,
							_id: transportObject._id,
							_rev: transportObject._rev,
							accountId: transportObject.accountId,
							modnum: 0, // will be set correctly in enableAccount
							syncKey: {},
							extras: {}
						};
						return this.handler.put([transportObject]);
					}
					console.log("OnEnabledAssistant: transport object is NOT set to sync");
					return true;
				},
				function()
				{
					future.getResult();
					if (this.client.getSyncInterval && typeof this.client.getSyncInterval === 'function') {
						return this.client.getSyncInterval();
					} else {
						console.error("=== No getSyncInterval function in client for "+this.controller.service.name +" ===");
						console.error("=== Default sync interval is 24 hours ===");
						return new Future("24h");
					}
				},
				function()
				{
					var interval;
					if (future.exception) {
						console.error("Error in client.getSyncInterval, assuming syncInterval 24h");
						interval="24h";
					} 
					else {
						interval = future.result;
					}
					var activity = new Foundations.Control.Activity("Periodic Sync:"+this.controller.service.name + ":" + this.client.clientId, "Periodic Sync", true)
						.setScheduleInterval(interval)
						.setUserInitiated(false)
						.setExplicit(true)
						.setPersist(true)
						.setReplace(true)
						.setRequirements(requirements)
						.setCallback("palm://" + this.controller.service.name + "/"+command, args);
					return activity.start();
				},
				function(future)
				{
					var activityId = future.result.activityId;
					return this.handler.enableAccount({ syncActivityId: activityId }); //TODO: remove syncActivityId here - it's no longer used
				},
				function(future)
				{
					var initialSync=future.result;
					// Post command for the initial sync
					if (initialSync) {
						var activity = new Foundations.Control.Activity("Initial Sync:"+this.controller.service.name + ":" + this.client.clientId, "Initial Sync", true)
							.setUserInitiated(true)
							.setExplicit(true)
							.setPersist(true)
							.setReplace(true)
							.setCallback("palm://" + this.controller.service.name + "/"+command, args);
						return activity.start();
					} else {
						return true;
					}
				}
			]));
		} else {	// account is being disabled
			var serviceAssistant = this.controller.service.assistant;
			var clientId=this.client.clientId;
			serviceAssistant._syncInProgress = serviceAssistant._syncInProgress || {};
			
			if (serviceAssistant._syncInProgress[clientId]) {
				result.result={"returnValue":false, "errorText":"Sync in progress", "errorCode":"BUSY"};
				return;
			}
			serviceAssistant._syncInProgress[clientId]=true;
			
			result.nest(future.then(this,
			[
				function(future) {
					var name = "Periodic Sync:"+this.controller.service.name + ":" + this.client.clientId; // TODO: merge this with code in SyncCommand
					// get the activityId from ActivityManager
					return PalmCall.call("palm://com.palm.activitymanager", "getDetails", {"activityName":name}); 
				},
				function(future)
				{
					// Cancel the periodic sync activity
					console.log("cancelling periodic sync");
					if (future.exception) {
						console.error("ignoring exception from Activity Manager");
						return {returnValue: true};
					}
					var activity = future.result.activity;
					return PalmCall.call("palm://com.palm.activitymanager", "cancel", {"activityId":activity.activityId}); 
				},
				function(future) {
					if (future.exception) {
						console.error("ignoring exception from Activity Manager");
					}
					var name = "SyncOnEdit:"+this.controller.service.name + ":" + this.client.clientId; // TODO: merge this with code in SyncCommand - started common implementation: syncactivityhelper.js
					// get the activityId from ActivityManager
					return PalmCall.call("palm://com.palm.activitymanager", "getDetails", {"activityName":name}); 
				},
				function(future)
				{
					// Cancel the triggered sync activity
					if (future.exception) {
						console.error("ignoring exception from Activity Manager");
						return {returnValue: true};
					}
					console.log("cancelling triggered sync");
					var activity = future.result.activity;
					return PalmCall.call("palm://com.palm.activitymanager", "cancel", {"activityId":activity.activityId}); 
				},
				function()
				{
					return this.handler.disableAccount();
				},
				function(future)
				{
					if (future.exception) {
						console.error("ignoring exception from this.handler.disableAccount()");
					}
					serviceAssistant._syncInProgress[clientId]=false;
					return true;
				}
			]));
		}	
	}
});
