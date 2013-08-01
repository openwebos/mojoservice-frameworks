var MojoLoader=require('mojoloader.js');
// note that these error codes mirror those defined in Accounts.ui
// we should consolidate them at some point...
/*jslint immed:false, laxbreak:true */
/*global exports */

(function() {
	function TransportError (msg) {
		this.errorText = msg || "";
	}

	TransportError.prototype.errorCode = "UNKNOWN";

	TransportError.prototype.toString = function toString() {
		return "Error: " + this.errorCode + " - " + this.errorText;
	};

	var CODES =
	{	Authentication		: "401_UNAUTHORIZED"
	,	BadRequest			: "400_BAD_REQUEST"
	,	Duplicate			: "DUPLICATE_ACCOUNT"
	,	NoConnectivity		: "NO_CONNECTIVITY"
	,	Server				: "500_SERVER_ERROR"
	,	Timeout				: "408_TIMEOUT"
	,	Unavailable			: "503_SERVICE_UNAVAILABLE"
	,	NoCredentials		: "CREDENTIALS_NOT_FOUND"
	,	CommandTimeout		: "COMMAND_TIMEOUT"
	,	TimestampRefused	: "TIMESTAMP_REFUSED"
	,	AccountRestricted 	: "ACCOUNT_RESTRICTED"
	};

	function newErrorClass() {
		return function(){ TransportError.apply (this, arguments); };
	}

	var clas$;
	for (var type in CODES) {
		if (CODES.hasOwnProperty (type)) {
			clas$						= newErrorClass();			// Create new error type. 
			clas$.prototype				= new TransportError();		// Extend base TransportError type.
			clas$.prototype.errorCode	= CODES [type];				// Set errorCode for all instances.
			exports [type + "Error"]	= clas$;					// Publish new error type.
		}
	}
	exports.TransportError = TransportError;	// Publish the base TransportError type to allow instanceof on error subtypes.
})();

/* Open webOS MojoService Framework | Copyright 2009-2012 Hewlett-Packard Development Company, L.P. | openwebosproject.org | openwebosproject.org/license */
var libs = MojoLoader.require(
{ name: "foundations", version: "1.0" }, 
{ name: "mojoservice", version: "1.0" },
{ name: "underscore", version: "1.0"} 
);
var Foundations = libs["foundations"];
var MojoService = libs["mojoservice"];
var Underscore = libs["underscore"];

// Propogate
exports.AppController = MojoService.AppController;

var Class = Foundations.Class;
var Future = Foundations.Control.Future;
var Queue = Foundations.Control.Queue;
var AjaxCall = Foundations.Comms.AjaxCall;
var PalmCall = Foundations.Comms.PalmCall;
var DB = Foundations.Data.DB;
var TempDB = Foundations.Data.TempDB;
var Activity = Foundations.Control.Activity;
var _ = Underscore._;

/*global Class, Foundations, MojoService, exports, Priority, Queue, console */

/* A client is a state machine which manages a queue of commands.
 * This class maintains the queue of pending and active command as well
 * as the state of the state machine.  The actual state machine is held by
 * the assistant, which this class delegates to.
 */
