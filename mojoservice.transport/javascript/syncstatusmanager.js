/*jslint devel:true */
/*global exports, Class, Future, PalmCall, TempDB, _ */

/*
 * Sync state management
 */
var SyncStatusManager = exports.SyncStatusManager = Class.create({

	initialize: function(accountId, capabilityProvider, busAddress) {
		this.accountId = accountId;
		this.capabilityProvider = capabilityProvider;
		this.busAddress = busAddress;
	},

	setSyncStatus: function(state, collectionId, metadata, errorCode, errorText) {
		var where = [],
		future;
		
		if (!this.accountId || !this.capabilityProvider || !this.busAddress) {
			console.log(">>> setSyncStatus(): manager not fully configured; not setting state");
			return new Future({
				returnValue: false,
				results: []
			});
		}
		
		where.push({
			prop: "accountId",
			op: "=",
			val: this.accountId
		}, {
			prop: "capabilityProvider",
			op: "=",
			val: this.capabilityProvider
		});
		
		if (collectionId) {
			where.push({
				prop: "collectionId",
				op: "=",
				val: collectionId
			});
		} 

		future = TempDB.find({
				from: "com.palm.account.syncstate:1",
				where: where
			}).then(this, function(future){
			var results = future.result.results,
			syncState;
			
			syncState = _.detect(results, function(result){
				return result.syncState === state;
			});			
			
			if (syncState) {
				console.log(">>> setSyncStatus(): update for state '", state, "'", JSON.stringify(syncState));
				syncState = {
					_kind: syncState._kind,
					_id: syncState._id,
					_rev: syncState._rev,
					metadata: metadata,
					errorCode: errorCode,
					errorText: errorText
				};
				
				console.log(">>> syncState merge with: " + JSON.stringify(syncState));
				future.nest(TempDB.merge([syncState]));
			}
			else {
				console.log(">>> setSyncStatus(): setting sync state to " + state);
				syncState = {
					_kind: "com.palm.account.syncstate:1",
					accountId: this.accountId,
					capabilityProvider: this.capabilityProvider,
					collectionId: collectionId,
					metadata: metadata,
					busAddress: this.busAddress,
					syncState: state,
					errorCode: errorCode,
					errorText: errorText
				};
				
				console.log(">>> syncState: " + JSON.stringify(syncState));
				
				future.nest(TempDB.put([syncState]));
			}
		});
	
		return future;
	},

	clearSyncStatus: function(collectionId) {
		if (!this.accountId || !this.capabilityProvider || !this.busAddress) {
			console.log(">>> clearSyncStatus(): manager not fully configured; not clearing state");
			return new Future({
				returnValue: false
			});
		}

		console.log(">>> clearSyncStatus(): clearing sync status");
		var where = [];
		where.push({
			prop: "accountId",
			op: "=",
			val: this.accountId
		}, {
			prop: "capabilityProvider",
			op: "=",
			val: this.capabilityProvider
		});

		if (collectionId) {
			where.push({
				prop: "collectionId",
				op: "=",
				val: collectionId
			});
		}

		return TempDB.del({
			from: "com.palm.account.syncstate:1",
			where: where
		});
	},

	/*
	 *	Convenience functions
	 */
	setIdleSyncStatus: function(collectionId, metadata) {
		return this.setSyncStatus("IDLE", collectionId, metadata);
	},

	clearIdleSyncStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setPushSyncStatus: function(collectionId, metadata) {
		return this.setSyncStatus("PUSH", collectionId, metadata);
	},

	clearPushSyncStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setInitialSyncStatus: function(collectionId, metadata) {
		return this.setSyncStatus("INITIAL_SYNC", collectionId, metadata);
	},

	clearInitialSyncStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setIncrementalSyncStatus: function(collectionId, metadata) {
		return this.setSyncStatus("INCREMENTAL_SYNC", collectionId, metadata);
	},

	clearIncrementalSyncStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setDeleteStatus: function(collectionId, metadata) {
		return this.setSyncStatus("DELETE", collectionId, metadata);
	},

	clearDeleteStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setErrorStatus: function(errorCode, errorText, collectionId, metadata) {
		return this.setSyncStatus("ERROR", collectionId, metadata, errorCode, errorText);
	},

	clearErrorStatus: function(collectionId) {
		return this.clearSyncStatus(collectionId);
	},

	setErrorCondition: function(exception, collectionId, metadata) {
		console.log(exception.stack);
		return this.setErrorStatus(exception.errorCode, exception.errorText, collectionId, metadata);
	}
});
