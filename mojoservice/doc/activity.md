# Activities

Every service, if it is not idle, contains a set of **activities**.  Activities generally fall into two categories:

1. Foreground activities - associated with active commands.
2. Background activities - not associated with active commands (though probably triggered by one).

All incoming commands are allocated an activity which remains *running* until the command completes.  In most cases, it is unnecessary for the service to manipulate the activity directly.

If a service creates some background task (e.g. a command triggers a background sync), it will be necessary to create an activity to associate with that task.  If this does not happen, the service might appear *idle* (no activities exist in any state) in which case it may terminate.

### ActivityManager API

* **getActivity(id)**

	Get the activity given its *id*. If no *id* is given, a new activity is created and allocated an internal id.  Getting an activity (whether it is created or not) does not increase its reference count.

### Activity API

* **id**

	The *id* of this activity.

* **ref**

	Increase the reference count on this activity.  If an application contains any activities with positive reference counts, then the application is *running* and will not be terminated.

* **deref**

	Decreases the reference count on this activity.  If an application contains no activities with positive reference counts, the application may be terminated.

* **cancel**

	Cancels an activity.  This reduces the reference count to zero immediately.