// note that these error codes mirror those defined in Accounts.ui
// we should consolidate them at some point...
/*jslint immed:false, laxbreak:true */
/*global exports */

(function() {
	function TransportError (msg) {
		this.errorText = msg || "";
	}

	TransportError.prototype.errorCode = "UNKNOWN";

	TransportError.prototype.toString = function toString() {
		return "Error: " + this.errorCode + " - " + this.errorText;
	};

	var CODES =
	{	Authentication		: "401_UNAUTHORIZED"
	,	BadRequest			: "400_BAD_REQUEST"
	,	Duplicate			: "DUPLICATE_ACCOUNT"
	,	NoConnectivity		: "NO_CONNECTIVITY"
	,	Server				: "500_SERVER_ERROR"
	,	Timeout				: "408_TIMEOUT"
	,	Unavailable			: "503_SERVICE_UNAVAILABLE"
	,	NoCredentials		: "CREDENTIALS_NOT_FOUND"
	,	CommandTimeout		: "COMMAND_TIMEOUT"
	,	TimestampRefused	: "TIMESTAMP_REFUSED"
	,	AccountRestricted 	: "ACCOUNT_RESTRICTED"
	};

	function newErrorClass() {
		return function(){ TransportError.apply (this, arguments); };
	}

	var clas$;
	for (var type in CODES) {
		if (CODES.hasOwnProperty (type)) {
			clas$						= newErrorClass();			// Create new error type. 
			clas$.prototype				= new TransportError();		// Extend base TransportError type.
			clas$.prototype.errorCode	= CODES [type];				// Set errorCode for all instances.
			exports [type + "Error"]	= clas$;					// Publish new error type.
		}
	}
	exports.TransportError = TransportError;	// Publish the base TransportError type to allow instanceof on error subtypes.
})();
