exports.HandlerFactoryBuilder = function(handlerClazz)
{
	return (
	{
		getHandler: function(command)
		{
			return new handlerClazz(command);
		}
	});
}