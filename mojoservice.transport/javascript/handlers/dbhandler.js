/*global DB, exports, Class, Handler */
var DbHandler = exports.DbHandler = Class.create(Handler,
{
	get: function(ids)
	{
		return DB.get(ids).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	put: function(objects)
	{
		return DB.put(objects).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	merge: function(objects)
	{
		return DB.merge(objects).then(function(future) {
			future.result=future.result.results;
		});
	},
	
	find: function(query)
	{
		return DB.find(query).then(function(future) {
			var result = future.result.results;
			if (future.result.count) {
			  result.count = future.result.count;
			}
			if (future.result.next) {
				result.next = future.result.next;
			}
			future.result=result;
		});
	},
	
	del: function(idsOrQuery, purge)
	{
		return DB.del(idsOrQuery, purge).then(function(future) {
			//console.log("deleted..."+JSON.stringify(idsOrQuery));
			var result;
			if (future.result.results) {
				result = future.result.results.length;
			} else {
				result = future.result.count;
			}
			future.result=result;
		});
	},
	
	reserveIds: function(count)
	{
		return DB.reserveIds(count).then(function(future) {
		  future.result = future.result.ids;
		});
	},
	
	putKind: function(id, owner, indexes)
	{
		return DB.putKind(id, owner, indexes).then(function(future) {
		  future.result = (future.result.returnValue===true);
		});
	},
	
	delKind: function(id)
	{
		return DB.delKind(id).then(function(future) {
		  future.result = (future.result.returnValue===true);
		});
	}
});
