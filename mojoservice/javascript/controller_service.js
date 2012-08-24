/*global webOS, exports, Class, console, CommandController, Foundations, ActivityManager, root, PalmCall, Future, MethodDispatcher */

/** section: MojoService
 * class ServiceController
**/

var ServiceController = exports.ServiceController = Class.create(
{
	initialize: function(application, config)
	{
		this._subscriptions = {};
		this.application = application;
		this.timeoutsEnabled = application.timeoutsEnabled;
		this.config = config;
		this.name = config.name;
		
		this.assistant = application.serviceFactory.createServiceAssistant(config);
		if (!this.assistant)
		{
			throw new Error("Cannot find service assistant '" + config.assistant + "'");
		}
		this.assistant.controller = this;
		
		// TODO: need to make this work with multiple services in one app
		// make sure PalmCall uses the correct bus handle
		// Every service listens on the private bus, services listen on the public bus if they have
		// any commands marked "public".
		// All Palm services send on the private bus.
		// A third-party service that has "privatebus":true can send on the private bus, otherwise
		// they're limited to sending on the public bus
		this._privateDispatcher = new MethodDispatcher(this.name, false);
		console.log("Private Bus Access: "+this.config.privatebus);
		if (this.config.privatebus || this.name.match(/^com\.palm\./)) {
			console.log("Sending on private bus");
			this._privateDispatcher.registerWithPalmCall();
		} else {
			console.log("sending on public bus");
			this._publicDispatcher = new MethodDispatcher(this.name, true);
			this._publicDispatcher.registerWithPalmCall();
		}
		
		// Get command assistant factory
		this.commandFactory = this.assistant.createCommandAssistant ? this.assistant : this;
		
		// Get command runner
		this.commandRunner = this.assistant.runCommand ? this.assistant : this;
		
		var debugMsgs = false;
		var globalized = false;

		if (this.config.globalized) {
			globalized = true;
		}

		// Finish setup
		if (globalized) {
			if (debugMsgs) {
				console.log(">>>reading locale");
			}

			this._setupFuture = PalmCall.call("palm://com.palm.systemservice", "getPreferences", {"keys":["locale"]});
			this._setupFuture.then(function(future) {
				exports.locale = future.result.locale.languageCode+"_"+future.result.locale.countryCode;
				exports.region = future.result.locale.countryCode;

				future.nest(PalmCall.call("palm://com.palm.systemservice/time", "getSystemTime", {}).then(function(future) {
					if (debugMsgs) {
						console.log("<<<have read timezone");
					}
					try {
						exports.TZ = future.result.TZ;
						exports.offset = future.result.offset;
						exports.timezone = future.result.timezone;
					} catch (error) {
						console.error("timezone fetch failed. error was: ", error);
					}
					future.result = true;
				}));
			});
		} else {
			this._setupFuture = new Future(true);
		}

		// If we have an assistant, then we call it after the gloabliization setup (if appropriate).
		// If setup() returns a future, we will not dispatch any command until this future is completed by the assistant.
		if (this.assistant.setup)
 		{
			this._setupFuture.then(this, function(future) {
				future.getResult();
				console.log(">>>Running ServiceAssistant setup");
				var v = this.assistant.setup();
				if (v===undefined) {
					console.log(">>>Returned undefined. Setting setupFuture result");
					v=true;
				}
				return v;
			});
		}
		// Default timeout is defined by the assistant, the service config, or inherited from the application
		this._timeout = this.assistant.commandTimeout || config.commandTimeout || application._timeout;
		
		var commands = this.assistant.getConfiguration ? this.assistant.getConfiguration() : config.commands;
		// If we have no commands defined for this service, we log this (not sure if this is an error yet)
		if (!commands)
		{
			console.log("No commands defined for service '", this.name + "'");
		}
		
		this._bindCommands(commands);
	},
	
	cleanup: function()
	{
		if (this._privateDispatcher) {
			this._privateDispatcher.unregister();
			delete this._privateDispatcher;
		}
		if (this._publicDispatcher) {
			this._publicDispatcher.unregister();
			delete this._publicDispatcher;
		}
		if (this.assistant.cleanup) {
			try
			{
				this.assistant.cleanup();
			}
			catch(e)
			{
				console.error("MojoService: error during service assistant cleanup: "+e);
			}
		}
	},

	/*
	 * Bind a set of command names onto the bus for this service name.
	 */
	_bindCommands: function(commands)
	{
		// Bind commands to private and, optionally, public bus
		this.commands = {};
		var self = this;
		commands.forEach(function(command)
		{
			if (self.commands[command.name]) {
				throw new Error('Config error: more than one command named "'+command.name+'" in service "'+self.name+'"');
			}
			self.commands[command.name] = command;
			if (self._privateDispatcher) {
				self._privateDispatcher.registerMethod(command.category || "", command.name, self._dispatchCommand.bind(self, false, command));
			}
			// If this command is public, also put it on the public bus
			if (command.public)
			{
				if (!self._publicDispatcher)
				{
					self._publicDispatcher = new MethodDispatcher(self.name, true);
				}
				self._publicDispatcher.registerMethod(command.category || "", command.name, self._dispatchCommand.bind(self, true, command));
			}
		});
		
		if (this._privateDispatcher) {
			this._privateDispatcher.registerMethod("", "__info", this._infoCommand.bind(this, false));
			this._privateDispatcher.registerMethod("", "__quit", this._quitCommand.bind(this));
			this._privateDispatcher.registerMethod("", "__gc", this._gcCommand.bind(this));
			this._privateDispatcher.setCancelHandler(this._subscriptionCancelHandler.bind(this));
		}
		// If we have a public dispatcher, add the __info and cancel support
		if (this._publicDispatcher)
		{
			this._publicDispatcher.registerMethod("", "__info", this._infoCommand.bind(this, true));
			this._publicDispatcher.registerMethod("", "__quit", this._quitCommand.bind(this));
			this._publicDispatcher.registerMethod("", "__gc", this._gcCommand.bind(this));
			this._publicDispatcher.setCancelHandler(this._subscriptionCancelHandler.bind(this));
		}
	},
	
	/*
	 * Dispatches a message to the relevant command controller/assistant
	 */
	_dispatchCommand: function(isPublic, command, message)
	{
		console.log("_dispatchCommand");
		var cc = new CommandController(this, command, isPublic, message);
		// If we have a setup future then we wait until it's done, then dispatch our command.
		// We keep setting the result of the future to release any other waiting.
		if (this._setupFuture)
		{
			this._setupFuture.then(function(future)
			{
				future.getResult();
				future.result = true;
				cc.run();
			});
		}
		else
		{
			cc.run();
		}
	},
	
	/*
	 * 	All service support an __info method which describes the service itself to the caller
	 */
	_infoCommand: function(isPublic, message)
	{
		var aconfig = this.application.config;
		var appconfig = { description: aconfig.description };
		var service = Foundations.ObjectUtils.clone(this.config);
		var commands = service.commands;
		var schemas = {};
		for (var i = 0; i < commands.length; )
		{
			var cmd = commands[i];
			// Extract any schemas we reference
			for (var schema in { argsSchema: null, returnSchema: null, watchSchema: null, subscribeSchema: null })
			{
				if (typeof cmd[schema] === "string")
				{
					schemas[cmd[schema]] = aconfig.schemas[cmd[schema]];
				}
			}
			if (isPublic && !cmd.public)
			{
				commands.splice(i, 1);
			}
			else
			{
				i++;
			}
		}
		appconfig.services = [ service ];
		for (var k in schemas)
		{
			appconfig.schemas = schemas;
			break;
		}
		message.respond(JSON.stringify(
		{
			returnValue: true, 
			info: appconfig
		}));
	},

	/*
	 * 	All services support a __quit method which causes the service to quit
	 */
	_quitCommand: function(message)
	{
		var app = this.application;
		// make sure to respond before we tear down the connection
		message.respond(JSON.stringify(
		{
			returnValue: true
		}));
		// This will cancel any existing timeout, or set one, if there isn't one
		ActivityManager.setTimeout(100, 
			function() {
				app.shutdown(true);
			}
		);
	},

	_gcCommand: function(message)
	{
		var app = this.application;
		var rsp;
		// make sure to respond before we tear down the connection
		if (global.gc) {
			rsp = {
				status: "Collecting garbage",
				returnValue: true
			};
		} else {
			rsp = {
				errorText: "GC not enabled",
				returnValue: false
			};
		}
		message.respond(JSON.stringify(rsp));
		if (global.gc) {
			global.gc();
		}
	},

	/*
	 * Default command runner
	 */
	runCommand: function(command)
	{
		var assistant = command.assistant;
		// If we have a watch, we call the command.run and pass it both the future (for the immediate response)
		// and the 'watch future' for the later watch callback.
		if (command.watch)
		{
			return command.future.now(function()
			{
				assistant.run(command.future, command.watch);
			});
		}
		// If we have a subscribe, we call the command.run and pass it both the future (for the immediate reponse)
		// and the 'subscribe future factory' which we use to 'get' futures for subsequent replies.
		else if (command.subscribe)
		{
			return command.future.now(function()
			{
				assistant.run(command.future, command.subscribe);
			});
		}
		// The simple case, we have no watch, so we just call the command.run.
		else
		{
			return command.future.now(assistant, assistant.run);
		}
	},
	
	/*
	 * Default command assistant creator.  Creates an assistant
	 * from the global scope using an assistant name.
	 */
	createCommandAssistant: function(command)
	{
		var assistant = root[command.assistant];
		return assistant ? new assistant() : undefined;
	},
	
	subscribeCommand: function(key, command)
	{
		if (command.isPublic) {
			this._publicDispatcher.subscriptionAdd(key, command.message);
		} else {
			this._privateDispatcher.subscriptionAdd(key, command.message);
		}
		this._subscriptions[key] = command;
	},
	
	unsubscribeCommand: function(key)
	{
		this._subscriptions[key]=undefined;
	},
	
	/*
	 * Subscription cancel handler is called when a subscription is cancelled.  We need to terminate the command
	 * associated with it and make sure any activities are released.
	 */
	_subscriptionCancelHandler: function(message)
	{
		var command = this._subscriptions[message.uniqueToken()];
		if (command) {
			command.cancelSubscription();
		}
	},
	
	/** 
	* ServiceController.publicHandle() -> webOS.Handle
	* Returns the service's registered handle on the public bus, if any
	**/
	publicHandle: function() {
		return this._publicDispatcher.getHandle();
	},
	
	/** 
	* ServiceController.privateHandle() -> webOS.Handle
	* Returns the service's registered handle on the private bus, if any
	**/
	privateHandle: function() {
		return this._privateDispatcher.getHandle();
	}
});
