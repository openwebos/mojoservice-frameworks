/* Open webOS MojoService Framework | Copyright 2009-2011 Hewlett-Packard Development Company, L.P. | openwebosproject.org | openwebosproject.org/license */
/**
 * == MojoService ==
 *
 * MojoService is a collection of APIs and a structure for authoring Service
 * applications for webOS
 **/
/*global MojoLoader */

// Imports
var IMPORTS = MojoLoader.require(
	{ name: "foundations", version: "1.0" },
	{ name: "foundations.json", version: "1.0" }
);
var Foundations = IMPORTS.foundations;
var Json = IMPORTS["foundations.json"];

var Class = Foundations.Class;
var Future = Foundations.Control.Future;
var Activity = Foundations.Control.Activity;
var Assert = Foundations.Assert;
var PalmCall = Foundations.Comms.PalmCall;

if (!Function.prototype.bind) {  
	Function.prototype.bind = function(self)
	{
		var func = this;
		if (arguments.length == 1)
		{
			return function()
			{
				func.apply(self, arguments);
			};
		}
		else
		{
			var args = Array.prototype.slice.call(arguments, 1);
			return function()
			{
				func.apply(self, args.concat(Array.prototype.slice.call(arguments, 0)));
			};
		}
	};
};
