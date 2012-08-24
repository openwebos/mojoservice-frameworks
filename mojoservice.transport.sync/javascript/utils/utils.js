/*jslint bitwise: true, devel: true, eqeqeq: true, immed: true, maxerr: 500, newcap: true,
nomen: false, onevar: true, plusplus: true, regexp: true, undef: true, white: false */

/*global _, exports: true, ObjectUtils, stringify */

var Utils = exports.Utils = {
	
	log: function () {
		var argsArr = Array.prototype.slice.call(arguments, 0);
		Utils._logBase("log", argsArr);
	},

	warn: function () {
		var argsArr = Array.prototype.slice.call(arguments, 0);
		Utils._logBase("warn", argsArr);
	},

	error: function () {
		var argsArr = Array.prototype.slice.call(arguments, 0);
		Utils._logBase("error", argsArr);
	},

	debug: function() {
		if (Config && Config.logs === "debug") {
			var argsArr = Array.prototype.slice.call(arguments, 0);
			Utils._logBase("log", argsArr);
		}
	},
	
	_logBase: function (method, argsArr) {
		var data = argsArr.reduce(function (accumulatedMessage, curArg) {
			if (typeof curArg === "string") {
				return accumulatedMessage + curArg;
			} else {
				return accumulatedMessage + JSON.stringify(curArg);
			}
		}, "");
			
		if (Config && Config.logs === "verbose") {
			// I want ALL my logs!
			data = data.split("\n");
			var i, pos, datum;
			for (i = 0; i < data.length; ++i) {
				datum = data[i];
				if (datum.length < 500) {
					console[method](datum);
				} else {
					// Do our own wrapping
					for (pos = 0; pos < datum.length; pos += 500) {
						console[method](datum.slice(pos, pos + 500));
					}
				}
			}
		} else {
			console[method](data);
		}
	}
}