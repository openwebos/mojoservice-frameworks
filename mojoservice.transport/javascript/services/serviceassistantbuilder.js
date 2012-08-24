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
