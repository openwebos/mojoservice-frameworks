/*global include, MojoLoader, startApplicationLoop, quit, console, palmGetResource */

include("mojoloader.js");
var libraries = MojoLoader.require(
	{ name: "mojoservice", version: "1.0" },
	{ name: "foundations.json", version: "1.0" }
);
var AppController = libraries.mojoservice.AppController;
var Json = libraries["foundations.json"];

function validateConfig(fileName) {
	var configText = palmGetResource(fileName);
	var config = JSON.parse(configText);
	var v = Json.Schema.validate(config, AppController.prototype._configSchema);
	if (!v.valid) {
		console.error("Service configuration failed validation");
		for (var i=0; i < v.errors.length; i++) {
			var error = v.errors[i];
			console.error(error.property+' : '+error.message);
		}
		console.log("configuration failed validation");
	} else {
		console.log(fileName+"...OK");
	}	
}

function do_quit() {
	setTimeout(function() {
		console.log("quitting...");
		quit();
	}, 0);
}

function main(args) {
	startApplicationLoop();
	for (var i=0; i < args.length; i++) {
		var file = args[i];
		console.log("checking..."+file);
		validateConfig(file);
	}
	do_quit();
}
