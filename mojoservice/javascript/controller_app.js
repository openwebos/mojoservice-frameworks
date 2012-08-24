/*global exports, console, Class, Json, ActivityManager, root, quit, ServiceController, palmGetResource*/
exports.AppController = Class.create({
	initialize: function(commandLineArguments, assistants) {
		if (!commandLineArguments) {
			commandLineArguments = [];
		}
		if (!assistants) {
		    assistants = root;
		}
		this.assistants = assistants; 
		this.parseArguments(commandLineArguments);
		// Creat the app assistant
		this.assistant = this._createAppAssistant();
		this.assistant.controller = this;
		try {
			this.config = (this.assistant.getConfiguration || this._readConfiguration)();
		} 
		catch(e) {
			console.error("MojoService: error during AppController configuration: "+e);
			throw(e);
		}
		if (!this.config)
		{
			throw new Error("No configuration information - missing services.json?");
		}
		if (!this.config.services)
		{
			throw new Error("No services defined in configuration");
		}
		this._configSchema = JSON.parse(Foundations.Comms.loadFile(MojoLoader.root+"/schema/services-schema.json"));
		var v = Json.Schema.validate(this.config, this._configSchema);
		if (!v.valid) {
			console.error("Service configuration failed validation");
			for (var i=0; i < v.errors.length; i++) {
				var error = v.errors[i];
				console.error(error.property+' : '+error.message);
			}
			throw new Error("configuration failed validation");
		}
		// Get request factory
		try {
			this.serviceFactory = this.assistant.createServiceAssistant ? this.assistant : this;
		}
		catch(e)
		{
			console.error("MojoService: error during serviceFactory creation: "+e);
			throw(e);
		}
		
		// Finish setup
		if (this.assistant.setup) {
			try
			{
				//console.log(">>>Running AppAssistant setup");
				this.assistant.setup();
			}
			catch (e)
			{
				console.error("MojoService: error during assistant setup: "+e);
				throw(e);
			}
		}
		
		// Get the timeout from the assistant, the config, or use the default.
		this._timeout = this.assistant.commandTimeout || this.config.commandTimeout || this._defaultCommandTimeout;
		
		this._bindServices(this.config.services);
		
		// Configure the activity manager timeout - this is how long the service remains running after
		// all activity has ceased
		var self = this;
		var timeoutInSeconds = this.assistant.activityTimeout || this.config.activityTimeout || this._defaultActivityTimeout;
		ActivityManager.setTimeout(timeoutInSeconds * 1000,
			// Shutdown and quit - we dont do the quit in the shutdown method (largely for unit testing purposes)
			function()
			{
				console.log("MojoService: activityTimeout triggered");
				if (self.timeoutsEnabled) {
					self.shutdown(true);
				} else {
					console.error("timeouts disabled, doing nothing");
				}
			});
	},
	
	parseArguments: function(commandLineArguments) {
		for(var i = 0; i < commandLineArguments.length; ++i) {
			if (commandLineArguments[i] === "--disable-timeouts") {
				console.warn("Idle and command timeouts disabled by command line option.");
				this.timeoutsEnabled = false;
			}
		}
	},
	
	shutdown: function(andQuit) {
		this._services.forEach(function(service) 
		{
			service.cleanup();
		});
		if (this.assistant.cleanup) {
			try
			{
				this.assistant.cleanup();
			}
			catch(e)
			{
				console.error("MojoService: error during assistant cleanup: "+e);
				//throw(e);
			}
		}
		if (andQuit) {
			console.log("MojoService: quitting");
			if (typeof quit === "function") {
    			quit();			    
			} else {
			    root.process.exit();
			}
		}
	},
	
	_createAppAssistant: function(commandLineArguments) {
		return this.assistants.AppAssistant ? new this.assistants.AppAssistant(commandLineArguments) : {};
	},
	
	_bindServices: function(services)
	{
		this._services = [];
		var self = this;
		var names_so_far={};
		services.forEach(function(service)
		{
			if (names_so_far[service.name] === undefined) {
				self._services.push(new ServiceController(self, service));
				names_so_far[service.name] = true;
			} else {
				throw new Error('Config error: Two services named "'+service.name+'"');
			}
		});
	},

	_readConfiguration: function()
	{
		try
		{
			return JSON.parse(Foundations.Comms.loadFile("services.json"));
		}
		catch (e)
		{
			console.error("MojoService: error reading AppController configuration: "+e);
			return undefined;
		}
	},
	
	_defaultActivityTimeout: 5, // 5 seconds
	_defaultCommandTimeout: 60, // 60 seconds
	timeoutsEnabled: true, // set to false when running in the debugger
	
	createServiceAssistant: function(service)
	{
		return service.assistant ? new this.assistants[service.assistant]() : {};
	}
		
});