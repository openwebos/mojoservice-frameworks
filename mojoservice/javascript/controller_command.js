/*global exports, Class, Json, Future, Activity, ActivityManager, FutureFactory, console*/
var CommandController = exports.CommandController = Class.create(
{
	initialize: function(service, config, isPublic, message, args)
	{
		this.service = service;
		this.config = config;
		this.isPublic = isPublic;
		this.message = message;
		this.adoptFailed = false;
		if (message)
		{
			try
			{
				this.args = JSON.parse(message.payload());
			}
			catch (e)
			{
				console.error("MojoService: error during message parsing: "+e);
				this._exception = e;
			}
		}
		if (!this.args)
		{
			this.args = args || {};
		}
		this.future = new Future();
		if (config.watch && this.args.watch)
		{
			this.watch = new Future();
		}
		else if (config.subscribe && this.args.subscribe)
		{
			this.subscribe = new FutureFactory();
		}
		
		// If we are passed activity information, we use that to adopt the activity
		if (this.args.$activity)
		{
			//console.log("Passed Activity: "+JSON.stringify(this.args.$activity));
			var passed_activity = this.args.$activity;
			this.activity = new Activity();
			if (passed_activity && passed_activity.callback && passed_activity.callback.serial) {
				this.activity.serial = passed_activity.callback.serial;
			}
			var fromActivityManager =  message && message.senderServiceName && (message.senderServiceName()==='com.palm.activitymanager');
			if (fromActivityManager) {
				console.log("activityManager launched us - adopting activity with serial "+this.activity.serial);
				this._pendingAdopt = this.activity.adopt(passed_activity.activityId).then(this, function(future) {
					console.log("activity adopted");
					if (future.exception)
					{
						console.error("MojoService failed to adopt activity "+passed_activity.activityId+" : "+future.exception);
						this.adoptFailed=true;
						this._exception=future.exception;
						this._pendingAdopt.result=false;
					}
					else
					{
						console.log("success!");
						this.message.respond(JSON.stringify(
						{
							returnValue: true
						}));
						this._pendingAdopt.result=true;
					}
				});
			} else {
				console.log("app or service launched us - monitoring activity "+passed_activity.activityId);
				this._pendingAdopt = this.activity.monitor(passed_activity.activityId).then(this, function(future) {
					console.log("activity monitored");
					if (future.exception)
					{
						console.error("MojoService failed to monitor activity "+this.args.$activity.activityId+" : "+future.exception);
						this._exception=future.exception;
						future.result=false;
					}
					else
					{
						future.result=true;
					}
				});
			}
		}
		// We create a new activity
		else {
			var name = ActivityManager.uniqueNameFor(config.name);
			console.warn("MojoService: no activity passed in, creating "+name);
			this.activity = new Activity(name, config.description||"no description provided");
			this._pendingAdopt = this.activity.start().then(this, function(future) {
				console.log("MojoService: started new activity: "+this.activity.name);
				future.setResult(true);
			});
		}
		this.activity.onEvent(this._onActivityEvent.bind(this));
		ActivityManager.add(this.activity);
		
		this.assistant = service.commandFactory.createCommandAssistant(config);
		if (!this.assistant)
		{
			this._exception = new Error("Cannot find command assistant '" + config.assistant + "'");
			this.assistant = {};
		}
		this.assistant.controller = this;
		try
		{
			if (this.assistant.setup) {
				this.assistant.setup(message);
			}
		}
		catch (e2)
		{
			console.error("MojoService: error during controller assistant setup: "+e2);
			this._exception = e2;
		}
		// Timeout is either defined by the assistant, the command config, or inherited from the service
		this._timeout = this.assistant.commandTimeout || this.config.commandTimeout || service._timeout;
	},
	
	run: function()
	{
		//console.log("RUN");
		if (this._pendingAdopt)
		{
			console.log("deferring command until adopt completes");
			this._pendingAdopt.then(this, this._actuallyRun);
		}
		else
		{
			this._actuallyRun();
		}
	},
	
	// Todo: actually check the status of the activity setup here
	_actuallyRun: function(activityFuture)
	{
		// Send any exception generated during startup
		if (this._exception)
		{
			if (this.adoptFailed) {
				// if we failed to adopt an activity for an ActivityManager callback, don't return an error - it causes AM to cancel the activity.
				this._reply("reply", {"status":"adopt failed", "error":this._exception.toString()});
			} else {
				this._reply("exception", this._exception);
			}
			return;
		}
		
		// If we have a schema, validate the args.
		var error = this._validateWithSchema(this.config.argsSchema, this.args);
		if (error)
		{
			this._reply("exception", error);
			return;
		}
		
		// Setup a timeout for this command, which will send a reply if the command doesn't respond in the
		// appropriate amount of time.
		var self = this;
		var that=this;
		this._timer = setTimeout(function()
		{
			var msg = "commandTimeout in "+that.service.name+"/"+that.config.name;
			console.error(msg);
			try {
				if (that.assistant.timeoutReceived && typeof that.assistant.timeoutReceived === 'function') {					
					that.assistant.timeoutReceived(msg);
				}
			} catch(except) { 
				console.error(JSON.stringify(except)); 
			}
			
			if (that.service.timeoutsEnabled)
			{
				if (self.future) {
					self.future.setException(Foundations.Err.create(504, msg));
				} else {
					self._reply("exception", { errorCode: 504, errorText: msg, timeout: true, commandTimeout: that._timeout });
				}
			} else {
				console.error("Timeouts disabled, doing nothing");
			}
		}, this._timeout * 1000);
		// We run the command via the service commandRunner.  We want to give the service assistant chance
		// to schedule the command.  The default action is to just execute the command assistant's run method.
		this.service.commandRunner.runCommand(this).then(this, function(future)
		{
			this._validateAndReply(this.config.returnSchema, "reply", future);
		});
	
		// If this call supports watch or subscribe, make sure we send a reply when that is set
		if (this.watch || this.subscribe)
		{
			this._subscribe();
			if (this.watch)
			{
				this.watch.then(this, function(watch)
				{
					this._validateAndReply(this.config.watchSchema, "watch", watch);
				});
			}
			else if (this.subscribe)
			{
				this.subscribe._activate(this, function(future)
				{
					this._validateAndReply(this.config.subscribeSchema, "subscribe", future);
				});
			}
		}
	},
	
	cleanup: function()
	{
		//console.log("CommandController.cleanup()");
		if (this.message)
		{
			delete this.message;
		}
		if (this._timer)
		{
			clearTimeout(this._timer);
			delete this._timer;
		}
		this._unsubscribe();
		if (this.activity) {
			if (this.assistant.complete && typeof this.assistant.complete === 'function') {
				try {
					this.assistant.complete(this.activity);
				}
				catch(e) {
					console.error("MojoService: error during command assistant complete(): "+e);
					//throw(e);
					// don't re-throw here, just complete the activity
					console.error("Trying to complete it myself");
					this.activity.complete();
				}
			} else {
				console.log("completing/unsubscribing activity "+this.activity.name);
				this.activity.complete();
			}
			ActivityManager.remove(this.activity);
			delete this.activity;
		}
		if (this.assistant.cleanup)
		{
			try
			{
				this.assistant.cleanup();
			}
			catch(e3)
			{
				console.error("MojoService: error during command assistant cleanup: "+e3);
				throw(e3);
			}
		}
	},

	_validateWithSchema: function(schema, args)
	{
		if (schema)
		{
			if (typeof schema === "string")
			{
				schema = this.service.application.config.schemas[schema];
			}
			var v = Json.Schema.validate(args, schema);
			if (!v.valid)
			{
				return { errorText: "Schema validation error", errorCode: 400, schemaErrors: v.errors };
			}
		}
		return undefined;
	},
	
	_validateAndReply: function(schema, type, future)
	{
		try
		{
			var error = this._validateWithSchema(schema, future.result);
			if (error)
			{
				this._reply("exception", error);
			}
			else
			{
				this._reply(type, future.result);
			}
		}
		catch (e)
		{
			this._reply("exception", { errorText: e.message, errorCode: e.errorCode, exception: e.stack?e.stack:e.toString() });
		}
	},
	
	/*
	 * Send an reply back to the caller.
	 * If this is the last reply, then we delete the message to prevent any more being sent.
	 */
	_reply: function(status, reply)
	{
		var message = this.message;
		if (message)
		{
			if (this._timer)
			{
				//console.log("CLEARING TIMEOUT");
				clearTimeout(this._timer);
				delete this._timer;
			}
			reply = reply || {};
			switch (status)
			{
				case "reply":
					reply.returnValue = true;
					if (!this.watch && !this.subscribe)
					{
						delete this.message;
					}
					break;
					
				case "subscribe":
					reply.returnValue = true;
					reply.fired = true;
					break;
					
				case "watch":
					reply.returnValue = true;
					reply.fired = true;
					delete this.message;
					break;
					
				//case "exception":
				default:
					reply.returnValue = false;
					if (reply.errorCode === undefined) {
						reply.errorCode = -9999;
						reply.errorText = "MojoService: no errorCode supplied "+(reply.errorText||"");
					}
					delete this.message;
					break;
			}
			message.respond(JSON.stringify(reply));
			if (!this.message)
			{
				this.cleanup();
			}
		}
	},

	//ToDo: pass state changes along to command assistant
	_onActivityEvent: function(event)
	{
		console.log("Activity event", event);
		/* don't do anything, by default 
		if (event == Activity.Event.cancel)
		{
			this._reply("exception", { errorText: "Cancelled" });
		}
		
		if (event == Activity.Event.stop || event == Activity.Event.cancel || event == Activity.Event.complete)
		{
			console.log("this.activity = "+this.activity);
			console.log("this = "+this);
			ActivityManager.remove(this.activity);
		}
		*/
		if (event === Activity.Event.yield && typeof this.assistant.yield === 'function') {
			try
			{
				this.assistant.yield(this.activity);
			}
			catch(e)
			{
				console.error("MojoService: error during command assistant yield: "+e);
				throw(e);
			}
		} else if (this.assistant.activityEvent)
		{
			try
			{
				this.assistant.activityEvent(event);
			}
			catch(e2)
			{
				console.error("MojoService: error during command assistant activityEvent: "+e2);
				throw(e2);
			}
		}
	},
	
	_subscribe: function()
	{
		this._key = this.message.uniqueToken();
		this.service.subscribeCommand(this._key, this);
	},
	
	_unsubscribe: function()
	{
		this.service.unsubscribeCommand(this._key);
	},
	
	cancelSubscription: function()
	{
		if (this.assistant.cancelSubscription) {
			this.assistant.cancelSubscription();
		}
		this.cleanup();
	}
});
