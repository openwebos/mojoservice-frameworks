/* Open webOS MojoService Framework | Copyright 2009-2012 Hewlett-Packard Development Company, L.P. | openwebosproject.org | openwebosproject.org/license */
var libs = MojoLoader.require(
{ name: "foundations", version: "1.0" }, 
{ name: "mojoservice", version: "1.0" },
{ name: "underscore", version: "1.0"} 
);
var Foundations = libs["foundations"];
var MojoService = libs["mojoservice"];
var Underscore = libs["underscore"];

// Propogate
exports.AppController = MojoService.AppController;

var Class = Foundations.Class;
var Future = Foundations.Control.Future;
var Queue = Foundations.Control.Queue;
var AjaxCall = Foundations.Comms.AjaxCall;
var PalmCall = Foundations.Comms.PalmCall;
var DB = Foundations.Data.DB;
var TempDB = Foundations.Data.TempDB;
var Activity = Foundations.Control.Activity;
var _ = Underscore._;
