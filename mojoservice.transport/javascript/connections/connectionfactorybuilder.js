exports.ConnectionFactoryBuilder = function(connectionClazz)
{
	return (
	{
		getConnection: function(command)
		{
			return new connectionClazz();
		}
	});
}
