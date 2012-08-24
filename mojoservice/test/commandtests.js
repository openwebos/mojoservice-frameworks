/*global include: false, CommandTests: true, state: true, shutdown: true, Class: false, root: false, exports: true, Foundations: false, MojoTest: false */

include("test/loadall.js");

var state;
var shutdown;

var CommandTests = Class.create(
{
	testCommand1: function(report)
	{
		root.AppAssistant = Class.create(
		{
			getConfiguration: function()
			{
				return { 
					services: 
					[
						{
							name: "com.palm.test.servicecommand1",
							commands:
							[
								{
									name: "sub",
									assistant: "CommandAssistant"
								}
							]
						}
					] 
				};
			}
		});
		root.CommandAssistant = Class.create(
		{
			run: function(future, watch)
			{
				future.now(function(f)
				{
					f.result = { reply: "okay" };
				});
			}
		});
		var app = new exports.AppController();
		MojoTest.require(app !== undefined);
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.servicecommand1/", "sub", {})
			.then(function(future)
			{
				report(future.result.reply === "okay" ? MojoTest.passed : "Wrong reply: got " + Object.toJSON(future.result));
			}
		);
	},
	
	testCommand2: function(report)
	{
		root.AppAssistant = Class.create(
		{
			getConfiguration: function()
			{
				return { 
					services: 
					[
						{
							name: "com.palm.test.servicecommand2",
							commands:
							[
								{
									name: "sub",
									assistant: "CommandAssistant"
								}
							]
						}
					] 
				};
			}
		});
		root.CommandAssistant = Class.create(
		{
			run: function(future, watch)
			{
				future.now(function(f)
				{
					f.result = { reply: ["okay"] };
				});
			}
		});
		var app = new exports.AppController();
		MojoTest.require(app !== undefined);
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.servicecommand2/", "sub", {})
			.then(function(future)
			{
				report(future.result.reply[0] === "okay" ? MojoTest.passed : "Wrong reply: got " + Object.toJSON(future.result));
			}
		);
	},

	testServicePrivateHandle: function(report)
	{
		root.AppAssistant = Class.create(
		{
			getConfiguration: function()
			{
				return { 
					services: 
					[
						{
							name: "com.palm.test.servicecommand3",
							commands:
							[
								{
									name: "sub",
									assistant: "CommandAssistant"
								}
							]
						}
					] 
				};
			}
		});
		root.CommandAssistant = Class.create(
		{
			run: function(future, watch)
			{
				var self = this;
				future.now(function(f)
				{
					f.result = { reply: ("" + self.controller.service.privateHandle()) };
				});
			}
		});
		var app = new exports.AppController();
		MojoTest.require(app !== undefined);
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.servicecommand3/", "sub", {})
			.then(function(future)
			{
				report(future.result.reply === "[object Object]" ? MojoTest.passed : "Wrong reply: got " + Object.toJSON(future.result));
			}
		);
	}
});

