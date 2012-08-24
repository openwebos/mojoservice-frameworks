# Services.json

The *services.json* file is in the root directory of a Mojo service, and describes how a services is constructed, and how it operates.  Generally, only a subset of this services.json file is required to correctly define a service.  Here we provide a reference for all properties defined in this file:

`{
	"description": <optional string>,
	"comment": <optional string>,
	"commandTimeout", <optional number>,
	"activityTimeout", <optional number>,
	"services":
	[
		{
			"name": <string>,
			"description": <optional string>,
			"comment": <optional string>,
			"assistant": <optional string>,
			"commandTimeout", <optional number>,
			"commands":
			[
				{
					"name": <string>,
					"description": <optional string>,
					"comment": <optional string>,
					"assistant": <string>,
					"public": <optional boolean>,
					"watch": <optional boolean>,
					"subscribe": <optional boolean>,
					"argsSchema": <optional string or object>,
					"returnSchema": <optional string or object>,
					"watchSchema": <optional string or object>,
					"subscribeSchema": <optional string or object>,
					"commandTimeout": <optional number>,
					"allowedAppIds: <optional array of strings>
				},
				<...more commands...>
			]
		},
		<...more services...>
	],
	"schemas": <optional object>
	{
		<schema name>: <schema>
	}
}`

## Application properties

The top level properties are the application properties.  These provide configuration for the overall application.

* description
	
	Is an optional property which should provide an informative description of this application.
	
* commandTimeout

	Defines the number of seconds commands should run before a timeout error is returned to the caller.  This can be overridden (see below).  If not defined, this defaults to 60 seconds.
	
* activityTimeout

	Defines the number of seconds the application continues run after the completion of the last activity, before it terminates.  Services do not run all the time, but launch when needed, and terminate when not in use.  Typically, a command is considered to be an activity, so the application will not terminate while a command is being processed.  It is also possible to have other non-command activities (e.g. background activities).  If not defined, this default to 60 seconds.
	
* services

	Defines an array of services being provided by this application.  Typically an application will only provide one service.  However, there may be reasons to provide multiple services within the same application (e.g. old API versions).  An application must define at least one service (since an application without services probably does not make sense).  The properties of a service are defined below.
	
* schemas

	This optional property contains an set of string/schema pairs.  See the separate section below on schemas.

## Service properties

Each application defines a number of services.

* name

	Is the name of the service on the Palm Message Bus.  All services **must** define a name.

* description

	Is an optional property which should provide an informative description of this service.

* assistant

	Is an optional property which defines the name of a class which should be instantiated to manage this service.
	
* commandTimeout

	Defines the number of seconds commands should run before a timeout error is returned to the caller.  This overrides any value defined at the application level for this service, but may be overridden in turn by a command (see below).  If not defined, this inherits the value defined for the application.

* commands

	Defines an array of commands being provided by this service.  A service may provide zero or more commands per service (a service with no commands may simply want to run once when the application is started).  The properties of a command are defined below.

## Command properties

Each service defines a number of commands.

* name

	Is the name of the command in this service.  All commands **must** define a name.

* description

	Is an optional property which should provide an informative description of this command.
	
* assistant

	Is an required property which defines the name of a class which should be instantiated to manage this command.  The command assistant's **run** method will ultimately be called to actually execute the command.
	
* public

	Is an optional property which defaults to *false*.  If *true*, this command should also be available on the public bus.

* watch

	Is an optional boolean value, which defaults to false if not present.  If defined to true, this command is watchable.  A watchable command has two return values to the caller.  The first return value is usual response to the command.  The second return value, which is sent sometime later, indicates that the command should be re-executed, because the value it returns may be different from the last time it was called.  This mechanism is similar to subscriptions, but is naturally rate-limited by the consumer of the service, resulting in less unnecessary bus traffic fewer application stampedes when service state changes. 
	
* subscribe

	Is an optional boolean value, which default to false if not present.  If defined to true, this command is subscribe-able.  A subscribe-able command returns a response as normal, but can then return 0 or more additional responses.  This mechanism is similar to *watch*, but is not naturally limited by the rate of consumption by the consumers, and should be used with care.

* argsSchema

	Is an optional property which defines the JSON schema to use to validate the incoming arguments for the command.  The property can either be a JSON schema (see [JSON Schema](http://groups.google.com/group/json-schema)) or a string.  If a string is used, this should match a property in the application level **schema** object.
	
* returnSchema

	Is an optional property which defines the JSON schema to use to validate the return value for the command (see **argsSchema** for more details).
	
* watchSchema

	Is an optional property which defines the JSON schema to use to validate the watch return value for the command (see **argsSchema** for more details).
	
* subscribeSchema

	Is an optional property which defines the JSON schema to use to validate the susbcription return values for the command (see **argsSchema** for more details).

* commandTimeout

	Defines the number of seconds this command should run before a timeout error is returned to the caller.  This overrides any value defined at the service or application level.  If not defined, this inherits the value defined by the service or the application.

* allowedAppIDs

	List of application IDs that will be allowed access to this command.

## Schemas

Command arguments may be optionally validated using a [JSON Schema](http://groups.google.com/group/json-schema).  If a schema is used, only commands which pass validation will be executed by the service.  Otherwise, schema errors are returned to the caller.

*  schema

	The schema property at the application level defines a set of string/schema pairs.  Each named schema can be referenced by zero or more commands using their **schema** property.  The value of the pair corresponds to a JSON schema which will be used for command validation.