var Client = exports.Client = Class.create(
{
	setup: function(service, clientId, connectionFactory, handlerFactory)
	{
		this.service = service;
		this.clientId = clientId;
		if (!this._pendingCommands) {
			this._pendingCommands = [];
		}
		this._activeCommands = [];
		
		// Link the connectionFactory and handlerFactory to the client.
		this.connectionFactory = connectionFactory;
		if (connectionFactory)
		{
			connectionFactory.client = this;
		}
		this.handlerFactory = handlerFactory;
		if (handlerFactory)
		{
			handlerFactory.client = this;
		}
		
		// Start the state machine
		new Foundations.Control.FSM(this);
	},
	
	cleanup: function()
	{
		this.event("__terminate");
	},
	
	/*
	 * Create a new command instance with the given configuration and arguments.
	 */
	createCommand: function(config, args)
	{
		return (new MojoService.CommandController(this.service.controller, config, false, null, args)).assistant;
	},
	
	/*
	 * Run a command.
	 * We try to dispatch the command directly to the client, but if we cant we just queue it
	 */
	runCommand: function(prio, command)
	{
		command.client = this;
		// Setup the complete handler for when the command has finished
		command.controller.future.then(this, function()
		{
			this.commandComplete(command);
		});
		if (!(this.event(command.controller.config.name, command) || this.event("__any", command)))
		{
			this.queueCommand(prio, command);
		}
	},
	
	/*
	 * Queue a command on the pending queue.
	 */
	queueCommand: function(prio, command)
	{
		console.log("Q: ", prio, command.controller.config.name);
		switch (prio || Priority.NORMAL)
		{
			case Priority.NORMAL:
			default:
				this._pendingCommands.push(command);
				break;
				
			case Priority.IMMEDIATE:
				this._pendingCommands.unshift(command);
				break;
		}
	},
	
	/*
	 * Requeue a command on the pending queue.  Return true if we
	 * succeeded, otherwise false if the command isnt on the queue.
	 */
	requeueCommand: function(prio, command)
	{
		for (var i = this._pendingCommands.length - 1; i >= 0; i--)
		{
			if (this._pendingCommands[i] === command)
			{
				this._pendingCommands.splice(i, 1);
				this.queueCommand(prio, command);
				return true;
			}
		}
		return false;
	},
	
	/*
	 * Dispatch the next pending command.
	 */
	dispatchCommand: function()
	{
		var command = this._pendingCommands.shift();
		console.log("UQ", command ? command.controller.config.name : "<none>");
		if (command)
		{
			this.event(command.controller.config.name, command);
			return true;
		}
		else
		{
			return false;
		}
	},
	
	/*
	 * Add an command to the active list.
	 */
	activateCommand: function(command)
	{
		if (this.connectionFactory)
		{
			command.connection = this.connectionFactory.getConnection(command);
			if (!command.connection)
			{
				throw new Error("Failed to create connection for command");
			}
		}
		if (this.handlerFactory)
		{
			command.handler = this.handlerFactory.getHandler(command);
			if (!command.handler)
			{
				throw new Error("Failed to create handler for command");
			}
		}
		this._activeCommands.push(command);
		
		Queue.current.defer(this, function()
		{
			command.run(command.controller.future);
		});
	},
	
	/*
	 * Complete a command and remove it from the active command list.
	 */
	commandComplete: function(command)
	{
		console.log("client:commandComplete", this._activeCommands.length);
		var q = this._activeCommands;
		var len = q.length;
		for (var i = 0; i < len; i++)
		{
			if (q[i] === command)
			{
				console.log("completing command");
				q.splice(i, 1);
				this.event("__commandComplete", command);

				//FIXME: This work really needs to be refactored into a nested-future kind of structure. 
				//This workaround should be removed at that point.
				console.log("client.commandComplete: calling command.controller.cleanup() after 1 second");
				setTimeout(function() {
					console.log("cleaning up "+(command.name||"command"));
					command.controller.cleanup();
				}, 1000);

				command.controller.future.result = command.controller.future.result;
				
				// If we have a watch and we've not notified it, notify it
				if (command.controller.watch && command.controller.watch.status() == "none")
				{
					command.controller.watch.result = { completed: true };
				}
				
				
				break;
			}
		}
		if (i == len)
		{
			throw new Error("Attempted to complete a command which was not active");
		}
	},
	
	cancelAllCommands: function()
	{
		function abort(q)
		{
			var len = q.length;
			for (var i = 0; i < len; i++)
			{
				q[i].cancel();
			}
		}
		abort(this._pendingCommands);
		abort(this._activeCommands);
		
		this._pendingCommands = [];
		this._activeCommands = [];
	}
});

var Command = exports.Command = Class.create(
{
	/*
	 * Run the command - by default just return a dummy result
	 */
	run: function(future)
	{
		future.result = {};
	},
	
	/*
	 * Handle events which may change the command.
	 */
	stateChange: function(event)
	{
		if (event == Activity.Event.focused)
		{
			this.client.requeueCommand(Priority.IMMEDIATE, this);
		}
		else if (event == Activity.Event.unfocused)
		{
			this.client.requeueCommand(Priority.BACKGROUND, this);
		}
		else if (event == Activity.Event.cancel)
		{
			this.cancel();
		}
	},
	
	/*
	 * Abort the command.
	 */
	cancel: function()
	{
		this.connection && this.connection.cancel();
		this.handler && this.handler.cancel();
	},
})

