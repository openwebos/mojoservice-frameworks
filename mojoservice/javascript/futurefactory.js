var FutureFactory = Class.create(
{
	initialize: function()
	{
		this._pending = [];
	},
	
	get: function()
	{
		var f = new Future();
		if (this._callback)
		{
			f.then(this._scope, this._callback);
		}
		else
		{
			this._pending.push(f);
		}
		return f;
	},
	
	_activate: function(scope, callback)
	{
		this._scope = scope;
		this._callback = callback;
		while ((p = this._pending.shift()) != undefined)
		{
			p.then(scope, callback);
		}
	},
});