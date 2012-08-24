var OAuth;

exports.HttpOAuthConnectionFactoryBuilder = function(accessor)
{
	// Load the OAuth support on first use
	if (!OAuth)
	{
		OAuth = MojoLoader.require({ name: "foundations.crypto", version: "1.0" })["foundations.crypto"].OAuth;
	}
 	return (
	{
		getConnection: function(command)
		{
			return new HttpOAuthConnection(accessor);
		}
	});
}