var Connection = exports.Connection = Class.create(
{
	cancel: function()
	{
	},
});

var Handler = exports.Handler = Class.create(
{
	initialize: function(command)
	{
		this.command = command;
	},
	
	done: function()
	{
	},
});

var Priority = exports.Priority =
{
	IMMEDIATE: "immediate",
	NORMAL: "normal",
	BACKGROUND: "background",
};

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

exports.ConnectionFactoryBuilder = function(connectionClazz)
{
	return (
	{
		getConnection: function(command)
		{
			return new connectionClazz();
		}
	});
}

var HttpConnection = exports.HttpConnection = Class.create(Connection,
{
	setURL: function(url)
	{
		this._url = url;
	},
	
	setMethod: function(method)
	{
		this._method = method;
	},
	
	setBody: function(body)
	{
		this._body = body;
	},
	
	setOptions: function(options)
	{
		var that = this;
		if (!this._options)
		{
			this._options = {};
		}
		if (options) {
			Object.keys(options).forEach(function (optionName) {
				that._options[optionName] = options[optionName];
			});
		}
	},
	
	setRequestHeaders: function(headers)
	{
		if (!this._requestheaders)
		{
			this._requestheaders = {};
		}
		for (var k in headers)
		{
			this._requestheaders[k] = headers[k];
		}
	},
	
	connect: function()
	{
		var options = this._options || {};
		var headers = this._requestheaders;
		if (headers) {
			if (!options.headers) {
				options.headers = {};
			}
			Object.keys(headers).forEach(function (requestHeaderName) {
				var header = headers[requestHeaderName];
				//console.log("Setting header "+requestHeaderName+" : "+header);
				options.headers[requestHeaderName] = header;
			});
		}
		
		return AjaxCall.call(this._method, this._url, this._body, options);
	},
	
	recycle: function()
	{
		delete this._url;
		delete this._method;
		delete this._body;
		delete this._options;
		delete this._requestheaders;
	}
});

var HttpOAuthConnection = exports.HttpOAuthConnection = Class.create(HttpConnection,
{
	initialize: function(accessor)
	{
		this.accessor = accessor;
	},
	
	setForm: function(form)
	{
		this._form = form;
	},
	
	connect: function connect()
	{
		var message =
		{
			action: this._url,
			method: this._method,
			parameters: this._form ? this._form : this._body ? OAuth.decodeForm(this._body) : []
		};
		OAuth.completeRequest(message, this.accessor);
		this.setBody(OAuth.formEncode(message.parameters));
		return this.$super(connect)().then(this, function(future)
		{
			var response = future.result;
			try
			{
				response.responseMap = OAuth.getParameterMap(response.responseText);
			}
			catch (_)
			{
				// Not something parseable as an OAuth parameter map
			}
			future.result = response;
		});
	},
});

var OAuth;

