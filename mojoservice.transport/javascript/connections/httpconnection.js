var HttpConnection = exports.HttpConnection = Class.create(Connection,
{
	setURL: function(url)
	{
		this._url = url;
	},
	
	setMethod: function(method)
	{
		this._method = method;
	},
	
	setBody: function(body)
	{
		this._body = body;
	},
	
	setOptions: function(options)
	{
		var that = this;
		if (!this._options)
		{
			this._options = {};
		}
		if (options) {
			Object.keys(options).forEach(function (optionName) {
				that._options[optionName] = options[optionName];
			});
		}
	},
	
	setRequestHeaders: function(headers)
	{
		if (!this._requestheaders)
		{
			this._requestheaders = {};
		}
		for (var k in headers)
		{
			this._requestheaders[k] = headers[k];
		}
	},
	
	connect: function()
	{
		var options = this._options || {};
		var headers = this._requestheaders;
		if (headers) {
			if (!options.headers) {
				options.headers = {};
			}
			Object.keys(headers).forEach(function (requestHeaderName) {
				var header = headers[requestHeaderName];
				//console.log("Setting header "+requestHeaderName+" : "+header);
				options.headers[requestHeaderName] = header;
			});
		}
		
		return AjaxCall.call(this._method, this._url, this._body, options);
	},
	
	recycle: function()
	{
		delete this._url;
		delete this._method;
		delete this._body;
		delete this._options;
		delete this._requestheaders;
	}
});
