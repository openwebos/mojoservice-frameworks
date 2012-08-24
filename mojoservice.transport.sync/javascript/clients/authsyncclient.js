/*global exports, console, Transport, Class */
exports.AuthSyncClient = Class.create(Transport.Client,
{
	__start:
	{
		__enter: function()
		{
			return "restart";
		}
	},
	
	restart:
	{
		__enter: function()
		{
			// Load the account transport object
			this.handlerFactory.getHandler(undefined).getAccountTransportObject(this.clientId).then(this, function(future)
			{
				this.event("gotReply", future);
			});
		},
		
		gotReply: function(future)
		{
				this.transport = future.result;
			if (!this.transport) {
				console.info("MojoService.AuthSyncClient(restart): no transport object");
				// If we fail to get the transport, we leave it unset.
				// This will only happen if we've not yet created it, and the currently executing command will
				// be onCreate
			}
			return "unauthorized";
		}
	},
	
	unauthorized:
	{
		__enter: function()
		{
			this.dispatchCommand();
		},
		
		__any: function(command)
		{
			this.queueCommand(Transport.Priority.NORMAL, command);
			
			// If we support authorization, then issue the authenticate command
			if (this.getAuthenticateCommandDescription)
			{
				this.runCommand(Transport.Priority.IMMEDIATE, this.createCommand(this.getAuthenticateCommandDescription(), command));
			}
			// Otherwise we always authorizaed
			else
			{
				return "authorized";
			}
		},
		
		authenticate: function(command)
		{
			console.log("authenticate");
			this.activateCommand(command);
			return "inAuthorize";
		}
	},
	
	inAuthorize:
	{
		__commandComplete: function(cmd)
		{
			console.log("__commandComplete", cmd.name);
			try
			{
				cmd.controller.future.result;
				return "authorized";
			}
			catch (e)
			{
				console.warn("MojoService.AuthSyncClient(inAuthorize): error thrown"+e);
			}
			return "restart";
		}
	},
	
	authorized:
	{
		__enter: function()
		{
			this.dispatchCommand();
		},
		
		checkCredentials: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForComplete";
		},
		
		sync: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForComplete";
		},
		
		__any: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForComplete";
		},
		
		onCreate: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForCreateComplete";
		},
		
		onEnabled: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForEnabledComplete";
		},
		
		onDelete: function(cmd)
		{
			this.activateCommand(cmd);
			return "waitForComplete";
		}
	},
	
	waitForComplete:
	{
		__commandComplete: function(cmd)
		{
			console.log("authsyncclient waitForComplete command: ");
			
			try
			{
				cmd.controller.future.result;
				return "authorized";
			}
			catch (e)
			{
				console.warn("MojoService.AuthSyncClient(waitForComplete): error thrown: "+e);
			}
			return "restart";
		}
	},

	waitForCreateComplete:
	{
		__commandComplete: function(cmd)
		{
			console.log("authsyncclient waitForCreateComplete command: ");
			return "restart";
		}
	},

	waitForEnabledComplete:
	{
		__commandComplete: function(cmd)
		{
			console.log("authsyncclient waitForEnabledComplete command: ");
			return "restart";
		}
	},
	
	inResource:
	{
		__commandComplete: function(cmd)
		{
			console.log("authsyncclient inResource command: ");
			return "authorized";
		}
	}
});
