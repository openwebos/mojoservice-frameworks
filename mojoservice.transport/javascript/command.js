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
