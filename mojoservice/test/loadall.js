var loadall;
var exports = exports || {};
var root = root || {};
if (!loadall)
{
	loadall = true;
	var manifest = eval('(' + palmGetResource("manifest.json") + ')');
	var files = manifest.files.javascript;
	for (var i = 0; i < files.length; i++)
	{
		include("javascript/" + files[i]);
	} 
}
