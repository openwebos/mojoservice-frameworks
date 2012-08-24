/*global console */
var ActivityManager =
{
	_activities: {},
	
	uniqueNameFor: function() {
		var counter = 0;
		return function(name) {
			return name+"_"+counter++;
		};
	}(),
	
	haveNoActivities: function() {
		return (Object.keys(this._activities).length === 0);
	},
	
	add: function(activity)
	{
		var name = activity.name;
		//console.log("MojoService.ActivityManager.add: "+name);
		if (this._activities[name] === undefined) {
			this._activities[name] = 1;
		} else {
			console.warn("MojoService.ActivityManager: Added activity "+name+" twice");
			this._activities[name]++;
		}
		this._enableTimer(false);
	},
	
	remove: function(activity)
	{
		var name = activity.name;
		//console.log("MojoService.ActivityManager.remove: "+name);
		if (this._activities[name] === undefined) {
			console.warn("ActivityManager: Removed unregistered activity "+name);
		} else {
			this._activities[name]--;
			if (this._activities[name] === 0) {
				//console.log("ActivityManger: deleting activity: "+name);
				delete this._activities[name];
			}
		}
		//console.log("MojoService.ActivityManager remaining activities: "+Object.keys(this._activities).length);
		if (this.haveNoActivities())
		{
			this._enableTimer(true);
		}
	},
	
	setTimeout: function(timeout, shutdown)
	{
		//console.log("MojoService.ActivityManager.setTimeout: "+timeout+" shutdown: "+shutdown);
		this._timeout = timeout;
		this._shutdown = shutdown;
		this._enableTimer(true);
	},
	
	resetTimer: function(msg) 
	{
		//console.log("MojoService.ActivityManager.resetTimer: "+msg);
		// reset the timer if it's already enabled
		if (this._timer) {
			this._enableTimer(true);
		}
	},
	
	_enableTimer: function(enable)
	{
		//console.log("MojoService.ActivityManager._enableTimer: "+enable);
		if (this._timer)
		{
			clearTimeout(this._timer);
			this._timer = undefined;
		}
		if (enable && this._shutdown)
		{
			this._timer = setTimeout(this._shutdown, this._timeout);
		}
	}
};
