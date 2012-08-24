/*global include, Class, root, exports, MojoTest, Foundations */
include("test/loadall.js");

var state;

var AppAssistantTests = Class.create(
{
	testApp1Lifecyle: function()
	{
		state = "";
		root.AppAssistant = Class.create(
		{
			setup: function()
			{
				state += ":setup";
			},

			cleanup: function()
			{
				state += ":cleanup";
			},

			getConfiguration: function()
			{
				state += ":getconfig";
				var config = { 
					services: [
					{
						name: "com.palm.test.lifecycle1",
						commands:
						[
							{
								name: "test1",
								assistant: "CommandAssistant1"
							}
						]
					}
					]
				};
				return config;
			}
		});
		var app = new exports.AppController();
		app.shutdown(false); //but don't quit
		
		return state === ":getconfig:setup:cleanup" ? MojoTest.passed : "Lifecyle failed " + state;
	},
	
	testApp2Lifecycle: function(report)
	{
		state = "";
		root.AppAssistant = Class.create(
		{
			setup: function()
			{
				state += ":asetup";
			},

			cleanup: function()
			{
				state += ":acleanup";
			},
			
			getConfiguration: function()
			{
				state += ":getconfig";
				return { 
					services: 
					[
						{
							name: "com.palm.test.lifecycle2",
							assistant: "ServiceAssistant",
							commands:
							[
							{
								name: "test1",
								assistant: "CommandAssistant1"
							}
							]
						}
					] 
				};
			}
		});
		root.ServiceAssistant = Class.create(
		{
			setup: function()
			{
				state += ":ssetup";
			},

			cleanup: function()
			{
				state += ":scleanup";
			}
		});
		app = new exports.AppController();
		app.shutdown(false); //but don't quit
		
		return state === ":getconfig:asetup:ssetup:scleanup:acleanup" ? MojoTest.passed : "Lifecyle failed " + state;
	},
	
	testApp3Lifecycle: function(report)
	{
		state = "";
		root.AppAssistant = Class.create(
		{
			setup: function()
			{
				state += ":asetup";
			},

			cleanup: function()
			{
				state += ":acleanup";
			},
			
			getConfiguration: function()
			{
				state += ":getconfig";
				return { 
					services: 
					[
						{
							name: "com.palm.test.lifecycle3",
							assistant: "ServiceAssistant",
							commands:
							[
								{
									name: "command",
									assistant: "CommandAssistant"
								}
							]
						}
					] 
				};
			}
		});
		root.ServiceAssistant = Class.create(
		{
			setup: function()
			{
				state += ":ssetup";
			},

			cleanup: function()
			{
				state += ":scleanup";
			}
		});
		root.CommandAssistant = Class.create(
		{
			setup: function()
			{
				state += ":csetup";
			},

			cleanup: function()
			{
				state += ":ccleanup";
			}
		});
		app = new exports.AppController();
		app.shutdown(false); //but don't quit
		
		return state === ":getconfig:asetup:ssetup:scleanup:acleanup" ? MojoTest.passed : "Lifecyle failed " + state;
	},

	testApp4Lifecycle: function(report)
	{
		state = "";
		root.AppAssistant = Class.create(
		{
			setup: function()
			{
				state += ":asetup";
			},

			cleanup: function()
			{
				state += ":acleanup";
			},

			getConfiguration: function()
			{
				state += ":getconfig";
				return { 
					services: 
					[
						{
							name: "com.palm.test.lifecycle4",
							assistant: "ServiceAssistant",
							commands:
							[
								{
									name: "command",
									assistant: "CommandAssistant"
								}
							]
						}
					] 
				};
			}
		});
		root.ServiceAssistant = Class.create(
		{
			setup: function()
			{
				state += ":ssetup";
				return new Foundations.Control.Future().now(function(future)
				{
					future.result = null;
				});
			},

			cleanup: function()
			{
				state += ":scleanup";
			}
		});
		root.CommandAssistant = Class.create(
		{
			setup: function()
			{
				state += ":csetup";
			},

			cleanup: function()
			{
				state += ":ccleanup";
			},
			
			run: function(future)
			{
				state += ":crun";
				future.result = {};
			}
		});
		app = new exports.AppController();
		Foundations.Comms.PalmCall.call("palm://com.palm.test.lifecycle4/", "command", {}).then(function()
		{
			app.shutdown(false); //but don't quit
			report(state === ":getconfig:asetup:ssetup:csetup:crun:ccleanup:scleanup:acleanup" ? MojoTest.passed : "Lifecyle failed " + state);
		});
	}
});
