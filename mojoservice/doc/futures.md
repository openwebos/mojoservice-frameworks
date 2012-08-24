# Futures

A **future** is a mechanism to manage the return of asynchronous results to callers.  Traditionally this has been handled using function callbacks; but this is not a particularly flexible mechanism, nor does it handle failures and exceptions well.  Futures provides a standard mechanism for dealing with asynchronous results and exceptions.

### What is a Future?

Consider the following example of a future:

	var f = Foundations.Comms.AjaxCall.get("http://www.foobar.com/theAnswer");
	f.then(this, function(future)
	{
		try
		{
			this.answer = future.result.responseJSON;
		}
		catch (e)
		{
			console.log(e.stack);
		}
	});

In this simple example, we make an Ajax call to retrieve a resource and, once that result has been returned, set the *answer* property to the JSON we get back.  To make this happen, the following steps occur:

1. The *AjaxCall* creates a future and returns it to the caller.  At some point in, either now or later, it will set the result of that future.
2. The caller gets the returned future and calls the *then* method on it.  This method registers a context (i.e. *this*) and a function which will be executed then the future has a result set.
3. When the result is set, the function registered is called, with the *this* set to the context.  The future being triggered is passed in as the only argument.  Note, that if the result had been set before the *then* method is called, the registered function will be immediately called.
4. In the registered function, the result of the future is retrieved by reading the **result** property.  If the future contained an exception, rather than returning this, the exception is rethrown here.  In this example, it is caught and the stack trace printed to the console.

## Future API

A new future is created as follows:

	var future = new Foundations.Control.Future();

Each instant of a future provides the following API:

* **then(scope, function)**

	Register a scope/function for execution when a result or exception is set on the future.  Multiple **thens** can be registered, and they will be ordered in the future in the same order they were registered.  One **then** function will be called per result/exception set on the future, the next **then** being called when the next result/exception is set.
	
	The function registered in the **then** should take the form:
	
		function myThenFunc(future) { .... }
		
	The future passed as the argument is the one which triggered the function call (so allowing the same function to be used in different futures). The function is executed in the scope passed.  If any exceptions are thrown in this function, if not otherwise handled, will be caught by the future and passed to subsequent **then** handlers.
	
* **nest(innerfuture)**

	Nest a future inside this one.  This is useful when one future contains many other futures (e.g. when a future is created, which contains a number of database operations, each of which returns a future).  When the *inner-future* completes, any results it contained are propagated to the outer-future.
	
* **now(scope, function)**

	Calls the scope/function immediately in the scope of the future.  Semantically, this behaves like **then** except the the function is immediately executed rather than waiting for a result to be assigned to the future.  This is generally useful if the programmer wants to capture any exceptions the **now** function might generate, and assign them to the future.

* **callback(scope, function)**

	This wraps and returns the scope/function pair in a new function.  Generally, this is used to interface the Futures mechanism to the common function callback schemes used by Ajax and HTML5 Databases.  
	
	For example, the callback function for an Ajax call is wrapped in a *future.callback* so we can easily use exceptions to report error conditions from the Ajax call:
	
		new Ajax.Request(url,
		{
			onSuccess: future.callback(this, function(response)
			{
				future.result = response;
			}),
			onFailure: future.callback(this, function(response)
			{
				throw new Error(response.status + ": " + response.statusText);
			}),
		});

* **cancel()**

	Cancel any pending result or exception. The future is marked as cancelled only if there was already a result/exception pending.

* **status()**

	Returns the current status for the future.  The states are:
	
	* *cancelled* - A pending result or exception was cancelled.
		
	* *exception* - An exception is pending.
		
	* *none* - No result, exception, or cancellation is pending.
		
	* *result* - A result is pending.
	
* **onError(func)**

	Used to define a **future** wide error handler.  This overrides the default error handling in a future (which passes the exception through to the next **then** clause).  Instead, all errors are passed to the function defined using **onError**.  The passed function takes the form:

		function myErrorFunc(future) { ... }

* **result**

	When written, sets the result of the future.  If there is at least one **then** pending, this will be scheduled for execution.
	When read, this either returns the last result set on the future, or if an exception is pending, rethrows the exception.

* **exception**

	When written, set an exception for this future.  If there is at least one **then** pending, this will be scheduled for execution.
	When read, reads any pending exception for this future.  The exception is *not* thrown (as it is for **result**).