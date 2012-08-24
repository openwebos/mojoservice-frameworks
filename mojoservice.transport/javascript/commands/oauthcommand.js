exports.OAuthCommand = new Class.create(Command,
{
	requestToken: function(method, url, params)
	{
		var connection = this.connection;
		connection.recycle();
		connection.setURL(url);
		connection.setMethod(method);
		connection.setForm(params || {});
		return connection.connect().then(this, function(future)
		{
			var response = future.result;
			connection.accessor.token = response.responseMap.oauth_token;
			connection.accessor.tokenSecret = response.responseMap.oauth_token_secret;
			future.result = response;
		});
	}
});
