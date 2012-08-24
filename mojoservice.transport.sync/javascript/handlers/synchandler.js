/*global exports, Class, Transport, Future, console */
/*
 * The SyncHandler provide all the infrastructure to synchronize content to the database.
 * A handler is created and given two types, the native database type, and the associated transport
 * database type.
 * The SyncHandler is used in association with the SyncCommand, and provides all the necessary DB operations
 * for that comment.
 */
exports.SyncHandler = function(kinds)
{
	return Class.create(Transport.DbHandler,
	{
		// can return "undefined" for account transport object. Clients will need to detect that
		getAccountTransportObject: function(accountId)
		{
			//console.log(">>>getTransportObject: accountId="+accountId+", kind="+kinds.account.metadata_id);
			return this.find({ from: kinds.account.metadata_id, where: [{ prop: "accountId", op: "=", val: accountId }] }).then(this, function(future)
			{
				var transport = future.result[0];
				future.result = transport;
			});
		},

		putAccountTransportObject: function(transport)
		{
			return this.getAccountTransportObject(transport.accountId).then(this, function(future) {
				transport._rev = future.result._rev;
				future.nest(this.put([ transport ]));
			});
		},

		updateAccountTransportObject: function(transport, updates) {
			return this.getAccountTransportObject(transport.accountId).then(this, function(future) {
				updates._id = future.result._id;
				future.nest(DB.merge([ updates ]));
			});
		},
		
		/*
		 * Get object pairs { local, remote } by the remote id.  The remote id is that used to associate an local
		 * object with its server equivalent.
		 */
		getObjectsByRid: function(rids, name)
		{
			//console.log(">>>getObjectsByRid: kind="+name);
			function getMetadataObjectsThenMergeThem(object_kind, metadata_kind) {
				return function(future) {
					var objs=[];
					var rmap={};
					var f = this.find({ from: metadata_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId},{ prop: "rid", op: "=", val: rids }] }).then(this, function(future) {
						if (future.result.length) {
							objs = future.result;
						}
						return objs;
					}).then(this, function(future) {
						// create mapping from localId->remoteId
						var lids=[];
						for (var i=0; i < objs.length; i++) {
							var o = objs[i];
							rmap[o.lid]=o.rid;
							lids[i]=o.lid;
						}
						// find local objects matching remote objects
						return this.find({ from: object_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId},{ prop: "_id", op: "=", val: lids }] });
					}).then(this, function(future) {
						// merge remoteIds from metadata objects
						var locals = future.result;
						var updates = [];
						for (var i=0; i < locals.length; i++) {
							var l = locals[i];
							var id = l._id;
							if (!l.remoteId) {
								var remoteId = rmap[id];
								if (remoteId) {
									updates.push({
										_id: id,
										remoteId: remoteId
									});
								}
							}
						}
						return this.merge(updates);
					}).then(this, function(future) {
						// delete and purge the metadata objects, we won't be needing them again
						return this.del({ from: metadata_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId},{ prop: "rid", op: "=", val: rids }] }, true);
					});
					return f;
				};
			}
			function getObjects(object_kind) {
				//console.log(">>>getObjects("+object_kind+")");
				return function(future) {
					var rmap = {};
					rids.forEach(function(rid)
					{
						rmap[rid] = null;
					});
					this.find({ from: object_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId},{ prop: "remoteId", op: "=", val: rids }] }).then(this, function(future2) 
					{
						if (future2.exception) {
							console.error("getObjects: exception raised, but I'm ignoring it:"+future2.exception);
							future.result = future.result;
							return;
						}
						var results = [];
						future2.result.forEach(function(result)
						{
							// mapping remote->local
							results.push({ local: result, remote: { remoteId: result.remoteId } });
							delete rmap[result.remoteId];
						});
						// Create mappings for new objects
						for (var key in rmap)
						{
							if (rmap.hasOwnProperty(key)) {
								// mapping remote->new object
								results.push({ local: {_kind: object_kind, remoteId: key}, remote: { remoteId: key } });
							}
						}
						future.result = results;
					});
				};
			}
			var object_kind = kinds.objects[name].id;
			var metadata_kind = kinds.objects[name].metadata_id;
			var f = new Future(true);
			if (metadata_kind) {
				f.then(this, getMetadataObjectsThenMergeThem(object_kind, metadata_kind));
			}
			f.then(this, getObjects(object_kind));
			return f;
		},
		/*
		 * Get local objects which have changed since the given 'rev'
		 */
		getChangedObjects: function(rev, name)
		{
			//console.log(">>>getChangedObjects rev="+rev+", kind="+JSON.stringify(name));
			function getChanged(object_kind) {
				return function(future) {
					console.log(">>>getChanged object_kind: "+object_kind+", _rev: "+rev);
					future.nest(this.find({ from: object_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId},{ prop: "_rev", op: ">", val: rev }], incDel: true}).then(this, function(future2)
					{
						if (future2.exception) {
							console.error("getObjects: exception raised, but I'm ignoring it:"+future2.exception);
							future2.result = future2.result;
							return;
						}
						var results = [];
						future2.result.forEach(function(result)
						{
							if (result.remoteId) {
								// mapping local->remote
								results.push({ local: result, remote: {remoteId: result.remoteId} });
							} else {
								// Create mappings for new objects
								results.push({ local: result, remote: {} });
							}
						});
						results.sort(function(a, b) {
							if (a.local._rev > b.local._rev) {
								return 1;
							} else if (a.local._rev < b.local._rev) {
								return -1;
							} else {
								return 0;
							}
						});
						future2.result = results;
					}));
				};
			}			
			var f = new Future(true);
			var object_kind = kinds.objects[name].id;
			f.then(this, getChanged(object_kind));
			return f;
		},

		getLatestRev: function(name) {
			var object_kind = kinds.objects[name].id;
			var f = this.find({ from: object_kind, where: [{ prop: "accountId", op: "=", val: this.command.client.clientId}], orderBy: "_rev", desc: true, limit: 1});
			f.then(function (future)
			{
				var result = future.getResult();
				if (result && result.length)
				{
					future.result = result[0]._rev;
				}
				else
				{
					future.result = 0;
				}
			});
			return f;
		},

		/*
		 * Put the object pairs { local, transport } to the database.
		 * Delete pairs which are marked as 'delete'.
		 * returns an object containing the {id, rev} pairs for all modified objects, and [id, id] for deleted records
		 * {
		 *   put: [{id: id1, rev: rev1}...],
		     deleted: [id1, id2, id3]
		 * }
		 */
		putObjects: function(objects)
		{
			// Calculate number of ids we need
			var count = 0;
			var saved = [];
			var deleted = [];
			var accountId = this.command.client.clientId;
			var scope = this;
			objects.forEach(function(obj)
			{
				if (obj.operation == "save" && !obj.local._id)
				{
					count++;
				}
			});
			console.log(">>>>>putObjects, count="+count);
			// Get the ids
			var f = this.reserveIds(count);
			
			f.then(function(future)
			{
				console.log("return from reserveIds()");
				var ids = future.result;
				var i = 0;
				// Create an array of items we need to save and delete, and allocate new ids
				// where necessary. 
				objects.forEach(function(obj)
				{
					switch (obj.operation)
					{
						case "save":
							saved.push(obj.local);
							if (!obj.local._id)
							{
								obj.local._id = ids[i++];
								obj.local.accountId = accountId;
							}
							break;
							
						case "delete":
							deleted.push(obj.local._id);
							break;
					}
				});
				
				f.nest(scope.del(deleted, false));
			});
			
			f.then(function(future)
			{
				console.log("return from del()");
				var result = future.result;
				f.nest(scope.put(saved));
			});
			
			f.then(function(future)
			{
				console.log("return from put()");
				var result = future.result;
				future.result = {
					"put": result,
					"deleted": deleted
				};
			});
			
			return f;
		},
		
		/*
		 * Put transport objects to the database.
		 */
		putTransportObjects: function(objs, kindName)
		{
			return this.put(objs);
		},
		
		/*
		 * Create a new account.
		 */
		createAccount: function()
		{
			//console.log(">>> createAccount");
			var accountId = this.command.client.clientId;
			// note that the modnum is set to 0 here, but gets reset in enableAccount
			return this.put([{ _kind: kinds.account.metadata_id, accountId: accountId, modnum: 0, syncKey: {}, extras: {}, initialSync: true }]).then(function(future)
			{
				future.result = true;
			});
		},
		
		/*
		 * Enable an account.
		 */
		enableAccount: function(extras)
		{
			//console.log(">>> enableAccount");
			var accountId = this.command.client.clientId;
			// find the account transport object
			return this.getAccountTransportObject(accountId).then(this, function(future)
			{
				var result = future.result;
				if (result) {
					//this is the normal case - just pass the result on
					future.result = result;
				} else {
					//if we're doing this after a restore, and the account transport object wasn't backed up, 
					//then we need to create one and fetch it.
					console.warn("enableAccount: unable to retrieve account object to enable account, creating one");
					return this.createAccount().then(this, function(innerFuture)
					{
						innerFuture.getResult();
						return this.getAccountTransportObject(accountId);
					});
				}
			}).then(this, function(future)
			{
				//now, either way, we should have an account transport object
				var result = future.result;
				if (result) {
					var newFields = {
						_id: result._id,
						extras: extras
					};
					if (result.modnum === 0) {  // this is an initial Sync situation: enable/disable, or newly created account
						newFields.syncKey = null;
						newFields.initialSync = true;
					}
					future.nest(this.merge([newFields]).then(this, function(future2) {
						//reset modnum to match current DB revision
						newFields.modnum = future2.result[0].rev;
						console.log(">>> Reset modnum to "+newFields.modnum);
					
						if (result.modnum === 0) {  // this is an initial Sync situation: enable/disable, or newly created account
							//set the syncKey to {} instead of the null above so that it's an empty object in the db
							//disableAccount clears is, but if the transport object was backed up and restored, it won't 
							//be empty, so we clear it again here to be safe.
							newFields.syncKey = {};
						}
					
						future2.nest(this.merge([newFields]));
					}).then(function(future) {
						return (result.modnum === 0);
					}));
				} else {
					console.warn("enableAccount: unable to create account object to enable account");
					future.result = false;
				}
			});
		},
		
		/*
		 * Disable an account.
		 */
		disableAccount: function()
		{
			//console.log(">>> disableAccount");
			var accountId = this.command.client.clientId;
			var extras = null;
			// find the account
			function delKind(kind) {
				return function(future) {
					console.log("delKind: "+kind);
					// delete objects via merge so we can set the _del property AND preventSync
					// preventSync:true is an indicator that the object was deleted as a result of disabling the account
					// this is used in synchandler.js to avoid upsyncing these deletes!
					var f2 = DB.merge({ from: kind, where: [ { prop: "accountId", op: "=", val: accountId } ] }, {"_del": true, preventSync: true});
					f2.then(function() {
						if (f2.exception) {
							console.error("delKind: exception raised, but I'm ignoring it:"+f2.exception);
						}
						f2.result=true;
					});
					future.nest(f2);
				};
			}
			var f = this.getAccountTransportObject(accountId).then(this, function(future)
			{
				var result = future.result;
				if (result) {
					extras = result.extras;
					var updatedTransportObject = {
						_kind: result._kind,
						_id: result._id,
						_rev: result._rev,
						accountId: result.accountId,
						modnum: 0, // will be set correctly in enableAccount
						syncKey: {},
						extras: {}
					};
					future.nest(this.put([updatedTransportObject]).then(function(future2) {
						future2.getResult();
						future2.result = true;
					}));
				} else {
					console.warn("disableAccount: unable to retrieve account object to disable it");
					future.result = false;
				}
			});
			
			// Remove the sync object kinds
			var syncOrder = kinds.syncOrder;
			for (var i=0; i<syncOrder.length; i++) {
				var syncObject = syncOrder[i];
				var object_kind = kinds.objects[syncObject].id;
				f.then(this, delKind(object_kind));
			}
			f.then(function(future)
			{
				//console.log("setting final result");
				future.result = extras;
			});
			return f;
		},
		
		/*
		 * Delete all objects associated with this account.
		 */
		deleteAccount: function()
		{
			//console.log(">>> deleteAccount");
			var accountId = this.command.client.clientId;
			return this.del({ from: kinds.account.metadata_id, where: [ { prop: "accountId", op: "=", val: accountId } ] }, false);
		},
		
		getObjectKinds: function() 
		{
			return kinds;
		},
		
		/*
		 * Given an array of ids will get the records from the database
		 */
		getLatestRevForObjects: function(objs, object_kind) {
			var oids = [],
				f;
			
			objs.forEach(function(obj){
				oids.push(obj._id);
			});
			f = this.find({ from: object_kind, where: [{prop:"_id", op: "=", val: oids}]});
			return f;
		}

	});
};