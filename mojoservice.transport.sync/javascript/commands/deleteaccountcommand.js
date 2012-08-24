/*global Class, exports, Future, Transport */

exports.DeleteAccountCommand = Class.create(Transport.Command,
{
	run: function(result)
	{
		var future = new Future(true);
		result.nest(future.then(this,
		[
			function()
			{				
				if (this.client.syncStatusMgr) {
					return this.client.syncStatusMgr.setDeleteStatus();
				}
				return new Future(true);
			},
			function()
			{
				future.getResult();
				return this.handler.deleteAccount();
			},
			function()
			{
				future.getResult();
				if (this.client.syncStatusMgr) {
					return this.client.syncStatusMgr.clearDeleteStatus();
				}
				return new Future(true);
			},
			function() {
				future.result = {};
			}
		]));
	}
});