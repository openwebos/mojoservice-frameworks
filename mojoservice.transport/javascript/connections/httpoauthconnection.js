var HttpOAuthConnection = exports.HttpOAuthConnection = Class.create(HttpConnection,
{
	initialize: function(accessor)
	{
		this.accessor = accessor;
	},
	
	setForm: function(form)
	{
		this._form = form;
	},
	
	connect: function connect()
	{
		var message =
		{
			action: this._url,
			method: this._method,
			parameters: this._form ? this._form : this._body ? OAuth.decodeForm(this._body) : []
		};
		OAuth.completeRequest(message, this.accessor);
		this.setBody(OAuth.formEncode(message.parameters));
		return this.$super(connect)().then(this, function(future)
		{
			var response = future.result;
			try
			{
				response.responseMap = OAuth.getParameterMap(response.responseText);
			}
			catch (_)
			{
				// Not something parseable as an OAuth parameter map
			}
			future.result = response;
		});
	},
});
