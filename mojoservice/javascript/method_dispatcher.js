var MethodDispatcher;

var stringEndsWith = Foundations.StringUtils.endsWith;

if (typeof require !== "undefined") {
    var palmbus=require('palmbus');
    MethodDispatcher = Class.create(
    {
    	initialize: function(serviceName, publicBus) {
    	    var self = this;
    	    this._handle = new palmbus.Handle(serviceName, publicBus);
    	    this.functions = {};
    	    this._handle.addListener('request', function(message) {
    	       self._dispatchMessage(message);
    	    });
    	},

    	registerMethod: function(category, method, f) {
    	    var methodPath = this._normalizeMethodPath(category, method);
    	    this._handle.registerMethod(category, method);
    	    this.functions[methodPath] = f;
    	},

    	subscriptionAdd: function(key, message) {
    	    this._handle.subscriptionAdd(key, message);
    	},
    	
    	setCancelHandler: function(cancelFunction) {
    	    if (this._cancelFunction) {
    	        this._handle.removeListener('cancel', this._cancelFunction);
    	    }
    	    this._cancelFunction = cancelFunction;
    	    this._handle.addListener('cancel', cancelFunction);
    	},
    	
    	registerWithPalmCall: function() {
            PalmCall.register(this._handle);
    	},
    	
    	getHandle: function() {
    	    return this._handle;
    	},

	unregister: function() {
		this._handle.unregister();
	},

    	_normalizeMethodPath: function(category, method) {
    	    if (!stringEndsWith(category, "/")) {
    	        category += "/";
    	    }
    	    return category + method;
    	},

    	_dispatchMessage: function(message) {
    	    var methodPath = this._normalizeMethodPath(message.category(), message.method());
    	    var f = this.functions[methodPath];
    	    if (f) {
				ActivityManager.resetTimer(methodPath);
				f(message);
    	    }
    	}
    });
} else {
    var MethodDispatcher = Class.create(
    {
    	initialize: function(serviceName, publicBus) {
    	    this._handle = new webOS.Handle(serviceName, publicBus);
    	},

    	registerMethod: function(category, method, f) {
    	    this._handle.registerMethod(category, method, f);
    	},

    	subscriptionAdd: function(key, message) {
    	    this._handle.subscriptionAdd(key, message);
    	},

    	setCancelHandler: function(cancelFunction) {
    	    this._handle.setCancelHandler(cancelFunction);
    	},
    	
    	registerWithPalmCall: function() {
            PalmCall.register(this._handle);
    	},
    	
    	getHandle: function() {
    	    return this._handle;
    	},

    });
}

