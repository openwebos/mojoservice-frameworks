/* Open webOS MojoService Framework | Copyright 2009-2011 Hewlett-Packard Development Company, L.P. | openwebosproject.org | openwebosproject.org/license */
var IMPORTS = MojoLoader.require(
	{ name: "mojoservice", version: "1.0" }, 
	{ name: "mojoservice.transport", version: "1.0" }, 
	{ name: "foundations", version: "1.0" }, 
	{ name: "foundations.json", version: "1.0" },
	{ name: "foundations.io", version: "1.0" },
	{ name: "foundations.crypto", version: "1.0" }
);
var MojoService = IMPORTS["mojoservice"];
var Transport = IMPORTS["mojoservice.transport"];
var Foundations = IMPORTS["foundations"];
var FJSON = IMPORTS["foundations.json"];
var IO = IMPORTS["foundations.io"];
var Crypto = IMPORTS["foundations.crypto"];
var PalmCall = Foundations.Comms.PalmCall;
var AjaxCall = Foundations.Comms.AjaxCall;
var MD5 = Crypto.MD5.hex_md5;
var Class = Foundations.Class;
var Future = Foundations.Control.Future;
var DB = Foundations.Data.DB;
var TempDB = Foundations.Data.TempDB;
var SyncStatusManager=Transport.SyncStatusManager;
var Config = {
	//logs: "debug"		// used by utils.js to control logging
}; 
