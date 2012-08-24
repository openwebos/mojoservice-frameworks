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
