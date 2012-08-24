exports.CreateAccountCommand = Class.create(Transport.Command,
{
	run: function(result)
	{
		var future = new Future(true);
		result.nest(future.then(this,
		[
			function()
			{
				return this.handler.createAccount();
			},
			function()
			{
				// Confirm account was created
				future.result = {};
			}
		]));
	}
});
