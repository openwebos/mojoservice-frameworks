/*global Class, Future, exports, PalmCall, console */
exports.CredentialsChangedCommand = Class.create(Transport.Command,
{
	run: function(result)
	{
		// when the credentials are changed successfully then initiate a sync
		// this may come after a restore and we must do a sync to get the data
		var future = new Future(true),
			args = this.controller.args,
			command = "sync";
		
		params = {
			enabled: true,
			accountId: args.accountId
		};
		result.nest(future.then(this, [
				function(future) {
					// enableAccount just checks to see if the modnum is set to 0
					// if so, it will update it to the most recent rev to avoid
					// syncing any deletes that may exist from previously removing the capability
					return this.handler.enableAccount();
				},
				function(future) {
					// reload the account transport object because it will have changed in enableAccount() if
					// the capability has just been enabled by entering the credentials into the particular app
					future.nest(this.handler.getAccountTransportObject(args.accountId).then(this, function(future) {
						var transport = future.result;
						if (!transport) {
							console.error("CredentialsChangedCommand: no transport object found");
						} else {
							this.client.transport = transport;
						}
						
						return true;
					}));
				},
				function(){
					var activity = new Foundations.Control.Activity("Sync on credentials changed:" + this.controller.service.name + ":" + this.client.clientId, "Sync on credentials changed", true)
						.setUserInitiated(true)
						.setExplicit(true)
						.setPersist(true)
						.setReplace(true)
						.setCallback("palm://" + this.controller.service.name + "/"+command, params);
					return activity.start();
				},
				function() {
					var capability;
					if (!this.client.syncStatusMgr) {
						try {
							capability = this.client.getCapabilityProviderId();
						} catch(ex) {
							console.log("getCapabilityProviderId", ex);
							return false;
						}
						this.client.syncStatusMgr = new SyncStatusManager(this.client.clientId, capability, this.controller.service.name);
					} 
					return this.client.syncStatusMgr.clearSyncStatus();
				},
				function(){
					future.result = {};
				}
		]));
	}
});