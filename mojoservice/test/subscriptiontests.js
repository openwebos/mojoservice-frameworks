include("test/loadall.js");

var state;
var shutdown;
var app;

var SubscriptionTests = Class.create(
{
	testSubscription1: function(report)
	{
		var want = "12";
		root.AppAssistant = Class.create(
		{
			getConfiguration: function()
			{
				return { 
					services: 
					[
						{
							name: "com.palm.test.service",
							commands:
							[
								{
									name: "sub",
									assistant: "CommandAssistant",
									subscribe: true
								}
							]
						}
					] 
				};
			}
		});
		root.CommandAssistant = Class.create(
		{
			run: function(future, subscription)
			{
				future.now(function(f)
				{
					f.result = { reply: 1 };
				});
				subscription && subscription.get().now(function(f)
				{
					f.result = { reply : 2 };
				});
			},

			cleanup: function()
			{
				shutdown += "C";
			}
		});
		app = new exports.AppController();
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.service/", "sub", { subscribe: true })
			.then(function(future)
			{
				state += future.result.reply;
			})
			.then(function(future)
			{
				state += future.result.reply;
				future.result = null;
			})
			.then(function(future)
			{
				state += shutdown;
				report(state === want ? MojoTest.passed : "Wrong state: want " + want + " got " + state);
			}
		);
	},
	
	testSubscription2: function(report)
	{
		var want = "1C";
		//var app = new exports.AppController();
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.service/", "sub", { subscribe: true })
			.then(function(future)
			{
				state += future.result.reply;
				Foundations.Comms.PalmCall.cancel(future);
				setTimeout(function()
				{
					future.result = null;
				}, 0.2);
			})
			.then(function(future)
			{
				state += shutdown;
				report(state === want ? MojoTest.passed : "Wrong state: want " + want + " got " + state);
			}
		);
	},
	
	testSubscription3: function(report)
	{
		var want = "1C";
		//var app = new exports.AppController(); - still launched from last time
		
		state = "";
		shutdown = "";
		Foundations.Comms.PalmCall.call("palm://com.palm.test.service/", "sub", {})
			.then(function(future)
			{
				state += future.result.reply;
				setTimeout(function()
				{
					future.result = null;
				}, 0.2);
			})
			.then(function(future)
			{
				state += shutdown;
				report(state === want ? MojoTest.passed : "Wrong state: want " + want + " got " + state);
			}
		);
	}
});
SubscriptionTests.timeoutInterval = 4000;
