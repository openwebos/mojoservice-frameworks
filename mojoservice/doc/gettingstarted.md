# MojoService:  Getting Started

MojoService provide a standard way to build Javascript based services under Mojo.  This framework does much of the heavy lifting required to manage a service in Mojo, including the service creation, command dispatch, exception handling, orderly shutdown, and activity management.

## A Simple Service


A simple service consists of a set of javascript files, as well as two JSON configuration files.  The JSON files are:

* sources.json

* services.json

In this example, we have one Javascript file:

* helloworld.js

### sources.json

The *sources.json* file in Mojo Service is the equivalent to that in Mojo Applications; it declares what source files should be loaded into the current service.  A simple sources.json file might look as follows:

	[
		{ "source": "helloworld.js" }
	]

### services.json

The *services.json* file defines what services are provided on the Palm bus by the Mojo Service.  Typically, a Mojo Service will only provide a single service with multiple method calls.  A simple services.json file might look as follows:

	{
		"services":
		[
			{
				"name": "com.palm.service.helloworld",
				"commands":
				[
					{
						"name": "hello",
						"assistant": "HelloCommandAssistant"
					}
				]
			}
		]
	}

This file defines a single service called *com.palm.service.helloworld*.  This service defines a single command method called *hello*.  When this command is called (by someone making a call on the Palm message bus), an instance of the Javascript type *HelloCommandAssistant* will be created to perform the command.

### helloworld.js

The *helloworld.js* file in this example, defines a single command assistant (*HelloWorldAssistant*) which is used to execute the command.  The code looks like this:

	var HelloCommandAssistant = Class.create(
	{
		run: function(future)
		{
			future.result = { reply: "Hello " + this.controller.args.msg };
		}
	});

As with Mojo Applications, each command consists of a *controller* and an *assistant*.  The controller is provided by the Mojo Service framework and manages the common aspects of command execution.  The *assistant* is provided by the service, and manages the command specific aspects of execution.  The assistant is executed via the *run* method, and in the above, we return an object containing a single property *reply*.  This is a string constructed by reading the *msg* property of the incoming arguments (the incoming arguments are held in the *args* property of the *controller*).

To call this service we might do the following:

	luna-send -n 1 palm://com.palm.service.helloworld/hello '{"msg":"world"}'
	
And we would get the response:

	.... { "reply": "Hello world", "returnValue": true }
	
*returnValue* is automatically set to *true* by the framework because a result was returned.  If an exception had occurred, this would have been returned to the caller, and *returnValue* would be set to *false*.

