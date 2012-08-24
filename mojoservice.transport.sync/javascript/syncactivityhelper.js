// TODO: replace all activity code in synccommand & enabledaccountcommand with this
var SyncActivityHelper = SyncActivityHelper = Class.create({
	initialize: function(serviceName, accountId) {
		this.serviceName 	= serviceName;
		this.accountId 		= accountId;
		
		this._syncTypes = {
			PERIODIC: 		"Periodic Sync",
			TRIGGERED:	 	"SyncOnEdit"
		};
	},
	
	/**
	 * getSyncActivityId
	 * Fetches the activity for the specified sync type.
	 * This will suppress exceptions created from activitymanager returning an error
	 *
	 * @param	type	// this._syncTypes
	 * @return	future	// result is (activityId<int> || null) depending on if the activity is found
	 */
	getSyncActivityId: function(type) {
		var name = type + ":" + this.serviceName + ":" + this.accountId; 
		// get the activityId from ActivityManager
		return PalmCall.call("palm://com.palm.activitymanager", "getDetails", {"activityName":name}).then(function (future) {
			var activityId = future.result.activity.activityId;
			if (future.exception) {
				console.error("ignoring exception from Activity Manager while fetching sync activityId: ", activityId);
				return null;
			} else {
				return activityId;
			}
		}); 
	},
	
	/**
	 * cancelSyncActivity
	 * Fetches and cancels the sync activity for the specified type
	 * This will suppress exceptions created from activitymanager returning an error
	 *
	 * @param	type	// this._syncTypes
	 * @return	future	// result is (true || false) depending on if the cancel was successful
	 */
	cancelSyncActivity: function (type) {
		var future;
		
		if (type === this._syncTypes.PERIODIC) {
			future = this.getPeriodicSyncActivityId();
		} else {
			future = this.getTriggeredActivityId();
		}
		
		return future.then(function(future) {
			var activityId = future.result;
			if (activityId) {
				future.nest(PalmCall.call("palm://com.palm.activitymanager", "cancel", {"activityId":activityId}).then(function (future) {
					if (future.exception) {
						console.error("ignoring exception from Activity Manager while attempting to cancel sync activity: ", activityId);
						return false;
					} else {
						return true;
					}
				}));
			} else {
				future.result = false;
			}
			return future;
		});
	},
	
	/**
	 * getPeriodicSyncActivityId
	 * Fetches the activityId for the periodic sync activity
	 *
	 * @return	future	// result is (activityId<int> || null)
	 */
	getPeriodicSyncActivityId: function () {
		return this.getSyncActivityId(this._syncTypes.PERIODIC);
	},
	
	/**
	 * getTriggeredActivityId
	 * Fetches the activityId for the triggered sync activity
	 *
	 * @return	future	// result is (activityId<int> || null)
	 */
	getTriggeredActivityId: function () {
		return this.getSyncActivityId(this._syncTypes.TRIGGERED);
	},
	
	/**
	 * cancelPeriodicSyncActivity
	 * Fetches & cancels the periodic sync activity.
	 * This will suppress exceptions created from activitymanager returning an error
	 *
	 * @return	future	// result is (true || false) depending on if the cancel was successful
	 */
	cancelPeriodicSyncActivity: function () {
		console.log("canceling periodic sync");
		return this.cancelSyncActivity(this._syncTypes.PERIODIC);
	},
	
	/**
	 * cancelTriggeredSyncActivity
	 * Fetches & cancels the triggered sync activity.
	 * This will suppress exceptions created from activitymanager returning an error
	 *
	 * @return	future	// result is (true || false) depending on if the cancel was successful
	 */
	cancelTriggeredSyncActivity: function () {
		console.log("canceling triggered sync");
		return this.cancelSyncActivity(this._syncTypes.TRIGGERED);
	},
	
	/**
	 * cancelAllSyncActivities
	 * Fetches & cancels the periodic & triggered sync activity.
	 * This will suppress exceptions created from activitymanager returning an error
	 *
	 * @return	future	// result is (true || false) depending on if the cancels were successful
	 */
	// TODO: determine what this should return.  This really only returns the true/false value of the triggered sync activity
	//       because it is the last operation in the chain
	cancelAllSyncActivities: function () {
		return this.cancelPeriodicSyncActivity().then(this, function (future) {
			future.nest(this.cancelTriggeredSyncActivity());
		});
	}
});