exports.HttpOAuthConnectionFactoryBuilder = function(accessor)
{
	// Load the OAuth support on first use
	if (!OAuth)
	{
		OAuth = MojoLoader.require({ name: "foundations.crypto", version: "1.0" })["foundations.crypto"].OAuth;
	}
 	return (
	{
		getConnection: function(command)
		{
			return new HttpOAuthConnection(accessor);
		}
	});
}
exports.HandlerFactoryBuilder = function(handlerClazz)
{
	return (
	{
		getHandler: function(command)
		{
			return new handlerClazz(command);
		}
	});
}
/*global DB, exports, Class, Handler */
var DbHandler = exports.DbHandler = Class.create(Handler,
{
	get: function(ids)
	{
		return DB.get(ids).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	put: function(objects)
	{
		return DB.put(objects).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	merge: function(objects)
	{
		return DB.merge(objects).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	find: function(query)
	{
		return DB.find(query).then(function(future) {
			var result = future.result.results;
			if (future.result.count) {
			  result.count = future.result.count;
			}
			if (future.result.next) {
				result.next = future.result.next;
			}
			future.result=result;
		});
	},
	
	del: function(idsOrQuery, purge)
	{
		return DB.del(idsOrQuery, purge).then(function(future) {
			//console.log("deleted..."+JSON.stringify(idsOrQuery));
			var result;
			if (future.result.results) {
				result = future.result.results.length;
			} else {
				result = future.result.count;
			}
			future.result=result;
		});
	},
	
	reserveIds: function(count)
	{
		return DB.reserveIds(count).then(function(future) {
		  future.result = future.result.ids;
		});
	},
	
	putKind: function(id, owner, indexes)
	{
		return DB.putKind(id, owner, indexes).then(function(future) {
		  future.result = (future.result.returnValue===true);
		});
	},
	
	delKind: function(id)
	{
		return DB.delKind(id).then(function(future) {
		  future.result = (future.result.returnValue===true);
		});
	}
});

exports.OAuthCommand = new Class.create(Command,
{
	requestToken: function(method, url, params)
	{
		var connection = this.connection;
		connection.recycle();
		connection.setURL(url);
		connection.setMethod(method);
		connection.setForm(params || {});
		return connection.connect().then(this, function(future)
		{
			var response = future.result;
			connection.accessor.token = response.responseMap.oauth_token;
			connection.accessor.tokenSecret = response.responseMap.oauth_token_secret;
			future.result = response;
		});
	}
});

/*global Class, console, exports, Priority, SyncStatusManager */

exports.ServiceAssistantBuilder = function(config)
{
	var clientId = config.clientId;
	
	return Class.create(
	{
		_clients: {},
		
		setup: config.setup,
	
		runCommand: function(command)
		{
			var id = clientId ? command.args[clientId] || 0 : 0;
			var client = this._clients[id];
			var needsAuthentication = command.config.requiresAuthentication !== false; // true or undefined 
			var capabilityProviderId;

			if (!client || (!client.credentials && needsAuthentication))
			{
				var savedCommands;
				if (client && client._pendingCommands && client._pendingCommands.length > 0) {
					console.log("mojoservice.transport: preserving queued commands");
					savedCommands=client._pendingCommands;
				}
				client = new config.client();
				if (savedCommands) {
					client._pendingCommands=savedCommands;
				}
				this._clients[id] = client;
				client._future = client.setup(this, id, command.config, command.args);
			}

			if (!client.syncStatusMgr) {
				if (client.getCapabilityProviderId) {
					capabilityProviderId = client.getCapabilityProviderId();
				}
				else if (command && command.assistant && command.assistant.getCapabilityProviderId) {
					capabilityProviderId = command.assistant.getCapabilityProviderId();
				}
		
				if (capabilityProviderId) {
					client.syncStatusMgr = new SyncStatusManager(id, capabilityProviderId, this.controller.name);
				}
			}

			if (client._future)
			{
				client._future.then(this, function(future)
				{
					try
					{
						client._future = undefined;
						future.result = true;
						this._dispatchCommand(client, command);
					}
					catch (e)
					{
						// Failed to startup client - error the command
						delete this._clients[id];
						command.future.now(this, function()
						{
							
							if (e instanceof exports.TransportError) {
								if (client.syncStatusMgr) {
								// Clear all previous statuses for this account before setting the error.
								// This will clear all previous statuses for all collections under the same 
								// account.  Until now, we do not find any problem with this forceful cleanup. 
									client.syncStatusMgr.clearSyncStatus().then(this, function (join) {
										join.getResult();
                                        client.syncStatusMgr.setErrorCondition(e);
									});							
								}
								else {
									console.error("Error occurred during client startup, but couldn't disable sync status");
								}
							} 
							throw new Error("Client startup failure: " + e.toString());
						});
					}
				});
			}
			else
			{
				this._dispatchCommand(client, command);
			}
			return command.future;
		},
			
		_dispatchCommand: function(client, command)
		{
			command.future.now(function()
			{
				// Dispatch command into relevant client queue. This will be processed 
				client.runCommand(Priority.NORMAL, command.assistant);
			});
		},
		
		cleanup: function()
		{
			// Cancel any pending commands.  There really shouldn't be any (we should only shutdown
			// if the command queue is empty) but just in case ...
			for (var k in this._clients)
			{
				this._clients[k].cancelAllCommands();
			}
		}
	});
};


